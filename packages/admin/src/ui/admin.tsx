import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import { useAll, useDb, useOne } from "jazz-tools/react";
import type { QueryBuilder } from "jazz-tools";
import type { MutationErrorEvent, PermissionAdvice } from "jazz-tools";
import { Controller, useForm, type Control, type FieldValues, type RegisterOptions, type UseFormRegister } from "react-hook-form";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LogOut,
  Menu,
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
  useOutletContext,
  useParams,
  useRoutes,
} from "react-router-dom";
import type { BebopAdminCollection, BebopAdminField, BebopAdminManifest } from "../types.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { Textarea } from "../components/ui/textarea.js";
import { Toaster, useToastManager } from "../components/ui/toast.js";
import { AdminPortalContainer } from "../lib/admin-portal.js";

type AdminRecord = Record<string, unknown> & { id: string; $createdAt?: Date; $updatedAt?: Date };
type AdminTable = QueryBuilder<AdminRecord> & {
  select: (...columns: string[]) => QueryBuilder<AdminRecord>;
};
type AdminDatabase = {
  canRead: (table: unknown, id: string) => Promise<PermissionAdvice>;
  canInsert: (table: unknown, data: Record<string, unknown>) => Promise<PermissionAdvice>;
  canUpdate: (table: unknown, id: string, data: Record<string, unknown>) => Promise<PermissionAdvice>;
  canDelete: (table: unknown, id: string) => Promise<PermissionAdvice>;
};

export type BebopAdminClient = object & {
  onMutationError: (listener: (event: MutationErrorEvent) => void) => () => void;
};

type CollectionMutations = {
  query: (options?: { where?: Record<string, unknown>; orderBy?: { field: string; direction?: "asc" | "desc" }; limit?: number; offset?: number; includeTimestamps?: boolean }) => QueryBuilder<AdminRecord>;
  queryIds: (options?: { where?: Record<string, unknown> }) => QueryBuilder<{ id: string }>;
  create: (data: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  delete: (id: string) => Promise<unknown>;
};

type AdminOutletContext = {
  setDocumentBreadcrumb: (title: string | undefined) => void;
};

export type BebopAdminUser = {
  name?: string;
  email?: string;
};

export type BebopAdminProps = {
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  /** The host decides who may enter the admin. Jazz policies still secure collection data. */
  canAccessAdmin: boolean;
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
const defaultPageSize = 10;
const filterAllValue = "__bebop_filter_all__";

function getTable(app: object, collectionSlug: string): AdminTable | undefined {
  const table = (app as Record<string, unknown>)[collectionSlug];
  return table ? table as AdminTable : undefined;
}

function getMutations(client: BebopAdminClient, collectionSlug: string): CollectionMutations | undefined {
  return (client as Record<string, unknown>)[collectionSlug] as CollectionMutations | undefined;
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

function selectLabel(field: BebopAdminField, value: string): string {
  return field.optionLabels?.[value] ?? formatLabel(value);
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
  if (field?.kind === "select") return selectLabel(field, String(value));
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

function useAdminRows(client: BebopAdminClient, collectionSlug: string, options: {
  where: Record<string, unknown>;
  sort: { field: string; direction: "asc" | "desc" };
  page: number;
  pageSize: number;
  searchActive: boolean;
}) {
  const operations = getMutations(client, collectionSlug);
  const query = operations?.query({
    where: options.where,
    orderBy: options.sort,
    includeTimestamps: true,
    ...(!options.searchActive ? { limit: options.pageSize, offset: (options.page - 1) * options.pageSize } : {}),
  });
  const idsQuery = options.searchActive ? undefined : operations?.queryIds({ where: options.where });
  const rows = useAll<AdminRecord>(query);
  const ids = useAll<{ id: string }>(idsQuery);
  return { rows, ids };
}

function usePageRowPermissions(db: AdminDatabase, table: AdminTable | undefined, rows: readonly AdminRecord[]) {
  const [permissions, setPermissions] = useState<Record<string, { update: PermissionAdvice; delete: PermissionAdvice }>>({});
  const rowFingerprint = rows.map((row) => JSON.stringify(row)).join("\u0000");

  useEffect(() => {
    let active = true;
    if (!table || rows.length === 0) {
      setPermissions((current) => Object.keys(current).length ? {} : current);
      return;
    }
    setPermissions(Object.fromEntries(rows.map((row) => [row.id, { update: "unknown", delete: "unknown" }])));
    void Promise.all(rows.map(async (row) => {
      try {
        const [update, remove] = await Promise.all([
          db.canUpdate(table, row.id, row),
          db.canDelete(table, row.id),
        ]);
        return [row.id, { update, delete: remove }] as const;
      } catch {
        return [row.id, { update: "unknown", delete: "unknown" }] as const;
      }
    })).then((entries) => {
      if (active) setPermissions(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [db, rowFingerprint, table]);

  return permissions;
}

function useRowReadPermissions(db: AdminDatabase, table: AdminTable | undefined, rows: readonly AdminRecord[]) {
  const [permissions, setPermissions] = useState<Record<string, PermissionAdvice>>({});
  const rowFingerprint = rows.map((row) => JSON.stringify(row)).join("\u0000");

  useEffect(() => {
    let active = true;
    if (!table || rows.length === 0) {
      setPermissions((current) => Object.keys(current).length ? {} : current);
      return;
    }
    setPermissions(Object.fromEntries(rows.map((row) => [row.id, "unknown"])));
    void Promise.all(rows.map(async (row) => {
      try {
        return [row.id, await db.canRead(table, row.id)] as const;
      } catch {
        return [row.id, "unknown" as const] as const;
      }
    })).then((entries) => {
      if (active) setPermissions(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [db, rowFingerprint, table]);

  return permissions;
}

export function BebopAdmin({ app, client, manifest, canAccessAdmin, user, createDefaults, relationOptions, onLogout }: BebopAdminProps) {
  const [mutationError, setMutationError] = useState<string>();

  useEffect(() => {
    if (!canAccessAdmin) return;
    return client.onMutationError((event) => {
    setMutationError(event.code === "permission_denied"
      ? "Jazz rejected a write because the current session does not have access."
      : "Jazz could not sync a recent write. The local change may be reverted when sync finishes.");
    });
  }, [canAccessAdmin, client]);

  const route = useRoutes([
    {
      element: <AdminLayout manifest={manifest} user={user} onLogout={onLogout} mutationError={mutationError} />,
      children: [
        { index: true, element: <DashboardPage manifest={manifest} /> },
        { path: "collections/:collectionSlug", element: <CollectionRoute app={app} client={client} manifest={manifest} relationOptions={relationOptions} /> },
        { path: "collections/:collectionSlug/create", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} relationOptions={relationOptions} /> },
        { path: "collections/:collectionSlug/:id", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} relationOptions={relationOptions} /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);

  return canAccessAdmin ? route : <main className="bebop-admin grid min-h-svh place-items-center bg-background px-6 text-foreground"><p role="alert">You do not have access to the Bebop admin.</p></main>;
}

function AdminLayout({
  manifest,
  user,
  onLogout,
  mutationError,
}: {
  manifest: BebopAdminManifest;
  user?: BebopAdminProps["user"];
  onLogout?: BebopAdminProps["onLogout"];
  mutationError?: string;
}) {
  const portalContainer = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [documentBreadcrumb, setDocumentBreadcrumbState] = useState<{ path: string; title: string }>();
  const location = useLocation();
  const setDocumentBreadcrumb = useCallback((title: string | undefined) => {
    setDocumentBreadcrumbState(title ? { path: location.pathname, title } : undefined);
  }, [location.pathname]);
  const currentDocumentBreadcrumb = documentBreadcrumb?.path === location.pathname ? documentBreadcrumb.title : undefined;
  const activeCollection = location.pathname.match(/\/collections\/([^/]+)/)?.[1];
  const currentCollection = activeCollection ? manifest.collections[activeCollection] : undefined;
  const isCreateRoute = location.pathname.endsWith("/create");
  const isDocumentRoute = Boolean(currentCollection && location.pathname.match(/\/collections\/[^/]+\/[^/]+\/?$/) && !isCreateRoute);
  const collections = Object.values(manifest.collections).sort((left, right) => left.labels.plural.localeCompare(right.labels.plural));
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
    <AdminPortalContainer.Provider value={portalContainer}>
    <Toaster>
    <div ref={portalContainer} className="bebop-admin min-h-svh bg-background text-foreground">
      <aside className={`admin-sidebar ${sidebarCollapsed ? "admin-sidebar-hidden" : ""} ${mobileOpen ? "admin-sidebar-open" : ""}`}>
        <div className="admin-sidebar-header">
          <Button variant="outline" size="icon-xs" aria-label="Collapse sidebar" onClick={() => setSidebarCollapsed(true)}>
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
                <span className="truncate">{collection.labels.plural}</span>
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
            {currentCollection ? <Link to={`/admin/collections/${currentCollection.slug}`} className="hover:underline">{currentCollection.labels.plural}</Link> : <span>Dashboard</span>}
            {(isCreateRoute || isDocumentRoute) && <><span className="text-muted-foreground">/</span><span className="max-w-56 truncate" title={currentDocumentBreadcrumb}>{isCreateRoute ? `New ${currentCollection?.labels.singular ?? "document"}` : currentDocumentBreadcrumb ?? "Document"}</span></>}
            {activeCollection && !currentCollection && <span>Not found</span>}
          </div>
        </header>
        <main className="admin-content">
          {mutationError && <div className="mb-5 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{mutationError}</div>}
          <Outlet context={{ setDocumentBreadcrumb } satisfies AdminOutletContext} />
        </main>
      </div>
    </div>
    </Toaster>
    </AdminPortalContainer.Provider>
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
        <h1 className="text-[32px] font-normal leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function DashboardPage({ manifest }: { manifest: BebopAdminManifest }) {
  const collections = Object.values(manifest.collections).sort((left, right) => left.labels.plural.localeCompare(right.labels.plural));

  return (
    <section>
      <h1 className="mb-6 text-[32px] font-normal leading-tight tracking-tight">Collections</h1>
      <div className="admin-collection-grid">
        {collections.map((collection) => (
          <article key={collection.slug} className="admin-collection-card">
            <Link to={`/admin/collections/${collection.slug}`} className="admin-collection-title">{collection.labels.plural}</Link>
            <Link to={`/admin/collections/${collection.slug}/create`} className="admin-collection-add" aria-label={`Create ${collection.labels.singular}`}>
              <Plus size={19} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function CollectionRoute({ app, client, manifest, relationOptions }: Pick<BebopAdminProps, "app" | "client" | "manifest" | "relationOptions">) {
  const { collectionSlug = "" } = useParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  return <CollectionList key={collection.slug} app={app} client={client} collection={collection} relationOptions={relationOptions} />;
}

function CollectionList({ app, client, collection, relationOptions }: { app: object; client: BebopAdminClient; collection: BebopAdminCollection; relationOptions?: BebopAdminProps["relationOptions"] }) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({
    field: collection.defaultColumns[0] ?? "id",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => collection.defaultColumns.length
    ? [...collection.defaultColumns]
    : collection.fields.slice(0, 4).map((field) => field.name));
  const [pendingDelete, setPendingDelete] = useState<AdminRecord[] | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const filterFields = collection.fields.filter((field) => field.kind === "boolean" || field.kind === "select");
  const filterWhere = useMemo(() => Object.fromEntries(filterFields.flatMap((field) => {
    const value = filters[field.name];
    if (!value) return [];
    return [[field.storageName, field.kind === "boolean" ? value === "true" : value]];
  })), [collection, filters]);
  const searchActive = Boolean(search.trim());
  const sortField = fieldByName(collection, sort.field);
  const defaultSortField = fieldByName(collection, collection.defaultColumns[0] ?? "");
  const storedSortField = sortField?.storageName ?? (sort.field === "id" ? "id" : defaultSortField?.storageName ?? "id");
  const { rows: rowResult, ids: idResult } = useAdminRows(client, collection.slug, {
    where: filterWhere,
    sort: { field: storedSortField, direction: sort.direction },
    page, pageSize, searchActive,
  });
  const { data, isLoading: rowsLoading, error: rowsError } = rowResult;
  const rows = data ?? [];
  const readPermissions = useRowReadPermissions(db, table, rows);
  const readableRows = rows.filter((row) => readPermissions[row.id] !== "denied");
  const allColumns = collection.fields.map((field) => field.name);
  const columns = allColumns.filter((column) => visibleColumns.includes(column));
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = readableRows.filter((row) => {
      const matchesSearch = !query || collection.listSearchableFields.some((fieldName) => {
        const field = fieldByName(collection, fieldName);
        const value = field ? valueFor(field, row) : row[fieldName];
        const relationLabel = field?.kind === "relation"
          ? relationOptions?.[field.relationTo ?? ""]?.find((option) => option.id === value)?.name
          : undefined;
        return `${relationLabel ?? ""} ${String(value ?? "")}`.toLocaleLowerCase().includes(query);
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
  }, [collection, filterFields, filters, readableRows, relationOptions, search, sort]);
  const totalRows = searchActive ? filteredRows.length : idResult.data?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageRows = searchActive
    ? filteredRows.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize)
    : filteredRows;
  const rowPermissions = usePageRowPermissions(db, table, pageRows);
  const deletablePageRows = pageRows.filter((row) => rowPermissions[row.id]?.delete !== "denied");
  const allPageSelected = deletablePageRows.length > 0 && deletablePageRows.every((row) => selectedIds.has(row.id));
  const selectedRows = readableRows.filter((row) => selectedIds.has(row.id));
  const titleField = collection.useAsTitle ? fieldByName(collection, collection.useAsTitle) : undefined;
  const searchField = titleField ?? fieldByName(collection, collection.listSearchableFields[0] ?? "");
  const searchLabel = searchField?.label ?? "Name";
  const titleColumn = titleField && columns.includes(titleField.name) ? titleField.name : columns[0];

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [search, filters]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, pageSize, sort]);
  useEffect(() => { if (idResult.data || searchActive) setPage((current) => Math.min(current, pageCount)); }, [idResult.data, pageCount, searchActive]);

  useEffect(() => {
    const defaults = collection.defaultColumns.length
      ? [...collection.defaultColumns]
      : collection.fields.slice(0, 4).map((field) => field.name);
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
      if (allPageSelected) deletablePageRows.forEach((row) => next.delete(row.id));
      else deletablePageRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  const pendingTitle = pendingDelete?.length === 1
    ? String(titleField ? valueFor(titleField, pendingDelete[0]) ?? pendingDelete[0].id : pendingDelete[0].id)
    : "";
  const rangeStart = totalRows ? (Math.min(page, pageCount) - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, totalRows);
  const isLoading = rowsLoading || (!searchActive && idResult.isLoading);
  const error = rowsError ?? (!searchActive ? idResult.error : undefined);

  return (
    <div>
      <div className="admin-list-heading">
        <h1 className="text-[32px] font-normal leading-tight tracking-tight">{collection.labels.plural}</h1>
        <Button variant="secondary" size="xs" className="text-[13px] font-medium normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}/create`)}>Create New</Button>
      </div>
      {operationError && <p className="mb-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{operationError}</p>}
      <div className="admin-table-toolbar">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search by ${searchLabel}`} className="h-8 pl-10 text-[13px] focus-visible:bg-background" aria-label={`Search by ${searchLabel}`} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedRows.length > 0 && <Button variant="destructive" onClick={() => { setDeleteError(undefined); setOperationError(undefined); setPendingDelete(selectedRows); }}><Trash2 size={15} /> Delete {selectedRows.length}</Button>}
          <details className="admin-table-menu">
            <summary className="admin-table-menu-trigger">Columns <ChevronDown size={15} /></summary>
            <div className="admin-table-menu-content">
              <p className="admin-table-menu-label">Visible columns</p>
              {allColumns.map((column) => {
                const field = fieldByName(collection, column);
                const checked = visibleColumns.includes(column);
                return (
                  <label key={column} className="admin-menu-checkbox">
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
          {filterFields.length > 0 && <details className="admin-table-menu">
            <summary className="admin-table-menu-trigger">Filters <ChevronDown size={15} /></summary>
            <div className="admin-table-menu-content admin-filter-menu">
              {filterFields.map((field) => (
                <label key={field.name} className="admin-filter-field">
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
        ) : totalRows === 0 ? (
          <div className="py-16 text-center">
            <h2 className="text-sm font-medium">{readableRows.length ? "No matching documents" : rows.length ? "No readable documents" : "No documents yet"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{readableRows.length ? "Try changing your search or filters." : rows.length ? "Jazz denied read access for the available documents." : `Create your first ${collection.labels.singular.toLocaleLowerCase()} to get started.`}</p>
            {!rows.length && <Button variant="secondary" className="mt-4" onClick={() => navigate(`/admin/collections/${collection.slug}/create`)}><Plus size={16} /> Create New</Button>}
          </div>
        ) : (
          <div className="admin-table-section">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input type="checkbox" className="admin-checkbox" aria-label="Select all documents on this page" checked={allPageSelected} disabled={deletablePageRows.length === 0} onChange={togglePageSelection} />
                  </TableHead>
                  {columns.map((column) => {
                    const field = fieldByName(collection, column);
                    const active = sort.field === column;
                    const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <TableHead key={column} className="h-10 text-[13px] font-normal normal-case tracking-normal">
                        <button className="admin-sort-button" onClick={() => toggleSort(column)}>
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
                  <TableRow><TableCell colSpan={columns.length + (collection.timestamps ? 2 : 1)} className="py-8 text-center text-sm text-muted-foreground">No documents on this page.</TableCell></TableRow>
                ) : pageRows.map((row, rowIndex) => (
                  <TableRow key={row.id} className={rowIndex % 2 === 0 ? "bg-muted/50 hover:bg-muted" : "hover:bg-muted/50"}>
                    <TableCell className="w-12">
                      <input
                        type="checkbox"
                        className="admin-checkbox"
                        aria-label={`Select ${String(titleField ? valueFor(titleField, row) ?? row.id : row.id)}`}
                        checked={selectedIds.has(row.id)}
                        disabled={rowPermissions[row.id]?.delete === "denied"}
                        onChange={() => toggleRowSelection(row.id)}
                      />
                    </TableCell>
                    {columns.map((column) => {
                      const field = fieldByName(collection, column);
                      const value = field ? valueFor(field, row) : row[column];
                      const isTitle = titleColumn === column;
                      return (
                        <TableCell key={column} className={`admin-table-cell ${isTitle ? "font-medium" : ""}`}>
                          {isTitle ? (
                            <Link to={`/admin/collections/${collection.slug}/${row.id}`} className="underline underline-offset-2 hover:text-primary">
                              {formatCell(field, value, relationOptions)}
                            </Link>
                          ) : formatCell(field, value, relationOptions)}
                        </TableCell>
                      );
                    })}
                    {collection.timestamps && <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.$updatedAt, true)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="admin-table-pagination">
              <span>{rangeStart}–{rangeEnd} of {totalRows}</span>
              <div className="flex items-center justify-end gap-2">
                <span className="mr-1">Per Page:</span>
                <Select value={String(pageSize)} onValueChange={(value) => { if (value) { setPageSize(Number(value)); setPage(1); } }}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={16} /></Button>
                <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={16} /></Button>
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
                    const clearDeletedSelection = () => setSelectedIds((current) => {
                      const next = new Set(current);
                      deletedIds.forEach((id) => next.delete(id));
                      return next;
                    });
                    for (const row of pendingDelete) {
                      try {
                        const advice = await db.canDelete(table, row.id);
                        if (advice === "denied") throw new Error("Your current session cannot delete one or more selected documents.");
                        await operations.delete(row.id);
                        deletedIds.push(row.id);
                      } catch (error) {
                        if (error instanceof Error && "localWriteApplied" in error) deletedIds.push(row.id);
                        clearDeletedSelection();
                        if (deletedIds.length) {
                          setPendingDelete(null);
                          setOperationError(`${deletedIds.length} document${deletedIds.length === 1 ? "" : "s"} deleted locally before this operation stopped. ${error instanceof Error ? error.message : "The remaining documents could not be deleted."}`);
                          toast.add({
                            type: "warning",
                            title: `${deletedIds.length} document${deletedIds.length === 1 ? "" : "s"} deleted locally`,
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
                      title: `${deletedIds.length} document${deletedIds.length === 1 ? "" : "s"} deleted locally`,
                      description: "Jazz sync may still be pending.",
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

function EditorRoute({ app, client, manifest, createDefaults, relationOptions }: Pick<BebopAdminProps, "app" | "client" | "manifest" | "createDefaults" | "relationOptions">) {
  const { collectionSlug = "", id } = useParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  return <DocumentEditor key={`${collectionSlug}:${id ?? "new"}`} app={app} client={client} manifest={manifest} collection={collection} id={id} createDefaults={createDefaults?.[collectionSlug]} relationOptions={relationOptions} />;
}

function DocumentEditor({ app, client, manifest, collection, id, createDefaults, relationOptions }: { app: object; client: BebopAdminClient; manifest: BebopAdminManifest; collection: BebopAdminCollection; id?: string; createDefaults?: Readonly<Record<string, unknown>>; relationOptions?: BebopAdminProps["relationOptions"] }) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const { setDocumentBreadcrumb } = useOutletContext<AdminOutletContext>();
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const documentQuery = id ? getMutations(client, collection.slug)?.query({ where: { id }, includeTimestamps: true }) : undefined;
  const { data: existing, isLoading, error } = useOne<AdminRecord>(documentQuery);
  const form = useForm<FieldValues>({ defaultValues: id ? {} : initialValues(collection, undefined, createDefaults) });
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting, isDirty, dirtyFields } } = form;
  const [permissionAdvice, setPermissionAdvice] = useState<PermissionAdvice>("unknown");
  const [readAdvice, setReadAdvice] = useState<PermissionAdvice>("unknown");
  const [saveError, setSaveError] = useState<string>();
  const [saveApplied, setSaveApplied] = useState(false);
  const watchedValues = form.watch();
  const serializedValues = useMemo(() => serializeValues(collection, watchedValues), [collection, watchedValues]);
  const serializedValuesKey = JSON.stringify(serializedValues);
  const titleField = collection.useAsTitle ? fieldByName(collection, collection.useAsTitle) : undefined;
  const titleValue = titleField
    ? Object.hasOwn(watchedValues, titleField.name) ? watchedValues[titleField.name] : existing ? valueFor(titleField, existing) : undefined
    : undefined;
  const title = titleValue !== undefined && titleValue !== null && String(titleValue).trim()
    ? String(titleValue)
    : id ? `Untitled ${collection.labels.singular.toLocaleLowerCase()}` : `New ${collection.labels.singular}`;
  const mainFields = collection.fields.filter((field) => field.admin?.position !== "sidebar");
  const sidebarFields = collection.fields.filter((field) => field.admin?.position === "sidebar");

  useEffect(() => { setDocumentBreadcrumb(id ? title : undefined); }, [id, setDocumentBreadcrumb, title]);

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

  useEffect(() => {
    let active = true;
    if (!id || !table) {
      setReadAdvice("unknown");
      return;
    }
    if (!existing) {
      setReadAdvice("unknown");
      return;
    }
    setReadAdvice("unknown");
    void db.canRead(table, id).then((advice) => {
      if (active) setReadAdvice(advice);
    }).catch(() => {
      if (active) setReadAdvice("unknown");
    });
    return () => { active = false; };
  }, [db, existing, id, table]);

  useEffect(() => {
    let active = true;
    if (!table || (id && !existing)) {
      setPermissionAdvice("unknown");
      return;
    }
    setPermissionAdvice("unknown");
    const check = id
      ? db.canUpdate(table, id, serializedValues)
      : db.canInsert(table, serializedValues);
    void check.then((advice) => {
      if (active) setPermissionAdvice(advice);
    }).catch(() => {
      if (active) setPermissionAdvice("unknown");
    });
    return () => { active = false; };
  }, [db, existing, id, serializedValuesKey, table]);

  if (error) return <div className="py-16 text-center text-sm text-destructive">Could not load document: {error.message}</div>;
  if (id && isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading document…</div>;
  if (id && !existing) return <NotFoundPage message="This document may have been deleted or is no longer available." />;
  if (id && readAdvice === "denied") return <div className="py-16 text-center text-sm text-destructive" role="alert">Your current session cannot read this document.</div>;

  async function save(values: FieldValues) {
    const document = serializeValues(collection, values);
    setSaveError(undefined);
    try {
      if (!table) throw new Error("The generated Bebop app is missing this collection.");
      const advice = id
        ? await db.canUpdate(table, id, document)
        : await db.canInsert(table, document);
      setPermissionAdvice(advice);
      if (advice === "denied") throw new Error("Your current session cannot save this document.");
      const operations = getMutations(client, collection.slug);
      if (!operations) throw new Error("The Bebop mutation client is missing this collection.");
      if (id) await operations.update(id, document);
      else await operations.create(document);
      toast.add({
        type: "success",
        title: `${collection.labels.singular} ${id ? "updated" : "created"} locally`,
        description: "Jazz sync may still be pending.",
      });
      navigate(`/admin/collections/${collection.slug}`);
    } catch (mutationFailure) {
      const localWriteApplied = mutationFailure instanceof Error && "localWriteApplied" in mutationFailure;
      setSaveApplied(localWriteApplied);
      setSaveError(localWriteApplied
        ? `${(mutationFailure as Error).message} The local change was applied and may still sync.`
        : mutationFailure instanceof Error ? mutationFailure.message : "The document could not be saved.");
      toast.add({
        type: localWriteApplied ? "warning" : "error",
        title: localWriteApplied ? "Local change needs attention" : "Could not save document",
        description: mutationFailure instanceof Error ? mutationFailure.message : "The document could not be saved.",
      });
    }
  }

  function renderField(field: BebopAdminField) {
    return (
      <div key={field.name} className="admin-editor-field">
        {field.kind === "boolean" ? (
          <label className="admin-editor-checkbox-label">
            <input type="checkbox" className="size-4 accent-primary" {...register(field.name, { required: field.required })} />
            <span>{field.label}</span>
            {field.required && <span className="text-destructive">*</span>}
          </label>
        ) : (
          <>
            <Label htmlFor={`field-${field.name}`} className="text-[13px] font-normal normal-case tracking-normal">
              {field.label}{field.required && <span className="text-destructive">*</span>}
            </Label>
            <FieldInput field={field} app={app} client={client} manifest={manifest} register={register} control={form.control} relationOptions={relationOptions} />
          </>
        )}
        {errors[field.name] && <p className="text-xs text-destructive" role="alert">{String(errors[field.name]?.message ?? "Invalid value")}</p>}
      </div>
    );
  }

  return (
    <div className="admin-editor">
      <div className="admin-editor-heading"><h1 className="truncate" title={title}>{title}</h1></div>
      <form onSubmit={handleSubmit(save)}>
        <div className="admin-editor-meta">
          <div className="admin-editor-dates">
            {id && collection.timestamps ? <>
              <span><span className="text-muted-foreground">Last Modified: </span>{formatDate(existing?.$updatedAt, true)}</span>
              <span><span className="text-muted-foreground">Created: </span>{formatDate(existing?.$createdAt, true)}</span>
            </> : <span className="text-muted-foreground">New document</span>}
          </div>
          <div className="admin-editor-actions">
            <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={isSubmitting || saveApplied || permissionAdvice === "denied" || Boolean(id && !isDirty)}>{saveApplied ? "Local write applied" : id ? "Save" : "Create"}</Button>
            <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
          </div>
        </div>
        {permissionAdvice === "denied" && <p className="admin-editor-message text-destructive" role="status">{id ? "Your current session cannot update this document." : "Your current session cannot create this document."}</p>}
        {saveError && <p className="admin-editor-message text-destructive" role="alert">{saveError}</p>}
        {saveApplied && !saveError && <p className="admin-editor-message text-muted-foreground" role="status">The local change was applied. Jazz may still be syncing it.</p>}
        <fieldset disabled={Boolean(saveApplied || (id && permissionAdvice === "denied"))} className={`admin-editor-grid ${sidebarFields.length ? "" : "admin-editor-grid-single"}`}>
          <div className="admin-editor-main">
            {mainFields.map(renderField)}
          </div>
          {sidebarFields.length > 0 && <aside className="admin-editor-side" aria-label="Additional fields">
            {sidebarFields.map(renderField)}
            {id && <div className="admin-editor-document-id"><span>Document ID</span><code>{id}</code></div>}
          </aside>}
        </fieldset>
      </form>
    </div>
  );
}

function initialValues(collection: BebopAdminCollection, row?: AdminRecord, defaults?: Readonly<Record<string, unknown>>): FieldValues {
  return Object.fromEntries(collection.fields.map((field) => {
    const value = row ? valueFor(field, row) : defaults?.[field.name];
    if (field.kind === "boolean") return [field.name, Boolean(value)];
    if (field.kind === "date") return [field.name, value instanceof Date ? localDateInput(value, field.admin?.date?.pickerAppearance === "dayAndTime") : ""];
    if (field.kind === "json") return [field.name, value === undefined || value === null ? "" : JSON.stringify(value, null, 2)];
    return [field.name, value === undefined || value === null ? "" : String(value)];
  }));
}

function localDateInput(value: Date, includeTime = false): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  if (!includeTime) return `${year}-${month}-${day}`;
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function serializeValues(collection: BebopAdminCollection, values: FieldValues): Record<string, unknown> {
  return Object.fromEntries(collection.fields.flatMap((field) => {
    const raw = values[field.name];
    if (field.kind === "boolean") return [[field.storageName, Boolean(raw)]];
    if (raw === "" || raw === undefined || raw === null) return field.required ? [] : [[field.storageName, null]];
    if (field.kind === "number" || field.kind === "integer") return [[field.storageName, Number(raw)]];
    if (field.kind === "date") return [[field.storageName, new Date(field.admin?.date?.pickerAppearance === "dayAndTime" ? String(raw) : `${String(raw)}T00:00:00`)]];
    if (field.kind === "json") return [[field.storageName, JSON.parse(String(raw))]];
    return [[field.storageName, raw]];
  }));
}

function FieldInput({
  field,
  app,
  client,
  manifest,
  register,
  control,
  relationOptions,
}: {
  field: BebopAdminField;
  app: object;
  client: BebopAdminClient;
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
            client={client}
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
              {field.options?.map((option) => <SelectItem key={option} value={option}>{selectLabel(field, option)}</SelectItem>)}
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
  if (field.kind === "text" && field.admin?.input === "textarea") {
    return <Textarea id={`field-${field.name}`} rows={7} {...registration} />;
  }
  const type = field.kind === "date" ? field.admin?.date?.pickerAppearance === "dayAndTime" ? "datetime-local" : "date" : field.kind === "number" || field.kind === "integer" ? "number" : "text";
  return <Input id={`field-${field.name}`} type={type} step={field.kind === "integer" ? 1 : field.kind === "number" ? "any" : undefined} {...registration} />;
}

function RelationInput({
  field,
  app,
  client,
  manifest,
  value,
  onChange,
  onBlur,
  inputRef,
  options,
}: {
  field: BebopAdminField;
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  inputRef: (instance: HTMLButtonElement | null) => void;
  options?: readonly { id: string; name: string }[];
}) {
  const relatedSlug = field.relationTo ?? "";
  const relatedTable = options ? undefined : getTable(app, relatedSlug);
  const query = options ? undefined : getMutations(client, relatedSlug)?.query();
  const { data, isLoading } = useAll<AdminRecord>(query);
  const db = useDb() as AdminDatabase;
  const readPermissions = useRowReadPermissions(db, relatedTable, data ?? []);
  const readableRelatedRows = (data ?? []).filter((row) => readPermissions[row.id] !== "denied");
  const targetCollection = manifest.collections[relatedSlug];
  const titleField = targetCollection?.useAsTitle ? targetCollection.fields.find((candidate) => candidate.name === targetCollection.useAsTitle) : undefined;
  const availableOptions = options ?? readableRelatedRows.map((row) => ({
    id: row.id,
    name: String(titleField ? valueFor(titleField, row) ?? row.id : row.id),
  }));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={`field-${field.name}`} ref={inputRef} onBlur={onBlur} className="w-full">
        <SelectValue placeholder={isLoading ? "Loading related records…" : `Select ${field.label.toLocaleLowerCase()}`}>
          {(selectedValue: string | null) => selectedValue
            ? availableOptions.find((option) => option.id === selectedValue)?.name ?? selectedValue
            : isLoading ? "Loading related records…" : `Select ${field.label.toLocaleLowerCase()}`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
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
