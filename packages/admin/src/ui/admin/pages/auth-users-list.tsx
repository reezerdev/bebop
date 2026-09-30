import { PageTitle, SelectionCheckbox } from "../components/common.js";
import { formatCell } from "../components/cell.js";
import { useRef, useState, useEffect } from "react";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { BebopAdminCollection, BebopAdminStoredField } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table.js";

import { useToastManager } from "../../../components/ui/toast.js";

import type { BebopAdminProps } from "../types.js";

import { defaultPageSize, filterAllValue } from "../constants.js";
import { formatDate, humanize, selectLabel, fieldByName } from "../record-values.js";

export function AuthUsersList({ collection, authClient, canManageUsers }: {
  collection: BebopAdminCollection;
  authClient?: BebopAdminProps["authClient"];
  canManageUsers: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>(() => ({ field: collection.defaultColumns.find((column) => column !== "id") ?? "name", direction: "asc" }));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => (collection.defaultColumns.length ? [...collection.defaultColumns] : ["name", "email", "role", "createdAt"]).filter((column) => column !== "id"));
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());
  const [pendingUserDelete, setPendingUserDelete] = useState<readonly (Record<string, unknown> & { id: string })[]>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deletingUsers, setDeletingUsers] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{ users: readonly (Record<string, unknown> & { id: string })[]; total: number }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const selectAllCheckbox = useRef<HTMLInputElement>(null);
  const searchableField = collection.listSearchableFields.includes("name") ? "name" : "email";
  const columns = visibleColumns.length ? visibleColumns : ["name"];
  const availableColumns = collection.fields.filter((field): field is BebopAdminStoredField => field.name !== "id" && field.kind !== "join" && (!field.generated || ["createdAt", "updatedAt"].includes(field.name))).map((field) => field.name);
  const filterFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind === "boolean" || field.kind === "select");
  const activeFilterField = Object.keys(filters).find((field) => Boolean(filters[field]));
  const activeFilterValue = activeFilterField ? filters[activeFilterField] : undefined;

  useEffect(() => {
    if (!canManageUsers || !authClient) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(undefined);
    void authClient.admin.listUsers({
      query: {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sortBy: sort.field,
        sortDirection: sort.direction,
        ...(activeFilterField && activeFilterValue !== undefined ? { filterField: activeFilterField, filterValue: activeFilterValue === "true" ? true : activeFilterValue === "false" ? false : activeFilterValue, filterOperator: "eq" as const } : {}),
        ...(search.trim() ? { searchValue: search.trim(), searchField: searchableField, searchOperator: "contains" as const } : {}),
      },
    }).then((response) => {
      if (currentRequest !== requestId.current) return;
      if (response.error) {
        setError(response.error.message || "Better Auth could not list users.");
        setResult(undefined);
        return;
      }
      setResult(response.data ? { users: response.data.users, total: response.data.total } : { users: [], total: 0 });
    }).catch((caught: unknown) => {
      if (currentRequest !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Better Auth could not list users.");
      setResult(undefined);
    }).finally(() => {
      if (currentRequest === requestId.current) setLoading(false);
    });
    return () => { requestId.current += 1; };
  }, [activeFilterField, activeFilterValue, authClient, canManageUsers, page, pageSize, reloadCount, search, searchableField, sort]);

  const users = result?.users ?? [];
  const selectedUsers = users.filter((user) => selectedUserIds.has(user.id));
  const allPageUsersSelected = users.length > 0 && users.every((user) => selectedUserIds.has(user.id));
  const somePageUsersSelected = users.some((user) => selectedUserIds.has(user.id));
  useEffect(() => {
    if (selectAllCheckbox.current) selectAllCheckbox.current.indeterminate = somePageUsersSelected && !allPageUsersSelected;
  }, [allPageUsersSelected, somePageUsersSelected]);
  useEffect(() => { setSelectedUserIds(new Set()); }, [activeFilterField, activeFilterValue, page, pageSize, search, sort]);

  if (!canManageUsers) {
    return <section><PageTitle title={collection.labels.plural} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Only a Better Auth administrator can view registered users.</p></section>;
  }
  if (!authClient) {
    return <section><PageTitle title={collection.labels.plural} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Pass a Better Auth client configured with adminClient() to enable user management.</p></section>;
  }

  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  function toggleAllPageUsers() {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (allPageUsersSelected) users.forEach((user) => next.delete(user.id));
      else users.forEach((user) => next.add(user.id));
      return next;
    });
  }

  async function confirmUserDelete() {
    if (!pendingUserDelete || !authClient) return;
    setDeletingUsers(true);
    setDeleteError(undefined);
    const removedIds: string[] = [];
    let failure: string | undefined;
    for (const user of pendingUserDelete) {
      try {
        const response = await authClient.admin.removeUser({ userId: user.id });
        if (response.error || !response.data?.success) throw new Error(response.error?.message || "Better Auth could not delete this user.");
        removedIds.push(user.id);
      } catch (caught) {
        failure = caught instanceof Error ? caught.message : "Better Auth could not delete this user.";
        break;
      }
    }
    if (removedIds.length) {
      setSelectedUserIds((current) => {
        const next = new Set(current);
        removedIds.forEach((id) => next.delete(id));
        return next;
      });
      const remainingTotal = Math.max(0, total - removedIds.length);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(remainingTotal / pageSize))));
      setReloadCount((current) => current + 1);
    }
    setDeletingUsers(false);
    if (failure && !removedIds.length) {
      setDeleteError(failure);
      toast.add({ type: "error", title: "Could not delete users", description: failure });
      return;
    }
    setPendingUserDelete(undefined);
    if (failure) {
      toast.add({ type: "warning", title: `${removedIds.length} user${removedIds.length === 1 ? "" : "s"} deleted`, description: failure });
    } else {
      toast.add({ type: "success", title: `${removedIds.length} user${removedIds.length === 1 ? "" : "s"} deleted`, description: "Better Auth removed the accounts and their sessions." });
    }
  }
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-start gap-3">
        <h1 className="text-[32px] font-normal leading-tight tracking-tight">{collection.labels.plural}</h1>
        <Button variant="secondary" size="xs" className="text-[13px] font-normal normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}/create`)}>Create New</Button>
        {selectedUsers.length > 0 && <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Selected users">
          <span>{selectedUsers.length} selected</span>
          <span aria-hidden="true">—</span>
          <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={toggleAllPageUsers}>{allPageUsersSelected ? "Clear selection" : `Select all (${users.length})`}</button>
          <span aria-hidden="true">—</span>
          <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedUsers.length !== 1} onClick={() => {
            const selectedUser = selectedUsers[0];
            if (selectedUser) navigate(`/admin/collections/${collection.slug}/${encodeURIComponent(selectedUser.id)}`);
          }}>Edit</button>
          <button type="button" className="cursor-pointer bg-transparent text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" onClick={() => { setDeleteError(undefined); setPendingUserDelete(selectedUsers); }}>Delete</button>
        </div>}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-none bg-muted/50 p-2 max-md:items-stretch max-md:[&>div:first-child]:basis-full max-md:[&>div:last-child]:ml-auto">
        {collection.listSearchableFields.length > 0 && <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder={`Search by ${searchableField === "name" ? "name" : "email"}`}
            aria-label="Search users"
            className="h-8 pl-10 text-[13px] focus-visible:bg-background"
          />
        </div>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <details className="relative [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden">
            <summary className="flex h-8 cursor-pointer items-center gap-2 rounded-none bg-secondary px-3 text-[13px] text-secondary-foreground hover:bg-accent">Columns <ChevronDown size={15} /></summary>
            <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] min-w-52 overflow-y-auto rounded-none border border-border bg-popover p-2 text-popover-foreground shadow-lg">
              <p className="mb-1 px-2 py-1 text-xs font-medium text-muted-foreground">Visible columns</p>
              {availableColumns.map((column) => {
                const checked = visibleColumns.includes(column);
                return <label key={column} className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 text-sm hover:bg-accent [&_input]:accent-primary">
                  <input type="checkbox" checked={checked} disabled={checked && visibleColumns.length === 1} onChange={() => setVisibleColumns((current) => checked ? current.filter((name) => name !== column) : [...current, column])} />
                  <span>{fieldByName(collection, column)?.label ?? humanize(column)}</span>
                </label>;
              })}
            </div>
          </details>
          {filterFields.length > 0 && <details className="relative [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden">
            <summary className="flex h-8 cursor-pointer items-center gap-2 rounded-none bg-secondary px-3 text-[13px] text-secondary-foreground hover:bg-accent">Filters <ChevronDown size={15} /></summary>
            <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] min-w-52 overflow-y-auto rounded-none border border-border bg-popover p-2 text-popover-foreground shadow-lg flex max-h-[70vh] w-64 flex-col gap-3 overflow-y-auto">
              {filterFields.map((field) => <label key={field.name} className="flex flex-col gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                <span>{field.label}</span>
                <Select value={filters[field.name] || filterAllValue} onValueChange={(value) => { setFilters((current) => ({ ...current, [field.name]: value === filterAllValue ? "" : value ?? "" })); setPage(1); }}>
                  <SelectTrigger className="w-full" aria-label={`Filter by ${field.label}`}><SelectValue>{filters[field.name] ? field.kind === "boolean" ? filters[field.name] === "true" ? "Yes" : "No" : selectLabel(field, filters[field.name]) : `All ${field.label.toLocaleLowerCase()}`}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={filterAllValue}>All {field.label.toLocaleLowerCase()}</SelectItem>
                    {field.kind === "boolean" ? <><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></> : field.options?.map((option) => <SelectItem key={option} value={option}>{selectLabel(field, option)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>)}
            </div>
          </details>}
        </div>
      </div>
      {error && <p role="alert" className="mb-4 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {deleteError && <p role="alert" className="mb-4 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{deleteError}</p>}
      <div className="min-w-0 w-full [&_[data-slot=table-container]]:min-w-0 [&_[data-slot=table]]:text-[13px]">
        <Table>
          <TableHeader><TableRow><TableHead className="w-12"><SelectionCheckbox ref={selectAllCheckbox} aria-label="Select all users on this page" checked={allPageUsersSelected} disabled={!users.length} onChange={toggleAllPageUsers} /></TableHead>{columns.map((name) => {
            const active = sort.field === name;
            const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return <TableHead key={name} className="h-10 text-[13px] font-normal normal-case tracking-normal"><button className="inline-flex items-center gap-2 font-normal text-muted-foreground hover:text-foreground" onClick={() => { setSort((current) => ({ field: name, direction: current.field === name && current.direction === "asc" ? "desc" : "asc" })); setPage(1); }}>{fieldByName(collection, name)?.label ?? humanize(name)}<SortIcon size={13} /></button></TableHead>;
          })}{collection.timestamps && <TableHead className="h-10 text-[13px] font-normal normal-case tracking-normal">Updated</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {result?.users.map((user, index) => <TableRow key={user.id} className={`${selectedUserIds.has(user.id) ? "bg-accent" : index % 2 === 0 ? "bg-muted/50 hover:bg-muted" : "hover:bg-muted/50"}`}>
              <TableCell className="w-12"><SelectionCheckbox aria-label={`Select ${String(user.name ?? user.email ?? user.id)}`} checked={selectedUserIds.has(user.id)} onChange={() => setSelectedUserIds((current) => { const next = new Set(current); if (next.has(user.id)) next.delete(user.id); else next.add(user.id); return next; })} /></TableCell>
              {columns.map((name) => <TableCell key={name} className="whitespace-normal py-4 align-top">
                {name === columns[0]
                  ? <Link to={`/admin/collections/${collection.slug}/${encodeURIComponent(user.id)}`} className="underline underline-offset-2 hover:text-primary">{formatCell(fieldByName(collection, name), user[name])}</Link>
                  : formatCell(fieldByName(collection, name), user[name])}
              </TableCell>)}
              {collection.timestamps && <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(user.updatedAt, true)}</TableCell>}
            </TableRow>)}
            {!loading && result?.users.length === 0 && <TableRow><TableCell colSpan={columns.length + Number(collection.timestamps) + 1} className="py-8 text-center text-sm text-muted-foreground">No users found.</TableCell></TableRow>}
            {loading && !result && <TableRow><TableCell colSpan={columns.length + Number(collection.timestamps) + 1} className="py-8 text-center text-sm text-muted-foreground">Loading users…</TableCell></TableRow>}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-5 text-xs text-muted-foreground">
          <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "0 users"}</span>
          <div className="flex items-center justify-end gap-2">
            <span className="mr-1">Per Page:</span>
            <Select value={String(pageSize)} onValueChange={(value) => { if (value) { setPageSize(Number(value)); setPage(1); } }}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 25, 50].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={16} /></Button>
            <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={16} /></Button>
          </div>
        </div>
      </div>
      {pendingUserDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingUsers) setPendingUserDelete(undefined); }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="delete-users-title" aria-describedby="delete-users-description" className="w-full max-w-md border bg-background p-6 shadow-xl">
          <h2 id="delete-users-title" className="text-lg font-semibold">Delete {pendingUserDelete.length === 1 ? "user" : "users"}?</h2>
          <p id="delete-users-description" className="mt-2 text-sm text-muted-foreground">This permanently deletes the selected Better Auth account{pendingUserDelete.length === 1 ? "" : "s"}, including their sessions and accounts.</p>
          {deleteError && <p role="alert" className="mt-3 text-sm text-destructive">{deleteError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" disabled={deletingUsers} onClick={() => { setDeleteError(undefined); setPendingUserDelete(undefined); }}>Cancel</Button>
            <Button variant="destructive" disabled={deletingUsers} onClick={() => void confirmUserDelete()}><Trash2 size={15} /> {deletingUsers ? "Deleting…" : "Delete"}</Button>
          </div>
        </section>
      </div>}
    </section>
  );
}
