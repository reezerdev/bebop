import { useAdminRows } from "../hooks/use-admin-rows.js";
import { usePageRowPermissions, useRowReadPermissions } from "../hooks/use-row-permissions.js";
import { RelatedCollectionLabels } from "../components/related-labels.js";
import { formatCell } from "../components/cell.js";
import { SelectionCheckbox } from "../components/common.js";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useDb } from "jazz-tools/react";

import type { PermissionAdvice } from "jazz-tools";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { BebopAdminCollection, BebopAdminJoinField, BebopAdminManifest, BebopAdminStoredField } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table.js";

import type { BebopAdminClient, BebopAdminProps } from "../types.js";
import type { AdminDatabase } from "../data-access.js";
import { getTable } from "../data-access.js";

import { formatDate, humanize, valueFor, recordTitle, fieldByName, storedFields } from "../record-values.js";

export function JoinFieldPanel({ app, client, manifest, source, field, parentId, parentLabel, relationOptions, relationOptionLoaders }: {
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  source: BebopAdminCollection;
  field: BebopAdminJoinField;
  parentId: string;
  parentLabel: string;
  relationOptions?: BebopAdminProps["relationOptions"];
  relationOptionLoaders?: BebopAdminProps["relationOptionLoaders"];
}) {
  const navigate = useNavigate();
  const db = useDb() as AdminDatabase;
  const target = manifest.collections[field.collection];
  const relation = target?.fields.find((candidate): candidate is BebopAdminStoredField =>
    candidate.kind === "relation" && candidate.name === field.on && candidate.relationTo === source.slug,
  );
  const targetTable = getTable(app, field.collection);
  const columnsAvailable = target ? storedFields(target) : [];
  const defaultColumns = useMemo(() => {
    const columns = target ? storedFields(target) : [];
    const configured = field.admin?.defaultColumns ?? target?.defaultColumns;
    const valid = configured?.filter((name) => columns.some((candidate) => candidate.name === name));
    return valid?.length ? valid : columns.slice(0, 4).map((candidate) => candidate.name);
  }, [field.admin?.defaultColumns, target]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultColumns);
  const [loadedRelationOptions, setLoadedRelationOptions] = useState<Record<string, readonly { id: string; name: string }[]>>({});
  const onRelatedOptions = useCallback((slug: string, options: readonly { id: string; name: string }[]) => {
    setLoadedRelationOptions((current) => {
      const previous = current[slug];
      if (previous?.length === options.length && previous.every((option, index) => option.id === options[index].id && option.name === options[index].name)) return current;
      return { ...current, [slug]: options };
    });
  }, []);
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: defaultColumns[0] ?? "id", direction: "asc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const selectAllCheckbox = useRef<HTMLInputElement>(null);
  const [createAdvice, setCreateAdvice] = useState<PermissionAdvice>("unknown");
  const where = useMemo(() => relation ? { [relation.storageName]: parentId } : {}, [parentId, relation]);
  const sortField = target ? fieldByName(target, sort.field) : undefined;
  const storedSortField = sortField && sortField.kind !== "join" ? sortField.storageName : "id";
  const { rows: rowResult, hasNextPage } = useAdminRows(client, field.collection, {
    where,
    sort: { field: storedSortField, direction: sort.direction },
    page,
    pageSize: 25,
    searchActive: false,
    enabled: Boolean(target && relation && targetTable),
    writeMode: target?.writeMode,
  });
  const { data, isLoading: rowsLoading, error: rowsError } = rowResult;
  const rows = data ?? [];
  const readPermissions = useRowReadPermissions(db, targetTable, rows);
  const readableRows = target?.writeMode === "command" ? rows : rows.filter((row) => readPermissions[row.id] !== "denied");
  const rowPermissions = usePageRowPermissions(db, targetTable, readableRows, target?.writeMode ?? "direct");
  const selectableRows = readableRows.filter((row) => rowPermissions[row.id]?.update !== "denied" || rowPermissions[row.id]?.delete !== "denied");
  const selectedRows = readableRows.filter((row) => selectedIds.has(row.id));
  const allRowsSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.id));
  const someRowsSelected = selectableRows.some((row) => selectedIds.has(row.id));
  const allColumns = columnsAvailable.map((candidate) => candidate.name);
  const visible = allColumns.filter((name) => visibleColumns.includes(name));
  const displayRelationOptions = useMemo(() => ({ ...loadedRelationOptions, ...relationOptions }), [loadedRelationOptions, relationOptions]);
  const titleRelationNames = typeof target?.useAsTitle === "string" ? [target.useAsTitle] : target?.useAsTitle ?? [];
  const relationIdsByCollection = new Map<string, Set<string>>();
  for (const column of new Set([...visible, ...titleRelationNames])) {
    const candidate = fieldByName(target ?? source, column);
    if ((candidate?.kind !== "relation" && candidate?.kind !== "upload") || !candidate.relationTo || relationOptions?.[candidate.relationTo]) continue;
    const ids = relationIdsByCollection.get(candidate.relationTo) ?? new Set<string>();
    for (const row of readableRows) {
      const id = valueFor(candidate, row);
      if (typeof id === "string" && id) ids.add(id);
    }
    relationIdsByCollection.set(candidate.relationTo, ids);
  }
  const linkedColumn = visible[0];
  const readDenied = target?.writeMode !== "command" && rows.some((row) => readPermissions[row.id] === "denied");
  const createAllowed = field.admin?.allowCreate !== false;

  useEffect(() => {
    setVisibleColumns(defaultColumns);
    setSort({ field: defaultColumns[0] ?? "id", direction: "asc" });
    setSelectedIds(new Set());
    setPage(1);
  }, [defaultColumns]);

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [parentId, sort]);
  useEffect(() => { if (!rowsLoading && rows.length === 0 && page > 1) setPage((current) => current - 1); }, [page, rows.length, rowsLoading]);

  useEffect(() => {
    if (selectAllCheckbox.current) selectAllCheckbox.current.indeterminate = someRowsSelected && !allRowsSelected;
  }, [allRowsSelected, someRowsSelected]);

  function toggleAllRows() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allRowsSelected) selectableRows.forEach((row) => next.delete(row.id));
      else selectableRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    if (!createAllowed || !targetTable || !relation) {
      setCreateAdvice("denied");
      return;
    }
    setCreateAdvice("unknown");
    void db.canInsert(targetTable, { [relation.storageName]: parentId }).then((advice) => {
      if (active) setCreateAdvice(advice);
    }).catch(() => {
      if (active) setCreateAdvice("unknown");
    });
    return () => { active = false; };
  }, [createAllowed, db, parentId, relation, targetTable]);

  const contextualQuery = new URLSearchParams({
    bebopJoin: `${source.slug}.${field.name}`,
    bebopParent: parentId,
  }).toString();
  const targetCollection = target;

  return (
    <section className="mt-8 border-t pt-6">
      {[...relationIdsByCollection].map(([slug, ids]) => {
        const relatedCollection = manifest.collections[slug];
        return relatedCollection ? <RelatedCollectionLabels
          key={slug}
          app={app}
          client={client}
          collection={relatedCollection}
          ids={[...ids].sort()}
          relationOptions={displayRelationOptions}
          relationOptionLoaders={relationOptionLoaders}
          onChange={onRelatedOptions}
        /> : null;
      })}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">{field.label}</h2>
        <div className="flex items-center gap-2">
          {selectedRows.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Selected related records">
            <span>{selectedRows.length} selected</span>
            <span aria-hidden="true">—</span>
            <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={toggleAllRows}>{allRowsSelected ? "Clear selection" : `Select all (${selectableRows.length})`}</button>
            <span aria-hidden="true">—</span>
            <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedRows.length !== 1} onClick={() => {
              const row = selectedRows[0];
              if (row) navigate(`/admin/collections/${field.collection}/${encodeURIComponent(row.id)}?${contextualQuery}`);
            }}>Edit</button>
          </div>}
          {createAllowed && <Button
            variant="secondary"
            size="sm"
            disabled={createAdvice === "denied"}
            onClick={() => navigate(`/admin/collections/${field.collection}/create?${contextualQuery}`)}
          ><Plus size={15} /> Add New</Button>}
          <details className="relative [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden">
            <summary className="flex h-8 cursor-pointer items-center gap-2 rounded-none bg-secondary px-3 text-[13px] text-secondary-foreground hover:bg-accent">Columns <ChevronDown size={15} /></summary>
            <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] min-w-52 overflow-y-auto rounded-none border border-border bg-popover p-2 text-popover-foreground shadow-lg">
              <p className="mb-1 px-2 py-1 text-xs font-medium text-muted-foreground">Visible columns</p>
              {allColumns.map((column) => {
                const candidate = fieldByName(targetCollection!, column);
                const checked = visibleColumns.includes(column);
                return <label key={column} className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm hover:bg-accent [&_input]:accent-primary">
                  <input type="checkbox" checked={checked} disabled={checked && visibleColumns.length === 1} onChange={() => setVisibleColumns((current) => checked ? current.filter((name) => name !== column) : [...current, column])} />
                  <span>{candidate?.label ?? humanize(column)}</span>
                </label>;
              })}
            </div>
          </details>
        </div>
      </div>
      {createAllowed && createAdvice === "denied" && <p className="mb-3 text-sm text-muted-foreground" role="status">Your current session cannot add records to this list.</p>}
      {rowsError ? (
        <div className="py-10 text-center text-sm text-destructive">Could not load related documents: {rowsError.message}</div>
      ) : rowsLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading {targetCollection?.labels.plural.toLocaleLowerCase() ?? "records"}…</div>
      ) : !targetCollection || !relation ? (
        <div className="py-10 text-center text-sm text-destructive">The generated join relation is missing or invalid.</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium">{rows.length ? "No matching documents" : `No ${targetCollection.labels.plural.toLocaleLowerCase()} yet`}</p>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length ? "Try another search." : `Records related to this ${source.labels.singular.toLocaleLowerCase()} will appear here.`}</p>
        </div>
      ) : (
        <div className="min-w-0 border border-border bg-muted/50">
          <div className="min-w-0 w-full [&_[data-slot=table-container]]:min-w-0 [&_[data-slot=table]]:text-[13px]">
            <Table>
              <TableHeader><TableRow><TableHead className="w-12"><SelectionCheckbox ref={selectAllCheckbox} aria-label={`Select all ${targetCollection.labels.plural.toLocaleLowerCase()}`} checked={allRowsSelected} disabled={selectableRows.length === 0} onChange={toggleAllRows} /></TableHead>{visible.map((column) => {
                const candidate = fieldByName(targetCollection, column);
                const activeSort = sort.field === column;
                const SortIcon = activeSort ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
                return <TableHead key={column} className="h-10 text-[13px] font-normal normal-case tracking-normal">
                  <button className="inline-flex items-center gap-2 font-normal text-muted-foreground hover:text-foreground" onClick={() => setSort((current) => ({ field: column, direction: current.field === column && current.direction === "asc" ? "desc" : "asc" }))}>
                    {candidate?.label ?? humanize(column)}<SortIcon size={13} />
                  </button>
                </TableHead>;
              })}{targetCollection.timestamps && <TableHead className="h-10 text-[13px] font-normal normal-case tracking-normal">Updated</TableHead>}</TableRow></TableHeader>
              <TableBody>{readableRows.length === 0
                ? <TableRow><TableCell colSpan={visible.length + (targetCollection.timestamps ? 1 : 0) + 1} className="py-8 text-center text-sm text-muted-foreground">{readDenied ? "No readable documents." : "No documents to display."}</TableCell></TableRow>
                : readableRows.map((row) => <TableRow key={row.id} className={selectedIds.has(row.id) ? "bg-accent" : "hover:bg-muted"}>
                    <TableCell className="w-12"><SelectionCheckbox aria-label={`Select ${recordTitle(targetCollection, row, displayRelationOptions) ?? row.id}`} checked={selectedIds.has(row.id)} disabled={rowPermissions[row.id]?.update === "denied" && rowPermissions[row.id]?.delete === "denied"} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /></TableCell>
                    {visible.map((column) => {
                      const candidate = fieldByName(targetCollection, column);
                      const value = candidate ? valueFor(candidate, row) : row[column];
                      const displayValue = candidate?.kind === "relation" && candidate.name === field.on && value === parentId
                        ? parentLabel
                        : formatCell(candidate, value, displayRelationOptions);
                      return <TableCell key={column} className="whitespace-normal py-4 align-top">
                        {column === linkedColumn
                          ? <Link to={`/admin/collections/${field.collection}/${encodeURIComponent(row.id)}?${contextualQuery}`} className="underline underline-offset-2 hover:text-primary">{displayValue}</Link>
                          : displayValue}
                      </TableCell>;
                    })}
                    {targetCollection.timestamps && <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.$updatedAt, true)}</TableCell>}
                  </TableRow>)}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between px-3 py-3 text-xs text-muted-foreground">
              <span>{rows.length ? `${(page - 1) * 25 + 1}–${(page - 1) * 25 + rows.length}${hasNextPage ? "+" : ""}` : "0"}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous related records page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={16} /></Button>
                <Button variant="ghost" size="icon" aria-label="Next related records page" disabled={!hasNextPage} onClick={() => setPage((current) => current + 1)}><ChevronRight size={16} /></Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
