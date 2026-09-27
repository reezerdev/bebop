import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useAll, useDb } from "jazz-tools/react";
import type { QueryBuilder } from "jazz-tools";
import { Controller, useForm, type Control, type FieldValues, type RegisterOptions, type UseFormRegister } from "react-hook-form";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FilePlus2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useRoutes,
} from "react-router-dom";
import type { BebopAdminCollection, BebopAdminField, BebopAdminManifest } from "../types.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { Textarea } from "../components/ui/textarea.js";

type AdminRecord = Record<string, unknown> & { id: string; $createdAt?: Date; $updatedAt?: Date };
type AdminTable = QueryBuilder<AdminRecord> & {
  select: (...columns: string[]) => QueryBuilder<AdminRecord>;
};
type AdminDatabase = {
  insert: (table: unknown, data: Record<string, unknown>) => unknown;
  update: (table: unknown, id: string, data: Record<string, unknown>) => unknown;
  delete: (table: unknown, id: string) => unknown;
};

export type BebopAdminUser = {
  name?: string;
  email?: string;
};

export type BebopAdminProps = {
  app: object;
  manifest: BebopAdminManifest;
  user?: BebopAdminUser;
  createDefaults?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  relationOptions?: Readonly<Record<string, readonly { id: string; name: string }[]>>;
  onLogout?: () => void | Promise<void>;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const pageSize = 10;
const filterAllValue = "__bebop_filter_all__";

function getTable(app: object, collectionSlug: string): AdminTable | undefined {
  const table = (app as Record<string, unknown>)[collectionSlug];
  return table ? table as AdminTable : undefined;
}

function getRowsQuery(table: AdminTable, withTimestamps = false): QueryBuilder<AdminRecord> {
  return withTimestamps
    ? table.select("*", "$createdAt", "$updatedAt")
    : table.select("*");
}

function formatDate(value: unknown, includeTime = false): string {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return (includeTime ? dateTimeFormatter : dateFormatter).format(date);
}

function compareValues(left: unknown, right: unknown, field?: BebopAdminField): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;

  if (field?.kind === "number" || field?.kind === "integer") {
    const difference = Number(left) - Number(right);
    if (!Number.isNaN(difference)) return difference;
  }
  if (field?.kind === "boolean" && typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  if (field?.kind === "date") {
    const leftDate = left instanceof Date ? left.getTime() : new Date(String(left)).getTime();
    const rightDate = right instanceof Date ? right.getTime() : new Date(String(right)).getTime();
    if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate - rightDate;
  }

  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function formatLabel(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function formatCell(field: BebopAdminField | undefined, value: unknown, relationOptions?: BebopAdminProps["relationOptions"]): ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (field?.kind === "boolean") return <Badge variant={value ? "default" : "secondary"}>{value ? "Yes" : "No"}</Badge>;
  if (field?.kind === "date") return formatDate(value);
  if (field?.kind === "json") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  if (field?.kind === "relation") {
    const name = relationOptions?.[field.relationTo ?? ""]?.find((option) => option.id === value)?.name;
    return name ?? <span className="font-mono text-xs">{String(value).slice(0, 8)}</span>;
  }
  return String(value);
}

function valueFor(field: BebopAdminField, row: AdminRecord): unknown {
  return row[field.storageName];
}

function fieldByName(collection: BebopAdminCollection, name: string): BebopAdminField | undefined {
  return collection.fields.find((field) => field.name === name);
}

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function useAdminRows(app: object, collectionSlug: string) {
  const table = getTable(app, collectionSlug);
  const query = table ? getRowsQuery(table, true) : undefined;
  const result = useAll<AdminRecord>(query);
  return { ...result, table };
}

export function BebopAdmin({ app, manifest, user, createDefaults, relationOptions, onLogout }: BebopAdminProps) {
  const route = useRoutes([
    {
      element: <AdminLayout manifest={manifest} user={user} onLogout={onLogout} />,
      children: [
        { index: true, element: <DashboardPage manifest={manifest} /> },
        { path: "collections/:collectionSlug", element: <CollectionRoute app={app} manifest={manifest} relationOptions={relationOptions} /> },
        { path: "collections/:collectionSlug/create", element: <EditorRoute app={app} manifest={manifest} createDefaults={createDefaults} relationOptions={relationOptions} /> },
        { path: "collections/:collectionSlug/:id", element: <EditorRoute app={app} manifest={manifest} createDefaults={createDefaults} relationOptions={relationOptions} /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);

  return route;
}

function AdminLayout({
  manifest,
  user,
  onLogout,
}: {
  manifest: BebopAdminManifest;
  user?: BebopAdminProps["user"];
  onLogout?: BebopAdminProps["onLogout"];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const location = useLocation();
  const activeCollection = location.pathname.match(/\/collections\/([^/]+)/)?.[1];
  const currentCollection = activeCollection ? manifest.collections[activeCollection] : undefined;
  const collections = Object.values(manifest.collections).sort((left, right) => left.label.localeCompare(right.label));
  const userName = user?.name?.trim() || "Signed in";
  const userEmail = user?.email?.trim() || "Email unavailable";
  const avatarInitials = (user?.name?.trim() || user?.email?.trim() || "U")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="bebop-admin min-h-svh bg-background text-foreground">
      <aside className={`admin-sidebar ${sidebarCollapsed ? "admin-sidebar-hidden" : ""} ${mobileOpen ? "admin-sidebar-open" : ""}`}>
        <div className="admin-sidebar-header">
          <Button variant="outline" size="icon" aria-label="Collapse sidebar" onClick={() => setSidebarCollapsed(true)}>
            <ArrowLeft size={18} />
          </Button>
        </div>
        <div className="admin-sidebar-scroll">
          <button className="admin-nav-heading" aria-expanded={collectionsOpen} onClick={() => setCollectionsOpen((open) => !open)}>
            <span>Collections</span><ChevronUp size={16} className={collectionsOpen ? "" : "rotate-180"} />
          </button>
          {collectionsOpen && <nav aria-label="Collections" className="admin-collection-nav">
            {collections.map((collection) => (
              <NavLink
                key={collection.slug}
                to={`/admin/collections/${collection.slug}`}
                className={({ isActive }) => `admin-nav-link ${isActive ? "admin-nav-active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="truncate">{collection.label}</span>
              </NavLink>
            ))}
          </nav>}
        </div>
        <div className="admin-sidebar-footer">
          <div className="admin-avatar">{avatarInitials}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{userName}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{userEmail}</p>
          </div>
          {onLogout && (
            <Button variant="ghost" size="icon" className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Sign out" onClick={() => void onLogout()}>
              <LogOut size={16} />
            </Button>
          )}
        </div>
      </aside>
      {mobileOpen && <button className="admin-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className={`admin-main ${sidebarCollapsed ? "admin-main-expanded" : ""}`}>
        <header className="admin-topbar">
          <Button variant="ghost" size="icon" className="admin-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </Button>
          {sidebarCollapsed && <Button variant="outline" size="icon" className="admin-sidebar-expand" aria-label="Expand sidebar" onClick={() => setSidebarCollapsed(false)}><ChevronRight size={18} /></Button>}
          <div className="admin-breadcrumbs">
            <Link to="/admin" className="admin-brand-mark" aria-label="Bebop dashboard">b</Link>
            <span className="admin-breadcrumb-divider">/</span>
            <span>{currentCollection?.label ?? "Dashboard"}</span>
            {location.pathname.endsWith("/create") && <><span className="text-muted-foreground">/</span><span>New</span></>}
            {activeCollection && !currentCollection && <span>Not found</span>}
          </div>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function DashboardPage({ manifest }: { manifest: BebopAdminManifest }) {
  const collections = Object.values(manifest.collections).sort((left, right) => left.label.localeCompare(right.label));

  return (
    <section>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Collections</h1>
      <div className="admin-collection-grid">
        {collections.map((collection) => (
          <article key={collection.slug} className="admin-collection-card">
            <Link to={`/admin/collections/${collection.slug}`} className="admin-collection-title">{collection.label}</Link>
            <Link to={`/admin/collections/${collection.slug}/create`} className="admin-collection-add" aria-label={`Create ${collection.label}`}>
              <Plus size={19} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function CollectionRoute({ app, manifest, relationOptions }: Pick<BebopAdminProps, "app" | "manifest" | "relationOptions">) {
  const { collectionSlug = "" } = useParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  return <CollectionList app={app} collection={collection} relationOptions={relationOptions} />;
}

function CollectionList({ app, collection, relationOptions }: { app: object; collection: BebopAdminCollection; relationOptions?: BebopAdminProps["relationOptions"] }) {
  const navigate = useNavigate();
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const { data, isLoading, error } = useAdminRows(app, collection.slug);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({
    field: collection.defaultColumns[0] ?? "id",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<AdminRecord | null>(null);
  const rows = data ?? [];
  const columns = collection.defaultColumns.length ? collection.defaultColumns : collection.fields.slice(0, 4).map((field) => field.name);
  const filterFields = collection.fields.filter((field) => field.kind === "boolean" || field.kind === "select");
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) => {
      const matchesSearch = !query || collection.listSearchableFields.some((fieldName) => {
        const field = fieldByName(collection, fieldName);
        return String(field ? valueFor(field, row) ?? "" : row[fieldName] ?? "").toLocaleLowerCase().includes(query);
      }) || (!collection.listSearchableFields.length && row.id.toLocaleLowerCase().includes(query));
      const matchesFilters = filterFields.every((field) => {
        const selected = filters[field.name];
        if (!selected) return true;
        const value = valueFor(field, row);
        return field.kind === "boolean" ? String(Boolean(value)) === selected : String(value ?? "") === selected;
      });
      return matchesSearch && matchesFilters;
    });

    const sortField = fieldByName(collection, sort.field);
    filtered.sort((left, right) => {
      const leftValue = sortField ? valueFor(sortField, left) : left[sort.field];
      const rightValue = sortField ? valueFor(sortField, right) : right[sort.field];
      const result = compareValues(leftValue, rightValue, sortField);
      return sort.direction === "asc" ? result : -result;
    });
    return filtered;
  }, [collection, filterFields, filters, rows, search, sort]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);

  useEffect(() => setPage(1), [search, filters]);

  function toggleSort(field: string) {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function deleteRow(row: AdminRecord) {
    setPendingDelete(row);
  }

  const pendingTitleField = pendingDelete && collection.useAsTitle
    ? fieldByName(collection, collection.useAsTitle)
    : undefined;
  const pendingTitle = pendingDelete
    ? String(pendingTitleField ? valueFor(pendingTitleField, pendingDelete) ?? pendingDelete.id : pendingDelete.id)
    : "";

  return (
    <div>
      <PageTitle
        eyebrow="COLLECTION"
        title={collection.label}
        description={`${rows.length} ${rows.length === 1 ? "document" : "documents"} in this collection.`}
        action={<Button onClick={() => navigate(`/admin/collections/${collection.slug}/create`)}><Plus size={16} /> Create new</Button>}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${collection.label.toLocaleLowerCase()}...`} className="pl-9" aria-label={`Search ${collection.label}`} />
          </div>
          <div className="flex flex-wrap gap-2">
            {filterFields.map((field) => (
              <Select
                key={field.name}
                value={filters[field.name] || filterAllValue}
                onValueChange={(value) => setFilters((current) => ({
                  ...current,
                  [field.name]: value === filterAllValue ? "" : value ?? "",
                }))}
              >
                <SelectTrigger className="min-w-32" aria-label={`Filter by ${field.label}`}>
                  <SelectValue placeholder={`All ${field.label.toLocaleLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={filterAllValue}>All {field.label.toLocaleLowerCase()}</SelectItem>
                  {field.kind === "boolean" ? (
                    <><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></>
                  ) : field.options?.map((option) => <SelectItem key={option} value={option}>{formatLabel(option)}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
          </div>
        </div>
        {error ? (
          <div className="p-10 text-center text-sm text-destructive">Could not load this collection: {error.message}</div>
        ) : isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading documents…</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 rounded-full bg-secondary p-3 text-primary"><FolderKanban size={20} /></span>
            <h2 className="font-medium">{rows.length ? "No matching documents" : "No documents yet"}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{rows.length ? "Try changing your search or filters." : `Create your first ${collection.label.toLocaleLowerCase().replace(/s$/, "")} to get started.`}</p>
            {!rows.length && <Button className="mt-4" onClick={() => navigate(`/admin/collections/${collection.slug}/create`)}><Plus size={16} /> Create new</Button>}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => {
                    const field = fieldByName(collection, column);
                    const active = sort.field === column;
                    const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <TableHead key={column}>
                        <button className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => toggleSort(column)}>
                          {field?.label ?? humanize(column)}<SortIcon size={13} />
                        </button>
                      </TableHead>
                    );
                  })}
                  {collection.timestamps && <TableHead>Updated</TableHead>}
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => {
                  const titleField = collection.useAsTitle ? fieldByName(collection, collection.useAsTitle) : undefined;
                  return (
                    <TableRow key={row.id}>
                      {columns.map((column, index) => {
                        const field = fieldByName(collection, column);
                        const value = field ? valueFor(field, row) : row[column];
                        return (
                          <TableCell key={column} className={index === 0 ? "font-medium" : "text-muted-foreground"}>
                            <Link to={`/admin/collections/${collection.slug}/${row.id}`} className="max-w-64 truncate hover:text-primary hover:underline">
                              {formatCell(field, value, relationOptions)}
                            </Link>
                            {index === 0 && titleField && titleField.name !== column && <span className="sr-only">{String(valueFor(titleField, row) ?? "")}</span>}
                          </TableCell>
                        );
                      })}
                      {collection.timestamps && <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.$updatedAt, true)}</TableCell>}
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label="Edit document" onClick={() => navigate(`/admin/collections/${collection.slug}/${row.id}`)}><Pencil size={15} /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Delete document" onClick={() => deleteRow(row)}><Trash2 size={15} /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {filteredRows.length ? (Math.min(page, pageCount) - 1) * pageSize + 1 : 0}–{Math.min(page, pageCount) * pageSize} of {filteredRows.length}</span>
              <div className="flex items-center justify-end gap-2">
                <span>Page {Math.min(page, pageCount)} of {pageCount}</span>
                <Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={16} /></Button>
                <Button variant="outline" size="icon" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={16} /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-document-title"
            aria-describedby="delete-document-description"
            className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl"
          >
            <h2 id="delete-document-title" className="text-lg font-semibold">Delete document?</h2>
            <p id="delete-document-description" className="mt-2 text-sm text-muted-foreground">
              Delete “{pendingTitle}”? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" autoFocus onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (table) db.delete(table, pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                <Trash2 size={15} /> Delete document
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function EditorRoute({ app, manifest, createDefaults, relationOptions }: Pick<BebopAdminProps, "app" | "manifest" | "createDefaults" | "relationOptions">) {
  const { collectionSlug = "", id } = useParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  return <DocumentEditor key={`${collectionSlug}:${id ?? "new"}`} app={app} manifest={manifest} collection={collection} id={id} createDefaults={createDefaults?.[collectionSlug]} relationOptions={relationOptions} />;
}

function DocumentEditor({ app, manifest, collection, id, createDefaults, relationOptions }: { app: object; manifest: BebopAdminManifest; collection: BebopAdminCollection; id?: string; createDefaults?: Readonly<Record<string, unknown>>; relationOptions?: BebopAdminProps["relationOptions"] }) {
  const navigate = useNavigate();
  const db = useDb() as AdminDatabase;
  const { data, isLoading, error, table } = useAdminRows(app, collection.slug);
  const existing = id ? data?.find((row) => row.id === id) : undefined;
  const form = useForm<FieldValues>({ defaultValues: id ? {} : initialValues(collection, undefined, createDefaults) });
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting, dirtyFields } } = form;

  useEffect(() => {
    if (existing) reset(initialValues(collection, existing));
  }, [collection, existing, reset]);

  useEffect(() => {
    if (id || !createDefaults) return;
    const defaults = initialValues(collection, undefined, createDefaults);
    for (const field of collection.fields) {
      if (Object.hasOwn(createDefaults, field.name) && !dirtyFields[field.name]) {
        setValue(field.name, defaults[field.name], { shouldDirty: false });
      }
    }
  }, [collection, createDefaults, dirtyFields, id, setValue]);

  if (error) return <div className="py-16 text-center text-sm text-destructive">Could not load document: {error.message}</div>;
  if (id && isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading document…</div>;
  if (id && !existing) return <NotFoundPage message="This document may have been deleted or is no longer available." />;

  function save(values: FieldValues) {
    if (!table) return;
    const document = serializeValues(collection, values);
    if (id) db.update(table, id, document);
    else db.insert(table, document);
    navigate(`/admin/collections/${collection.slug}`);
  }

  const title = existing && collection.useAsTitle
    ? String(valueFor(fieldByName(collection, collection.useAsTitle)!, existing) ?? "Edit document")
    : id ? "Edit document" : "Create document";

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="outline" size="icon" aria-label="Back to collection" onClick={() => navigate(`/admin/collections/${collection.slug}`)}><ArrowLeft size={16} /></Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{collection.label} / {id ? "Edit" : "Create"}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        {id && collection.timestamps && existing?.$updatedAt && <span className="hidden text-xs text-muted-foreground md:block">Updated {formatDate(existing.$updatedAt, true)}</span>}
      </div>
      <form onSubmit={handleSubmit(save)}>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Document fields</CardTitle>
              <CardDescription>Changes save to your local Jazz database.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {collection.fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  {field.kind === "boolean" ? (
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3.5">
                      <input type="checkbox" className="size-4 accent-primary" {...register(field.name, { required: field.required })} />
                      <span className="text-sm font-medium">{field.label}</span>
                      {field.required && <span className="text-xs text-muted-foreground">Required</span>}
                    </label>
                  ) : (
                    <>
                      <Label htmlFor={`field-${field.name}`} className="flex items-center gap-1.5">
                        {field.label}{field.required && <span className="text-destructive">*</span>}
                      </Label>
                  <FieldInput field={field} app={app} manifest={manifest} register={register} control={form.control} relationOptions={relationOptions} />
                    </>
                  )}
                  {errors[field.name] && <p className="text-xs text-destructive" role="alert">{String(errors[field.name]?.message ?? "Invalid value")}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-4 xl:sticky xl:top-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Publish</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" type="submit" disabled={isSubmitting}><FilePlus2 size={16} />{id ? "Save changes" : "Create document"}</Button>
                <Button className="w-full" variant="outline" type="button" onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
              </CardContent>
            </Card>
            {id && collection.timestamps && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Document info</CardTitle></CardHeader>
                <CardContent className="space-y-3 pt-0 text-xs">
                  <div><p className="text-muted-foreground">ID</p><p className="mt-1 break-all font-mono">{id}</p></div>
                  <div><p className="text-muted-foreground">Created</p><p className="mt-1">{formatDate(existing?.$createdAt, true)}</p></div>
                  <div><p className="text-muted-foreground">Updated</p><p className="mt-1">{formatDate(existing?.$updatedAt, true)}</p></div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function initialValues(collection: BebopAdminCollection, row?: AdminRecord, defaults?: Readonly<Record<string, unknown>>): FieldValues {
  return Object.fromEntries(collection.fields.map((field) => {
    const value = row ? valueFor(field, row) : defaults?.[field.name];
    if (field.kind === "boolean") return [field.name, Boolean(value)];
    if (field.kind === "date") return [field.name, value instanceof Date ? localDateInput(value) : ""];
    if (field.kind === "json") return [field.name, value === undefined || value === null ? "" : JSON.stringify(value, null, 2)];
    return [field.name, value === undefined || value === null ? "" : String(value)];
  }));
}

function localDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function serializeValues(collection: BebopAdminCollection, values: FieldValues): Record<string, unknown> {
  return Object.fromEntries(collection.fields.flatMap((field) => {
    const raw = values[field.name];
    if (field.kind === "boolean") return [[field.storageName, Boolean(raw)]];
    if (raw === "" || raw === undefined || raw === null) return field.required ? [] : [[field.storageName, null]];
    if (field.kind === "number" || field.kind === "integer") return [[field.storageName, Number(raw)]];
    if (field.kind === "date") return [[field.storageName, new Date(`${String(raw)}T00:00:00`)]];
    if (field.kind === "json") return [[field.storageName, JSON.parse(String(raw))]];
    return [[field.storageName, raw]];
  }));
}

function FieldInput({
  field,
  app,
  manifest,
  register,
  control,
  relationOptions,
}: {
  field: BebopAdminField;
  app: object;
  manifest: BebopAdminManifest;
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  relationOptions?: BebopAdminProps["relationOptions"];
}) {
  const rules: RegisterOptions<FieldValues, string> = {
    required: field.required ? `${field.label} is required.` : false,
    validate: (value) => {
      if (typeof value === "string" && value.trim() === "") return !field.required || `${field.label} is required.`;
      if (field.kind === "relation" && value && relationOptions?.[field.relationTo ?? ""] && !relationOptions[field.relationTo ?? ""].some((option) => option.id === value)) return `Select a valid ${field.label.toLocaleLowerCase()}.`;
      if (field.kind === "json" && value) {
        try { JSON.parse(String(value)); } catch { return "Enter valid JSON."; }
      }
      if (field.kind === "integer" && value !== "" && !Number.isInteger(Number(value))) return "Enter a whole number.";
      return true;
    },
  };
  if (field.kind === "relation" && field.relationTo) {
    return (
      <Controller
        control={control}
        name={field.name}
        rules={rules}
        render={({ field: input }) => (
          <RelationInput
            field={field}
            app={app}
            manifest={manifest}
            value={typeof input.value === "string" && input.value ? input.value : null}
            onChange={input.onChange}
            onBlur={input.onBlur}
            inputRef={input.ref}
            options={relationOptions?.[field.relationTo ?? ""]}
          />
        )}
      />
    );
  }
  if (field.kind === "select") {
    return (
      <Controller
        control={control}
        name={field.name}
        rules={rules}
        render={({ field: input }) => (
          <Select value={typeof input.value === "string" && input.value ? input.value : null} onValueChange={input.onChange}>
            <SelectTrigger id={`field-${field.name}`} ref={input.ref} onBlur={input.onBlur} className="w-full">
              <SelectValue placeholder={`Select ${field.label.toLocaleLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => <SelectItem key={option} value={option}>{formatLabel(option)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      />
    );
  }
  const registration = register(field.name, rules);
  if (field.kind === "json") {
    return <Textarea id={`field-${field.name}`} rows={7} className="font-mono text-xs" placeholder="{}" {...registration} />;
  }
  const type = field.kind === "date" ? "date" : field.kind === "number" || field.kind === "integer" ? "number" : "text";
  return <Input id={`field-${field.name}`} type={type} step={field.kind === "integer" ? 1 : field.kind === "number" ? "any" : undefined} {...registration} />;
}

function RelationInput({
  field,
  app,
  manifest,
  value,
  onChange,
  onBlur,
  inputRef,
  options,
}: {
  field: BebopAdminField;
  app: object;
  manifest: BebopAdminManifest;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  inputRef: (instance: HTMLButtonElement | null) => void;
  options?: readonly { id: string; name: string }[];
}) {
  const relatedSlug = field.relationTo ?? "";
  const relatedTable = options ? undefined : getTable(app, relatedSlug);
  const query = relatedTable ? getRowsQuery(relatedTable) : undefined;
  const { data, isLoading } = useAll<AdminRecord>(query);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={`field-${field.name}`} ref={inputRef} onBlur={onBlur} className="w-full">
        <SelectValue placeholder={isLoading ? "Loading related records…" : `Select ${field.label.toLocaleLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {options ? options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>) : (data ?? []).map((row) => {
          const targetCollection = manifest.collections[relatedSlug];
          const titleField = targetCollection?.useAsTitle ? targetCollection.fields.find((candidate) => candidate.name === targetCollection.useAsTitle) : undefined;
          return <SelectItem key={row.id} value={row.id}>{String(titleField ? valueFor(titleField, row) ?? row.id : row.id)}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}

function NotFoundPage({ message = "We couldn’t find the page you’re looking for." }: { message?: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center text-center">
      <p className="text-sm font-medium">Page not found</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button render={<Link to="/admin" />} variant="outline" className="mt-5">Back to overview</Button>
    </div>
  );
}
