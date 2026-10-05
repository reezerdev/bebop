import { useAdminRows } from "../hooks/use-admin-rows.js";
import { usePageRowPermissions, useRowReadPermissions } from "../hooks/use-row-permissions.js";
import { RelatedCollectionLabels } from "../components/related-labels.js";
import { formatCell } from "../components/cell.js";
import { SelectionCheckbox } from "../components/common.js";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useDb } from "jazz-tools/react";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { BebopAdminCollection, BebopAdminManifest, BebopAdminStoredField } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table.js";

import { useToastManager } from "../../../components/ui/toast.js";

import { MediaPreview } from "../../upload.js";
import type { BebopAdminClient, BebopAdminProps } from "../types.js";
import type { AdminRecord, AdminDatabase, RelationOption } from "../data-access.js";
import { getTable, getMutations } from "../data-access.js";
import { defaultPageSize, filterAllValue } from "../constants.js";
import { formatDate, humanize, selectLabel, valueFor, collectionTitleFields, recordTitle, fieldByName, storedFields } from "../record-values.js";

export function CollectionList({ app, client, collection, manifest, relationOptions, relationOptionLoaders, selectMode = false, onSelect, onCreate }: { app: object; client: BebopAdminClient; collection: BebopAdminCollection; manifest: BebopAdminManifest; relationOptions?: BebopAdminProps["relationOptions"]; relationOptionLoaders?: BebopAdminProps["relationOptionLoaders"]; selectMode?: boolean; onSelect?: (row: AdminRecord) => void; onCreate?: () => void }) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({
    field: collection.defaultColumns[0] ?? "id",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllCheckbox = useRef<HTMLInputElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => collection.defaultColumns.length
    ? [...collection.defaultColumns]
    : storedFields(collection).slice(0, 4).map((field) => field.name));
  const [pendingDelete, setPendingDelete] = useState<AdminRecord[] | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [relatedOptions, setRelatedOptions] = useState<Record<string, readonly RelationOption[]>>({});
  const onRelatedOptions = useCallback((slug: string, options: readonly RelationOption[]) => {
    setRelatedOptions((current) => {
      const previous = current[slug];
      if (previous?.length === options.length && previous.every((option, index) => option.id === options[index].id && option.name === options[index].name)) return current;
      return { ...current, [slug]: options };
    });
  }, []);
  const displayRelationOptions = useMemo(() => ({ ...relatedOptions, ...relationOptions }), [relatedOptions, relationOptions]);
  const filterFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind === "boolean" || field.kind === "select");
  const filterWhere = useMemo(() => Object.fromEntries(filterFields.flatMap((field) => {
    const value = filters[field.name];
    if (!value) return [];
    return [[field.storageName, field.kind === "boolean" ? value === "true" : value]];
  })), [collection, filters]);
  const searchActive = Boolean(committedSearch.trim());
  const sortField = fieldByName(collection, sort.field);
  const defaultSortField = fieldByName(collection, collection.defaultColumns[0] ?? "");
  const storedSortField = sortField && sortField.kind !== "join"
    ? sortField.storageName
    : sort.field === "id" ? "id" : defaultSortField?.kind !== "join" ? defaultSortField?.storageName ?? "id" : "id";
  const { rows: rowResult, hasNextPage } = useAdminRows(client, collection.slug, {
    where: filterWhere,
    sort: { field: storedSortField, direction: sort.direction },
    page, pageSize, searchActive, search: committedSearch, searchFields: collection.listSearchableFields,
    writeMode: collection.writeMode,
  });
  const { data, isLoading: rowsLoading, error: rowsError } = rowResult;
  const rows = data ?? [];
  const readPermissions = useRowReadPermissions(db, table, rows);
  // A command row returned by the remote query has already passed Jazz's
  // server-side read policy. Local permission advice can lag that result.
  const readableRows = collection.writeMode === "command" ? rows : rows.filter((row) => readPermissions[row.id] !== "denied");
  const allColumns = storedFields(collection).map((field) => field.name);
  const columns = allColumns.filter((column) => visibleColumns.includes(column));
  const relatedIdsByCollection = new Map<string, Set<string>>();
  const titleFields = collectionTitleFields(collection);
  for (const column of [...new Set([...columns, ...(searchActive ? collection.listSearchableFields : [])])]) {
    const field = fieldByName(collection, column);
    if ((field?.kind !== "relation" && field?.kind !== "upload") || !field.relationTo || !manifest.collections[field.relationTo] || relationOptions?.[field.relationTo]) continue;
    const ids = relatedIdsByCollection.get(field.relationTo) ?? new Set<string>();
    for (const row of readableRows) {
      const id = valueFor(field, row);
      if (typeof id === "string" && id) ids.add(id);
    }
    relatedIdsByCollection.set(field.relationTo, ids);
  }
  const pageRows = readableRows;
  const rowPermissions = usePageRowPermissions(db, table, pageRows, collection.writeMode);
  const selectablePageRows = pageRows.filter((row) => rowPermissions[row.id]?.update !== "denied" || rowPermissions[row.id]?.delete !== "denied");
  const deletablePageRows = pageRows.filter((row) => rowPermissions[row.id]?.delete !== "denied");
  const allPageSelected = selectablePageRows.length > 0 && selectablePageRows.every((row) => selectedIds.has(row.id));
  const somePageSelected = selectablePageRows.some((row) => selectedIds.has(row.id));
  const selectedRows = readableRows.filter((row) => selectedIds.has(row.id));
  const selectedDeletableRows = selectedRows.filter((row) => rowPermissions[row.id]?.delete !== "denied");
  const titleField = titleFields.find((field) => field.kind === "text") ?? titleFields[0];
  const searchField = titleFields.find((field) => field.kind === "text") ?? fieldByName(collection, collection.listSearchableFields[0] ?? "");
  const searchLabel = searchField?.label ?? "Name";
  const linkedColumn = columns[0];

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [search, filters]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setCommittedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, pageSize, sort]);
  useEffect(() => {
    if (selectAllCheckbox.current) selectAllCheckbox.current.indeterminate = somePageSelected && !allPageSelected;
  }, [allPageSelected, somePageSelected]);

  useEffect(() => {
    const defaults = collection.defaultColumns.length
      ? [...collection.defaultColumns]
      : storedFields(collection).slice(0, 4).map((field) => field.name);
    setVisibleColumns(defaults);
    setSort({ field: defaults[0] ?? "id", direction: "asc" });
    setSelectedIds(new Set());
    setPage(1);
    setPageSize(defaultPageSize);
  }, [collection]);

  function toggleSort(field: string) {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) selectablePageRows.forEach((row) => next.delete(row.id));
      else selectablePageRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  const pendingTitle = pendingDelete?.length === 1
    ? recordTitle(collection, pendingDelete[0], displayRelationOptions) ?? pendingDelete[0].id
    : "";
  const rangeStart = rows.length ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = rows.length ? rangeStart + rows.length - 1 : 0;
  const isLoading = rowsLoading || search !== committedSearch;
  const error = rowsError;

  return (
    <div>
      {[...relatedIdsByCollection].map(([slug, ids]) => (
        <RelatedCollectionLabels
          key={slug}
          app={app}
          client={client}
          collection={manifest.collections[slug]}
          ids={[...ids].sort()}
          relationOptions={displayRelationOptions}
          relationOptionLoaders={relationOptionLoaders}
          onChange={onRelatedOptions}
        />
      ))}
      <div className="mb-4 flex flex-wrap items-center justify-start gap-3">
        <h1 className="text-[32px] font-normal leading-tight tracking-tight">{collection.labels.plural}</h1>
        <Button variant="secondary" size="xs" className="text-[13px] font-normal normal-case tracking-normal" onClick={() => selectMode ? onCreate?.() : navigate(`/admin/collections/${collection.slug}/create`)}>Create New</Button>
        {!selectMode && selectedRows.length > 0 && <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Selected documents">
          <span>{selectedRows.length} selected</span>
          <span aria-hidden="true">—</span>
          {selectablePageRows.length > 0 && <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={togglePageSelection}>{allPageSelected ? "Clear selection" : `Select all (${selectablePageRows.length})`}</button>}
          <span aria-hidden="true">—</span>
          <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedRows.length !== 1 || selectedRows[0] === undefined || rowPermissions[selectedRows[0].id]?.update === "denied"} onClick={() => {
            const row = selectedRows[0];
            if (row) navigate(`/admin/collections/${collection.slug}/${encodeURIComponent(row.id)}`);
          }}>Edit</button>
          {selectedDeletableRows.length > 0 && <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={() => { setDeleteError(undefined); setOperationError(undefined); setPendingDelete(selectedDeletableRows); }}>Delete</button>}
        </div>}
      </div>
      {operationError && <p className="mb-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{operationError}</p>}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-none bg-muted/50 p-2 max-md:items-stretch max-md:[&>div:first-child]:basis-full max-md:[&>div:last-child]:ml-auto">
        {collection.listSearchableFields.length > 0 && <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search by ${searchLabel}`} className="bebop-admin-search-input h-8 text-[13px] focus-visible:bg-background" aria-label={`Search by ${searchLabel}`} />
        </div>}
        <div className="flex shrink-0 items-center gap-2">
          <details className="relative [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden">
            <summary className="flex h-8 cursor-pointer items-center gap-2 rounded-none bg-secondary px-3 text-[13px] text-secondary-foreground hover:bg-accent">Columns <ChevronDown size={15} /></summary>
            <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] min-w-52 overflow-y-auto rounded-none border border-border bg-popover p-2 text-popover-foreground shadow-lg">
              <p className="mb-1 px-2 py-1 text-xs font-medium text-muted-foreground">Visible columns</p>
              {allColumns.map((column) => {
                const field = fieldByName(collection, column);
                const checked = visibleColumns.includes(column);
                return (
                  <label key={column} className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm hover:bg-accent [&_input]:accent-primary">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && visibleColumns.length === 1}
                      onChange={() => setVisibleColumns((current) => checked ? current.filter((name) => name !== column) : [...current, column])}
                    />
                    <span>{field?.label ?? humanize(column)}</span>
                  </label>
                );
              })}
            </div>
          </details>
          {filterFields.length > 0 && <details className="relative [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden">
            <summary className="flex h-8 cursor-pointer items-center gap-2 rounded-none bg-secondary px-3 text-[13px] text-secondary-foreground hover:bg-accent">Filters <ChevronDown size={15} /></summary>
            <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] min-w-52 overflow-y-auto rounded-none border border-border bg-popover p-2 text-popover-foreground shadow-lg flex max-h-[70vh] w-64 flex-col gap-3 overflow-y-auto">
              {filterFields.map((field) => (
                <label key={field.name} className="flex flex-col gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                  <span>{field.label}</span>
                  <Select
                    value={filters[field.name] || filterAllValue}
                    onValueChange={(value) => setFilters((current) => ({
                      ...current,
                      [field.name]: value === filterAllValue ? "" : value ?? "",
                    }))}
                  >
                    <SelectTrigger className="w-full" aria-label={`Filter by ${field.label}`}>
                      <SelectValue>{filters[field.name]
                        ? field.kind === "boolean" ? filters[field.name] === "true" ? "Yes" : "No" : selectLabel(field, filters[field.name])
                        : `All ${field.label.toLocaleLowerCase()}`}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={filterAllValue}>All {field.label.toLocaleLowerCase()}</SelectItem>
                      {field.kind === "boolean" ? (
                        <><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></>
                      ) : field.options?.map((option) => <SelectItem key={option} value={option}>{selectLabel(field, option)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </div>
          </details>}
        </div>
      </div>
        {error ? (
          <div className="py-12 text-center text-sm text-destructive">Could not load this collection: {error.message}</div>
        ) : isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading documents…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <h2 className="text-sm font-medium">{readableRows.length ? "No matching documents" : rows.length ? "No readable documents" : "No documents yet"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{readableRows.length ? "Try changing your search or filters." : rows.length ? "Jazz denied read access for the available documents." : `Create your first ${collection.labels.singular.toLocaleLowerCase()} to get started.`}</p>
            {!rows.length && <Button variant="secondary" className="mt-4 font-normal normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}/create`)}><Plus size={16} /> Create New</Button>}
          </div>
        ) : (
          <div className="min-w-0 w-full [&_[data-slot=table-container]]:min-w-0 [&_[data-slot=table]]:text-[13px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {!selectMode && <TableHead className="w-12">
                    <SelectionCheckbox ref={selectAllCheckbox} aria-label="Select all documents on this page" checked={allPageSelected} disabled={selectablePageRows.length === 0} onChange={togglePageSelection} />
                  </TableHead>}
                  {columns.map((column) => {
                    const field = fieldByName(collection, column);
                    const active = sort.field === column;
                    const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <TableHead key={column} className="h-10 text-[13px] font-normal normal-case tracking-normal">
                        <button className="inline-flex items-center gap-2 font-normal text-muted-foreground hover:text-foreground" onClick={() => toggleSort(column)}>
                          {field?.label ?? humanize(column)}<SortIcon size={13} />
                        </button>
                      </TableHead>
                    );
                  })}
                  {collection.timestamps && <TableHead className="h-10 text-[13px] font-normal normal-case tracking-normal">Updated</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow><TableCell colSpan={columns.length + (collection.timestamps ? 1 : 0) + (selectMode ? 0 : 1)} className="py-8 text-center text-sm text-muted-foreground">No documents on this page.</TableCell></TableRow>
                ) : pageRows.map((row, rowIndex) => (
                  <TableRow key={row.id} className={`${selectedIds.has(row.id) ? "bg-accent" : rowIndex % 2 === 0 ? "bg-muted/50 hover:bg-muted" : "hover:bg-muted/50"} ${selectMode ? "cursor-pointer" : ""}`} onClick={selectMode ? () => onSelect?.(row) : undefined}>
                    {!selectMode && <TableCell className="w-12" onClick={(event) => event.stopPropagation()}>
                      <SelectionCheckbox
                        aria-label={`Select ${recordTitle(collection, row, displayRelationOptions) ?? row.id}`}
                        checked={selectedIds.has(row.id)}
                        disabled={rowPermissions[row.id]?.update === "denied" && rowPermissions[row.id]?.delete === "denied"}
                        onChange={() => toggleRowSelection(row.id)}
                      />
                    </TableCell>}
                    {columns.map((column) => {
                      const field = fieldByName(collection, column);
                      const value = field ? valueFor(field, row) : row[column];
                      const isTitle = linkedColumn === column;
                      const displayValue = formatCell(field, value, displayRelationOptions);
                      return (
                        <TableCell key={column} className={`whitespace-normal py-4 align-top ${isTitle ? "font-medium" : ""}`}>
                          {isTitle && selectMode ? (
                            <button type="button" className="inline-flex min-w-0 items-center gap-3 text-left" onClick={(event) => { event.stopPropagation(); onSelect?.(row); }}>
                              {collection.upload && <MediaPreview client={client} collection={collection.slug} id={row.id} filename={String(row.filename ?? "")} mimeType={String(row.mimeType ?? "")} compact />}
                              <span className="underline underline-offset-2 hover:text-primary">{displayValue}</span>
                            </button>
                          ) : isTitle ? (
                            <Link to={`/admin/collections/${collection.slug}/${row.id}`} className="underline underline-offset-2 hover:text-primary">
                              {displayValue}
                            </Link>
                          ) : displayValue}
                        </TableCell>
                      );
                    })}
                    {collection.timestamps && <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.$updatedAt, true)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-4 pt-5 text-xs text-muted-foreground">
              <span>{rangeStart}–{rangeEnd}{hasNextPage ? "+" : ""}</span>
              <div className="flex items-center justify-end gap-2">
                <span className="mr-1">Per Page:</span>
                <Select value={String(pageSize)} onValueChange={(value) => { if (value) { setPageSize(Number(value)); setPage(1); } }}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={16} /></Button>
                <Button variant="ghost" size="icon" aria-label="Next page" disabled={!hasNextPage} onClick={() => setPage((current) => current + 1)}><ChevronRight size={16} /></Button>
              </div>
            </div>
          </div>
        )}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) { setDeleteError(undefined); setPendingDelete(null); }
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-documents-title"
            aria-describedby="delete-documents-description"
            className="w-full max-w-md rounded-none border bg-background p-6 shadow-xl"
          >
            <h2 id="delete-documents-title" className="font-heading text-lg font-semibold uppercase tracking-wide">Delete {pendingDelete.length === 1 ? "document" : "documents"}?</h2>
            <p id="delete-documents-description" className="mt-2 text-sm text-muted-foreground">
              {pendingDelete.length === 1 ? <>Delete “{pendingTitle}”?</> : `Delete ${pendingDelete.length} selected documents?`} This action cannot be undone.
            </p>
            {deleteError && <p className="mt-3 text-sm text-destructive" role="alert">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" autoFocus onClick={() => { setDeleteError(undefined); setPendingDelete(null); }}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void (async () => {
                    const operations = getMutations(client, collection.slug);
                    if (!table || !operations) return;
                    const deletedIds: string[] = [];
                    let allGlobal = true;
                    const clearDeletedSelection = () => setSelectedIds((current) => {
                      const next = new Set(current);
                      deletedIds.forEach((id) => next.delete(id));
                      return next;
                    });
                    for (const row of pendingDelete) {
                      try {
                        const advice = collection.writeMode === "command" ? "unknown" : await db.canDelete(table, row.id);
                        if (advice === "denied") throw new Error("Your current session cannot delete one or more selected documents.");
                        const result = await operations.delete(row.id) as { durability?: string };
                        if (result.durability !== "global") allGlobal = false;
                        deletedIds.push(row.id);
                      } catch (error) {
                        const localWriteApplied = error instanceof Error && "localWriteApplied" in error;
                        const writeAccepted = error instanceof Error && "writeAccepted" in error && (error as Error & { writeAccepted?: boolean }).writeAccepted;
                        if (localWriteApplied || writeAccepted) {
                          deletedIds.push(row.id);
                          if (writeAccepted) allGlobal = true;
                        }
                        clearDeletedSelection();
                        if (deletedIds.length) {
                          setPendingDelete(null);
                          setOperationError(`${deletedIds.length} document${deletedIds.length === 1 ? "" : "s"} deleted${allGlobal ? "" : " locally"} before this operation stopped. ${error instanceof Error ? error.message : "The remaining documents could not be deleted."}`);
                          toast.add({
                            type: allGlobal ? "error" : "warning",
                            title: `${deletedIds.length} document${deletedIds.length === 1 ? "" : "s"} deleted${allGlobal ? "" : " locally"}`,
                            description: "The remaining documents could not be deleted.",
                          });
                        } else {
                          setDeleteError(error instanceof Error ? error.message : "The selected documents could not be deleted.");
                          toast.add({ type: "error", title: "Could not delete documents", description: error instanceof Error ? error.message : "The selected documents could not be deleted." });
                        }
                        return;
                      }
                    }
                    clearDeletedSelection();
                    setDeleteError(undefined);
                    setPendingDelete(null);
                    toast.add({
                      type: "success",
                      title: `${deletedIds.length} document${deletedIds.length === 1 ? "" : "s"} deleted${allGlobal ? "" : " locally"}`,
                      description: allGlobal ? "Jazz confirmed the changes." : "Jazz sync may still be pending.",
                    });
                  });
                }}
              >
                <Trash2 size={15} /> Delete {pendingDelete.length === 1 ? "document" : "documents"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
