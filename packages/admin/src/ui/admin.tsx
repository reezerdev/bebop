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
  X,
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
  useRoutes,
} from "react-router-dom";
import type { BebopAdminCollection, BebopAdminField, BebopAdminJoinField, BebopAdminManifest, BebopAdminStoredField } from "../types.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { Textarea } from "../components/ui/textarea.js";
import { Toaster, useToastManager } from "../components/ui/toast.js";
import { Drawer, DrawerContent, DrawerTitle } from "../components/ui/drawer.js";
import { AdminPortalContainer } from "../lib/admin-portal.js";
import { MediaPreview, PendingUploadPreview, UploadDropzone, UploadFieldInput, validateSelectedFile } from "./upload.js";

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
  search: (options: { search: string; fields: readonly string[]; where?: Record<string, unknown>; orderBy?: { field: string; direction?: "asc" | "desc" }; limit?: number; offset?: number }) => QueryBuilder<AdminRecord>;
  searchIds: (options: { search: string; fields: readonly string[]; where?: Record<string, unknown> }) => readonly QueryBuilder<{ id: string }>[];
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

export type BebopAuthAdminClient = {
  admin: {
    getUser: (input: { query: { id: string } }) => Promise<{
      data?: (Record<string, unknown> & { id: string }) | null;
      error?: { message?: string } | null;
    }>;
    createUser: (input: {
      email: string;
      name: string;
      password?: string;
      role?: string | string[];
      data?: Record<string, unknown>;
    }) => Promise<{
      data?: { user: Record<string, unknown> & { id: string } } | null;
      error?: { message?: string } | null;
    }>;
    updateUser: (input: { userId: string; data: Record<string, unknown> }) => Promise<{
      data?: (Record<string, unknown> & { id: string }) | null;
      error?: { message?: string } | null;
    }>;
    removeUser: (input: { userId: string }) => Promise<{
      data?: { success: boolean } | null;
      error?: { message?: string } | null;
    }>;
    listUsers: (input: { query: {
      limit: number;
      offset: number;
      sortBy?: string;
      sortDirection?: "asc" | "desc";
      searchValue?: string;
      searchField?: "name" | "email";
      searchOperator?: "contains";
      filterField?: string;
      filterValue?: string | number | boolean;
      filterOperator?: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains";
    } }) => Promise<{
      data?: { users: readonly (Record<string, unknown> & { id: string })[]; total: number } | null;
      error?: { message?: string } | null;
    }>;
  };
};

export type BebopAdminProps = {
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  /** The host decides who may enter the admin. Jazz policies still secure collection data. */
  canAccessAdmin: boolean;
  /** Controls navigation guidance for Better Auth's admin-only user management API. */
  canManageUsers?: boolean;
  /** Better Auth client configured with adminClient(). The plugin still enforces server access. */
  authClient?: BebopAuthAdminClient;
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
  return ("optionLabels" in field ? field.optionLabels?.[value] : undefined) ?? formatLabel(value);
}

function formatCell(field: BebopAdminField | undefined, value: unknown, relationOptions?: BebopAdminProps["relationOptions"]): ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (field?.kind === "boolean") return <Badge variant={value ? "default" : "secondary"}>{value ? "Yes" : "No"}</Badge>;
  if (field?.kind === "date") return formatDate(value);
  if (field?.kind === "json") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  if (field?.kind === "relation" || field?.kind === "upload") {
    const name = relationOptions?.[field.relationTo ?? ""]?.find((option) => option.id === value)?.name;
    return name ?? <span className="font-mono text-xs">{String(value).slice(0, 8)}</span>;
  }
  if (field?.kind === "select") return selectLabel(field, String(value));
  return String(value);
}

function valueFor(field: BebopAdminField, row: AdminRecord): unknown {
  return field.kind === "join" ? undefined : row[field.storageName];
}

function fieldByName(collection: BebopAdminCollection, name: string): BebopAdminField | undefined {
  return collection.fields.find((field) => field.name === name);
}

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function storedFields(collection: BebopAdminCollection) {
  return collection.fields.filter((field) => field.kind !== "join");
}

function useAdminRows(client: BebopAdminClient, collectionSlug: string, options: {
  where: Record<string, unknown>;
  sort: { field: string; direction: "asc" | "desc" };
  page?: number;
  pageSize?: number;
  searchActive: boolean;
  search?: string;
  searchFields?: readonly string[];
  enabled?: boolean;
  writeMode?: BebopAdminCollection["writeMode"];
}) {
  const operations = getMutations(client, collectionSlug);
  // Command writes are confirmed by Core before the handler responds. Read the
  // same remote scope so a newly confirmed row cannot be hidden by an older
  // empty browser replica while its subscription catches up.
  const readOptions = options.writeMode === "command" ? { tier: "remote" as const } : undefined;
  const offset = ((options.page ?? 1) - 1) * (options.pageSize ?? defaultPageSize);
  const searchPageQuery = options.enabled === false || !options.searchActive ? undefined : operations?.search({
    search: options.search ?? "",
    fields: options.searchFields ?? [],
    where: options.where,
    orderBy: options.sort,
    limit: options.pageSize,
    offset,
  });
  const searchPage = useAll<AdminRecord>(searchPageQuery, readOptions);
  const pageIds = searchPage.data?.map((row) => row.id) ?? [];
  const query = options.enabled === false ? undefined : options.searchActive
    ? pageIds.length ? operations?.query({ where: { ...options.where, id: { in: pageIds } }, includeTimestamps: true }) : undefined
    : operations?.query({
      where: options.where,
      orderBy: options.sort,
      includeTimestamps: true,
      ...(options.pageSize !== undefined ? { limit: options.pageSize, offset } : {}),
    });
  const idsQuery = options.enabled === false || options.searchActive ? undefined : operations?.queryIds({ where: options.where });
  const docs = useAll<AdminRecord>(query, readOptions);
  const ids = useAll<{ id: string }>(idsQuery, readOptions);
  const docsById = new Map((docs.data ?? []).map((row) => [row.id, row]));
  const orderedRows = options.searchActive ? pageIds.flatMap((id) => {
    const row = docsById.get(id);
    return row ? [row] : [];
  }) : docs.data;
  const rows = options.searchActive
    ? { ...docs, data: orderedRows, isLoading: searchPage.isLoading || docs.isLoading, error: searchPage.error ?? docs.error }
    : docs;
  const searchIdQueries = options.enabled === false || !options.searchActive
    ? []
    : operations?.searchIds({ search: options.search ?? "", fields: options.searchFields ?? [], where: options.where }) ?? [];
  return { rows, ids, searchPage, searchIdQueries };
}

function SearchIdsObserver({ query, onIds, writeMode }: { query?: QueryBuilder<{ id: string }>; onIds: (ids: readonly string[]) => void; writeMode?: BebopAdminCollection["writeMode"] }) {
  const { data } = useAll<{ id: string }>(query, writeMode === "command" ? { tier: "remote" } : undefined);
  const ids = data?.map((row) => row.id) ?? [];
  const fingerprint = ids.join("\u0000");
  useEffect(() => { onIds(ids); }, [fingerprint, onIds]);
  return null;
}

function usePageRowPermissions(db: AdminDatabase, table: AdminTable | undefined, rows: readonly AdminRecord[], writeMode: BebopAdminCollection["writeMode"]) {
  const [permissions, setPermissions] = useState<Record<string, { update: PermissionAdvice; delete: PermissionAdvice }>>({});
  const rowFingerprint = rows.map((row) => JSON.stringify(row)).join("\u0000");

  useEffect(() => {
    let active = true;
    if (!table || rows.length === 0 || writeMode === "command") {
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
  }, [db, rowFingerprint, table, writeMode]);

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

type RelationOption = { id: string; name: string };

function RelatedCollectionLabels({ app, client, collection, ids, onChange }: {
  app: object;
  client: BebopAdminClient;
  collection: BebopAdminCollection;
  ids: readonly string[];
  onChange: (slug: string, options: readonly RelationOption[]) => void;
}) {
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const query = ids.length
    ? getMutations(client, collection.slug)?.query({ where: { id: { in: [...ids] } } })
    : undefined;
  const { data } = useAll<AdminRecord>(query);
  const readPermissions = useRowReadPermissions(db, table, data ?? []);
  const titleField = collection.useAsTitle ? fieldByName(collection, collection.useAsTitle) : undefined;
  const options = useMemo(() => (data ?? [])
    .filter((row) => readPermissions[row.id] !== "denied")
    .map((row) => ({ id: row.id, name: String(titleField ? valueFor(titleField, row) ?? row.id : row.id) })),
  [data, readPermissions, titleField]);

  useEffect(() => { onChange(collection.slug, options); }, [collection.slug, onChange, options]);
  return null;
}

export function BebopAdmin({ app, client, manifest, canAccessAdmin, canManageUsers = false, authClient, user, createDefaults, relationOptions, onLogout }: BebopAdminProps) {
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
      element: <AdminLayout manifest={manifest} canManageUsers={canManageUsers} user={user} onLogout={onLogout} mutationError={mutationError} />,
      children: [
        { index: true, element: <DashboardPage manifest={manifest} canManageUsers={canManageUsers} /> },
        { path: "collections/:collectionSlug", element: <CollectionRoute app={app} client={client} manifest={manifest} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "collections/:collectionSlug/create", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "collections/:collectionSlug/:id", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);

  return canAccessAdmin ? route : <main className="bebop-admin grid min-h-svh place-items-center bg-background px-6 text-foreground"><p role="alert">You do not have access to the Bebop admin.</p></main>;
}

function AdminLayout({
  manifest,
  canManageUsers,
  user,
  onLogout,
  mutationError,
}: {
  manifest: BebopAdminManifest;
  canManageUsers: boolean;
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
  const collections = Object.values(manifest.collections)
    .filter((collection) => !collection.auth || canManageUsers)
    .sort((left, right) => left.labels.plural.localeCompare(right.labels.plural));
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

function DashboardPage({ manifest, canManageUsers }: { manifest: BebopAdminManifest; canManageUsers: boolean }) {
  const collections = Object.values(manifest.collections)
    .filter((collection) => !collection.auth || canManageUsers)
    .sort((left, right) => left.labels.plural.localeCompare(right.labels.plural));

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

function AuthUsersList({ collection, authClient, canManageUsers }: {
  collection: BebopAdminCollection;
  authClient?: BebopAdminProps["authClient"];
  canManageUsers: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>(() => ({ field: collection.defaultColumns[0] ?? "name", direction: "asc" }));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => [...(collection.defaultColumns.length ? collection.defaultColumns : ["name", "email", "role", "createdAt"])]);
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
  const availableColumns = collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join" && (!field.generated || ["createdAt", "updatedAt"].includes(field.name))).map((field) => field.name);
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
      <div className="admin-list-heading">
        <h1 className="text-[32px] font-normal leading-tight tracking-tight">{collection.labels.plural}</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {selectedUsers.length > 0 && <div className="admin-selection-bar" aria-label="Selected users">
            <span>{selectedUsers.length} selected</span>
            <span aria-hidden="true">—</span>
            <button type="button" className="admin-selection-action" onClick={toggleAllPageUsers}>{allPageUsersSelected ? "Clear selection" : `Select all (${users.length})`}</button>
            <span aria-hidden="true">—</span>
            <button type="button" className="admin-selection-action" disabled={selectedUsers.length !== 1} onClick={() => {
              const selectedUser = selectedUsers[0];
              if (selectedUser) navigate(`/admin/collections/${collection.slug}/${encodeURIComponent(selectedUser.id)}`);
            }}>Edit</button>
            <button type="button" className="admin-selection-action" onClick={() => { setDeleteError(undefined); setPendingUserDelete(selectedUsers); }}>Delete</button>
          </div>}
          <Button variant="secondary" size="xs" className="text-[13px] font-medium normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}/create`)}>Create New</Button>
        </div>
      </div>
      <div className="admin-table-toolbar">
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
          <details className="admin-table-menu">
            <summary className="admin-table-menu-trigger">Columns <ChevronDown size={15} /></summary>
            <div className="admin-table-menu-content">
              <p className="admin-table-menu-label">Visible columns</p>
              {availableColumns.map((column) => {
                const checked = visibleColumns.includes(column);
                return <label key={column} className="admin-menu-checkbox">
                  <input type="checkbox" checked={checked} disabled={checked && visibleColumns.length === 1} onChange={() => setVisibleColumns((current) => checked ? current.filter((name) => name !== column) : [...current, column])} />
                  <span>{fieldByName(collection, column)?.label ?? formatLabel(column)}</span>
                </label>;
              })}
            </div>
          </details>
          {filterFields.length > 0 && <details className="admin-table-menu">
            <summary className="admin-table-menu-trigger">Filters <ChevronDown size={15} /></summary>
            <div className="admin-table-menu-content admin-filter-menu">
              {filterFields.map((field) => <label key={field.name} className="admin-filter-field">
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
      <div className="admin-table-section">
        <Table>
          <TableHeader><TableRow><TableHead className="w-12"><input ref={selectAllCheckbox} type="checkbox" className="admin-checkbox" aria-label="Select all users on this page" checked={allPageUsersSelected} disabled={!users.length} onChange={toggleAllPageUsers} /></TableHead>{columns.map((name) => {
            const active = sort.field === name;
            const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return <TableHead key={name} className="h-10 text-[13px] font-normal normal-case tracking-normal"><button className="admin-sort-button" onClick={() => { setSort((current) => ({ field: name, direction: current.field === name && current.direction === "asc" ? "desc" : "asc" })); setPage(1); }}>{fieldByName(collection, name)?.label ?? formatLabel(name)}<SortIcon size={13} /></button></TableHead>;
          })}{collection.timestamps && <TableHead className="h-10 text-[13px] font-normal normal-case tracking-normal">Updated</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {result?.users.map((user, index) => <TableRow key={user.id} className={`${selectedUserIds.has(user.id) ? "bg-accent" : index % 2 === 0 ? "bg-muted/50 hover:bg-muted" : "hover:bg-muted/50"}`}>
              <TableCell className="w-12"><input type="checkbox" className="admin-checkbox" aria-label={`Select ${String(user.name ?? user.email ?? user.id)}`} checked={selectedUserIds.has(user.id)} onChange={() => setSelectedUserIds((current) => { const next = new Set(current); if (next.has(user.id)) next.delete(user.id); else next.add(user.id); return next; })} /></TableCell>
              {columns.map((name) => <TableCell key={name} className="admin-table-cell">
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
        <div className="admin-table-pagination">
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

function AuthUserCreate({ collection, authClient, canManageUsers }: {
  collection: BebopAdminCollection;
  authClient?: BebopAdminProps["authClient"];
  canManageUsers: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const [saveError, setSaveError] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ name: string; email: string; password: string }>();

  if (!canManageUsers) {
    return <section><PageTitle title={`Create ${collection.labels.singular}`} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Only a Better Auth administrator can create users.</p></section>;
  }
  if (!authClient) {
    return <section><PageTitle title={`Create ${collection.labels.singular}`} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Pass a Better Auth client configured with adminClient() to enable user management.</p></section>;
  }

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setSaveError(undefined);
    try {
      const response = await authClient.admin.createUser({ name: name.trim(), email: email.trim(), password });
      if (response.error || !response.data?.user) {
        throw new Error(response.error?.message || "Better Auth did not return the created user.");
      }
      toast.add({ type: "success", title: `${collection.labels.singular} created`, description: "The account was created through Better Auth." });
      navigate(`/admin/collections/${collection.slug}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Could not create ${collection.labels.singular.toLocaleLowerCase()}.`;
      setSaveError(message);
      toast.add({ type: "error", title: `Could not create ${collection.labels.singular.toLocaleLowerCase()}`, description: message });
    }
  });

  return (
    <section>
      <PageTitle
        title={`Create ${collection.labels.singular}`}
        description="Better Auth hashes and stores the password; Bebop does not keep a copy."
        action={<Button variant="outline" onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>}
      />
      <form className="max-w-2xl space-y-6" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="bebop-user-name">Name <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register("name", { required: "Enter a name." })} />
          {errors.name && <p role="alert" className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bebop-user-email">Email <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email", {
            required: "Enter an email address.",
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address." },
          })} />
          {errors.email && <p role="alert" className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bebop-user-password">Password <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register("password", { required: "Enter an initial password." })} />
          <p className="text-xs text-muted-foreground">Better Auth hashes and stores this password; the admin UI does not keep a copy.</p>
          {errors.password && <p role="alert" className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        {saveError && <p role="alert" className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{saveError}</p>}
        <div className="flex items-center gap-2 border-t border-border pt-5">
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : `Create ${collection.labels.singular}`}</Button>
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
        </div>
      </form>
    </section>
  );
}

function AuthUserEditor({ collection, authClient, canManageUsers, id }: {
  collection: BebopAdminCollection;
  authClient?: BebopAdminProps["authClient"];
  canManageUsers: boolean;
  id: string;
}) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const { setDocumentBreadcrumb } = useOutletContext<AdminOutletContext>();
  const [user, setUser] = useState<(Record<string, unknown> & { id: string })>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<{ name: string; email: string }>();

  useEffect(() => {
    if (!canManageUsers || !authClient) return;
    let active = true;
    setLoading(true);
    setLoadError(undefined);
    void authClient.admin.getUser({ query: { id } }).then((response) => {
      if (!active) return;
      if (response.error || !response.data) {
        setLoadError(response.error?.message || "Better Auth did not return this user.");
        setUser(undefined);
        return;
      }
      setUser(response.data);
    }).catch((caught: unknown) => {
      if (!active) return;
      setLoadError(caught instanceof Error ? caught.message : "Better Auth could not load this user.");
      setUser(undefined);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authClient, canManageUsers, id]);

  useEffect(() => {
    if (!user) return;
    reset({ name: String(user.name ?? ""), email: String(user.email ?? "") });
  }, [reset, user]);

  const title = user?.name ? String(user.name) : user?.email ? String(user.email) : id;
  useEffect(() => {
    setDocumentBreadcrumb(user ? title : undefined);
    return () => setDocumentBreadcrumb(undefined);
  }, [setDocumentBreadcrumb, title, user]);

  if (!canManageUsers) {
    return <section><PageTitle title={collection.labels.singular} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Only a Better Auth administrator can view registered users.</p></section>;
  }
  if (!authClient) {
    return <section><PageTitle title={collection.labels.singular} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Pass a Better Auth client configured with adminClient() to enable user management.</p></section>;
  }

  const onSubmit = handleSubmit(async ({ name, email }) => {
    if (!user) return;
    setSaveError(undefined);
    const data: Record<string, unknown> = {};
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    if (normalizedName !== String(user.name ?? "")) data.name = normalizedName;
    if (normalizedEmail !== String(user.email ?? "")) data.email = normalizedEmail;
    if (!Object.keys(data).length) {
      reset({ name: String(user.name ?? ""), email: String(user.email ?? "") });
      return;
    }
    try {
      const response = await authClient.admin.updateUser({ userId: id, data });
      if (response.error || !response.data) {
        throw new Error(response.error?.message || "Better Auth did not return the updated user.");
      }
      setUser(response.data);
      toast.add({ type: "success", title: `${collection.labels.singular} updated`, description: "Better Auth saved the account changes." });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Could not update ${collection.labels.singular.toLocaleLowerCase()}.`;
      setSaveError(message);
      toast.add({ type: "error", title: `Could not update ${collection.labels.singular.toLocaleLowerCase()}`, description: message });
    }
  });

  if (loading) return (
    <div className="admin-editor">
      <div className="admin-editor-heading"><h1>{collection.labels.singular}</h1></div>
      <p className="admin-editor-message text-muted-foreground" role="status">Loading user…</p>
    </div>
  );
  if (loadError || !user) return (
    <div className="admin-editor">
      <div className="admin-editor-heading"><h1>{collection.labels.singular}</h1></div>
      <div className="admin-editor-meta">
        <span className="text-muted-foreground">Could not load this user.</span>
        <div className="admin-editor-actions">
          <Button variant="outline" size="sm" className="normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Back to Users</Button>
        </div>
      </div>
      <p role="alert" className="admin-editor-message text-destructive">{loadError ?? "User not found."}</p>
    </div>
  );

  const userFields = new Map(collection.fields.map((field) => [field.name, field]));
  return (
    <div className="admin-editor">
      <div className="admin-editor-heading"><h1 className="truncate" title={title}>{title}</h1></div>
      <form onSubmit={onSubmit} noValidate>
        <div className="admin-editor-meta">
          <div className="admin-editor-dates">
            <span><span className="text-muted-foreground">Last Modified: </span>{formatDate(user.updatedAt, true)}</span>
            <span><span className="text-muted-foreground">Created: </span>{formatDate(user.createdAt, true)}</span>
          </div>
          <div className="admin-editor-actions">
            <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={!isDirty || isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button>
            <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" disabled={isSubmitting} onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
          </div>
        </div>
        {saveError && <p role="alert" className="admin-editor-message text-destructive">{saveError}</p>}
        <fieldset disabled={isSubmitting} className="admin-editor-grid">
          <div className="admin-editor-main">
            <div className="admin-editor-field">
              <Label htmlFor="bebop-user-name" className="text-[13px] font-normal normal-case tracking-normal">Name <span className="text-destructive">*</span></Label>
              <Input id="bebop-user-name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register("name", { required: "Enter a name." })} />
              {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="admin-editor-field">
              <Label htmlFor="bebop-user-email" className="text-[13px] font-normal normal-case tracking-normal">Email <span className="text-destructive">*</span></Label>
              <Input id="bebop-user-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email", {
                required: "Enter an email address.",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address." },
              })} />
              {errors.email && <p role="alert" className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <aside className="admin-editor-side" aria-label="Additional user information">
            <div className="admin-editor-document-id"><span>Document ID</span><code>{user.id}</code></div>
            <div className="admin-editor-field">
              <span className="text-[13px] text-muted-foreground">Role</span>
              <span className="text-[13px]">{formatCell(userFields.get("role"), user.role)}</span>
            </div>
            <div className="admin-editor-field">
              <span className="text-[13px] text-muted-foreground">Email verified</span>
              <span className="text-[13px]">{formatCell(userFields.get("emailVerified"), user.emailVerified)}</span>
            </div>
          </aside>
        </fieldset>
      </form>
    </div>
  );
}

function CollectionRoute({ app, client, manifest, relationOptions, authClient, canManageUsers }: Pick<BebopAdminProps, "app" | "client" | "manifest" | "relationOptions" | "authClient" | "canManageUsers">) {
  const { collectionSlug = "" } = useParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  if (collection.auth) return <AuthUsersList collection={collection} authClient={authClient} canManageUsers={Boolean(canManageUsers)} />;
  return <CollectionList key={collection.slug} app={app} client={client} collection={collection} manifest={manifest} relationOptions={relationOptions} />;
}

function CollectionList({ app, client, collection, manifest, relationOptions, selectMode = false, onSelect, onCreate }: { app: object; client: BebopAdminClient; collection: BebopAdminCollection; manifest: BebopAdminManifest; relationOptions?: BebopAdminProps["relationOptions"]; selectMode?: boolean; onSelect?: (row: AdminRecord) => void; onCreate?: () => void }) {
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
  const selectAllCheckbox = useRef<HTMLInputElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => collection.defaultColumns.length
    ? [...collection.defaultColumns]
    : storedFields(collection).slice(0, 4).map((field) => field.name));
  const [pendingDelete, setPendingDelete] = useState<AdminRecord[] | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [searchIdsByField, setSearchIdsByField] = useState<Record<string, { scope: string; ids: readonly string[] }>>({});
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
  const searchActive = Boolean(search.trim());
  const sortField = fieldByName(collection, sort.field);
  const defaultSortField = fieldByName(collection, collection.defaultColumns[0] ?? "");
  const storedSortField = sortField && sortField.kind !== "join"
    ? sortField.storageName
    : sort.field === "id" ? "id" : defaultSortField?.kind !== "join" ? defaultSortField?.storageName ?? "id" : "id";
  const { rows: rowResult, ids: idResult, searchIdQueries } = useAdminRows(client, collection.slug, {
    where: filterWhere,
    sort: { field: storedSortField, direction: sort.direction },
    page, pageSize, searchActive, search, searchFields: collection.listSearchableFields,
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
  const searchScope = `${search.trim()}\u0000${JSON.stringify(filterWhere)}`;
  const searchCountIds = searchActive
    ? Object.values(searchIdsByField).filter((entry) => entry.scope === searchScope).flatMap((entry) => entry.ids)
    : [];
  const totalRows = searchActive ? new Set(searchCountIds).size : idResult.data?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageRows = readableRows;
  const rowPermissions = usePageRowPermissions(db, table, pageRows, collection.writeMode);
  const selectablePageRows = pageRows.filter((row) => rowPermissions[row.id]?.update !== "denied" || rowPermissions[row.id]?.delete !== "denied");
  const deletablePageRows = pageRows.filter((row) => rowPermissions[row.id]?.delete !== "denied");
  const allPageSelected = selectablePageRows.length > 0 && selectablePageRows.every((row) => selectedIds.has(row.id));
  const somePageSelected = selectablePageRows.some((row) => selectedIds.has(row.id));
  const selectedRows = readableRows.filter((row) => selectedIds.has(row.id));
  const selectedDeletableRows = selectedRows.filter((row) => rowPermissions[row.id]?.delete !== "denied");
  const titleField = collection.useAsTitle ? fieldByName(collection, collection.useAsTitle) : undefined;
  const searchField = titleField ?? fieldByName(collection, collection.listSearchableFields[0] ?? "");
  const searchLabel = searchField?.label ?? "Name";
  const linkedColumn = columns[0];

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [search, filters]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, pageSize, sort]);
  useEffect(() => { if (idResult.data || searchActive) setPage((current) => Math.min(current, pageCount)); }, [idResult.data, pageCount, searchActive]);
  useEffect(() => {
    if (selectAllCheckbox.current) selectAllCheckbox.current.indeterminate = somePageSelected && !allPageSelected;
  }, [allPageSelected, somePageSelected]);

  const receiveSearchIds = useCallback((field: string, ids: readonly string[]) => {
    setSearchIdsByField((current) => {
      const previous = current[field];
      if (previous?.scope === searchScope && previous.ids.length === ids.length && previous.ids.every((id, index) => id === ids[index])) return current;
      return { ...current, [field]: { scope: searchScope, ids: [...ids] } };
    });
  }, [searchScope]);

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
    ? String(titleField ? valueFor(titleField, pendingDelete[0]) ?? pendingDelete[0].id : pendingDelete[0].id)
    : "";
  const rangeStart = totalRows ? (Math.min(page, pageCount) - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, totalRows);
  const isLoading = rowsLoading || (!searchActive && idResult.isLoading);
  const error = rowsError ?? (!searchActive ? idResult.error : undefined);

  return (
    <div>
      {searchActive && searchIdQueries.map((query, index) => {
        const fieldName = collection.listSearchableFields[index] ?? `search-${index}`;
        return <SearchIdsObserver key={`${searchScope}:${fieldName}`} query={query} writeMode={collection.writeMode} onIds={(ids) => receiveSearchIds(fieldName, ids)} />;
      })}
      {[...relatedIdsByCollection].map(([slug, ids]) => (
        <RelatedCollectionLabels
          key={slug}
          app={app}
          client={client}
          collection={manifest.collections[slug]}
          ids={[...ids].sort()}
          onChange={onRelatedOptions}
        />
      ))}
      <div className="admin-list-heading">
        <h1 className="text-[32px] font-normal leading-tight tracking-tight">{collection.labels.plural}</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {!selectMode && selectedRows.length > 0 && <div className="admin-selection-bar" aria-label="Selected documents">
            <span>{selectedRows.length} selected</span>
            <span aria-hidden="true">—</span>
            {selectablePageRows.length > 0 && <button type="button" className="admin-selection-action" onClick={togglePageSelection}>{allPageSelected ? "Clear selection" : `Select all (${selectablePageRows.length})`}</button>}
            <span aria-hidden="true">—</span>
            <button type="button" className="admin-selection-action" disabled={selectedRows.length !== 1 || selectedRows[0] === undefined || rowPermissions[selectedRows[0].id]?.update === "denied"} onClick={() => {
              const row = selectedRows[0];
              if (row) navigate(`/admin/collections/${collection.slug}/${encodeURIComponent(row.id)}`);
            }}>Edit</button>
            {selectedDeletableRows.length > 0 && <button type="button" className="admin-selection-action" onClick={() => { setDeleteError(undefined); setOperationError(undefined); setPendingDelete(selectedDeletableRows); }}>Delete</button>}
          </div>}
          <Button variant="secondary" size="xs" className="text-[13px] font-medium normal-case tracking-normal" onClick={() => selectMode ? onCreate?.() : navigate(`/admin/collections/${collection.slug}/create`)}>Create New</Button>
        </div>
      </div>
      {operationError && <p className="mb-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{operationError}</p>}
      <div className="admin-table-toolbar">
        {collection.listSearchableFields.length > 0 && <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search by ${searchLabel}`} className="h-8 pl-10 text-[13px] focus-visible:bg-background" aria-label={`Search by ${searchLabel}`} />
        </div>}
        <div className="flex shrink-0 items-center gap-2">
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
                  {!selectMode && <TableHead className="w-12">
                    <input ref={selectAllCheckbox} type="checkbox" className="admin-checkbox" aria-label="Select all documents on this page" checked={allPageSelected} disabled={selectablePageRows.length === 0} onChange={togglePageSelection} />
                  </TableHead>}
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
                  <TableRow><TableCell colSpan={columns.length + (collection.timestamps ? 1 : 0) + (selectMode ? 0 : 1)} className="py-8 text-center text-sm text-muted-foreground">No documents on this page.</TableCell></TableRow>
                ) : pageRows.map((row, rowIndex) => (
                  <TableRow key={row.id} className={`${selectedIds.has(row.id) ? "bg-accent" : rowIndex % 2 === 0 ? "bg-muted/50 hover:bg-muted" : "hover:bg-muted/50"} ${selectMode ? "cursor-pointer" : ""}`} onClick={selectMode ? () => onSelect?.(row) : undefined}>
                    {!selectMode && <TableCell className="w-12" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="admin-checkbox"
                        aria-label={`Select ${String(titleField ? valueFor(titleField, row) ?? row.id : row.id)}`}
                        checked={selectedIds.has(row.id)}
                        disabled={rowPermissions[row.id]?.update === "denied" && rowPermissions[row.id]?.delete === "denied"}
                        onChange={() => toggleRowSelection(row.id)}
                      />
                    </TableCell>}
                    {columns.map((column) => {
                      const field = fieldByName(collection, column);
                      const value = field ? valueFor(field, row) : row[column];
                      const isTitle = linkedColumn === column;
                      return (
                        <TableCell key={column} className={`admin-table-cell ${isTitle ? "font-medium" : ""}`}>
                          {isTitle && selectMode ? (
                            <button type="button" className="admin-media-picker-row-button" onClick={(event) => { event.stopPropagation(); onSelect?.(row); }}>
                              {collection.upload && <MediaPreview client={client} collection={collection.slug} id={row.id} filename={String(row.filename ?? "")} mimeType={String(row.mimeType ?? "")} compact />}
                              <span className="underline underline-offset-2 hover:text-primary">{formatCell(field, value, displayRelationOptions)}</span>
                            </button>
                          ) : isTitle ? (
                            <Link to={`/admin/collections/${collection.slug}/${row.id}`} className="underline underline-offset-2 hover:text-primary">
                              {formatCell(field, value, displayRelationOptions)}
                            </Link>
                          ) : formatCell(field, value, displayRelationOptions)}
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

function EditorRoute({ app, client, manifest, createDefaults, relationOptions, authClient, canManageUsers }: Pick<BebopAdminProps, "app" | "client" | "manifest" | "createDefaults" | "relationOptions" | "authClient" | "canManageUsers">) {
  const { collectionSlug = "", id } = useParams();
  const [searchParams] = useSearchParams();
  const collection = manifest.collections[collectionSlug];
  if (!collection) return <NotFoundPage />;
  if (collection.auth) {
    return id
      ? <AuthUserEditor key={`${collection.slug}:${id}`} collection={collection} authClient={authClient} canManageUsers={Boolean(canManageUsers)} id={id} />
      : <AuthUserCreate collection={collection} authClient={authClient} canManageUsers={Boolean(canManageUsers)} />;
  }
  const joinContext = resolveJoinContext(manifest, collectionSlug, searchParams);
  return <DocumentEditor key={`${collectionSlug}:${id ?? "new"}:${searchParams.toString()}`} app={app} client={client} manifest={manifest} collection={collection} id={id} createDefaults={createDefaults?.[collectionSlug]} joinContext={joinContext} relationOptions={relationOptions} />;
}

type JoinNavigationContext = {
  sourceSlug: string;
  parentId: string;
  returnTo: string;
  relationship: BebopAdminStoredField;
};

function resolveJoinContext(manifest: BebopAdminManifest, targetSlug: string, params: URLSearchParams): JoinNavigationContext | undefined {
  const parentId = params.get("bebopParent");
  const [sourceSlug, joinName, ...rest] = (params.get("bebopJoin") ?? "").split(".");
  if (!parentId || !sourceSlug || !joinName || rest.length) return undefined;
  const source = manifest.collections[sourceSlug];
  const target = manifest.collections[targetSlug];
  const join = source?.fields.find((field): field is BebopAdminJoinField => field.kind === "join" && field.name === joinName);
  if (!source || !target || !join || join.collection !== targetSlug) return undefined;
  const relationship = target.fields.find((field): field is BebopAdminStoredField =>
    field.kind === "relation" && field.name === join.on && field.relationTo === sourceSlug,
  );
  if (!relationship) return undefined;
  return {
    sourceSlug,
    parentId,
    relationship,
    returnTo: `/admin/collections/${sourceSlug}/${encodeURIComponent(parentId)}`,
  };
}

type MediaDialogState =
  | { mode: "choose"; fieldName: string; collectionSlug: string }
  | { mode: "create"; fieldName: string; collectionSlug: string; initialFile?: File; returnToChoose: boolean }
  | { mode: "edit"; fieldName: string; collectionSlug: string; id: string };

type EditorModalOptions = {
  initialFile?: File;
  onClose: () => void;
  onComplete: (id: string) => void;
};

function DocumentEditor({ app, client, manifest, collection, id, createDefaults, joinContext, relationOptions, modal }: { app: object; client: BebopAdminClient; manifest: BebopAdminManifest; collection: BebopAdminCollection; id?: string; createDefaults?: Readonly<Record<string, unknown>>; joinContext?: JoinNavigationContext; relationOptions?: BebopAdminProps["relationOptions"]; modal?: EditorModalOptions }) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const { setDocumentBreadcrumb } = useOutletContext<AdminOutletContext>();
  const mediaPortal = useRef<HTMLDivElement>(null);
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const documentQuery = id ? getMutations(client, collection.slug)?.query({ where: { id }, includeTimestamps: true }) : undefined;
  const { data: existing, isLoading, error } = useOne<AdminRecord>(documentQuery, collection.writeMode === "command" ? { tier: "remote" } : undefined);
  const createFieldDefaults = useMemo(() => ({
    ...createDefaults,
    ...(joinContext && !id ? { [joinContext.relationship.name]: joinContext.parentId } : {}),
  }), [createDefaults, id, joinContext]);
  const form = useForm<FieldValues>({ defaultValues: id ? {} : initialValues(collection, undefined, createFieldDefaults) });
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting, isDirty, dirtyFields } } = form;
  const [permissionAdvice, setPermissionAdvice] = useState<PermissionAdvice>("unknown");
  const [readAdvice, setReadAdvice] = useState<PermissionAdvice>("unknown");
  const [saveError, setSaveError] = useState<string>();
  const [saveApplied, setSaveApplied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(() => modal?.initialFile);
  const [fileError, setFileError] = useState<string>();
  const [mediaDialog, setMediaDialog] = useState<MediaDialogState>();
  const joinReturnPath = joinContext && (!id || existing?.[joinContext.relationship.storageName] === joinContext.parentId)
    ? joinContext.returnTo
    : undefined;
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
  const savedParentTitle = titleField && existing ? valueFor(titleField, existing) : undefined;
  const parentLabel = savedParentTitle !== undefined && savedParentTitle !== null && String(savedParentTitle).trim()
    ? String(savedParentTitle)
    : id ?? "";
  const mainFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join" && !field.generated && field.admin?.position !== "sidebar");
  const sidebarFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join" && !field.generated && field.admin?.position === "sidebar");
  const joinFields = collection.fields.filter((field): field is BebopAdminJoinField => field.kind === "join");

  useEffect(() => { if (!modal) setDocumentBreadcrumb(id ? title : undefined); }, [id, modal, setDocumentBreadcrumb, title]);

  useEffect(() => {
    if (existing) reset(initialValues(collection, existing));
  }, [collection, existing, reset]);

  useEffect(() => {
    if (id || !createFieldDefaults) return;
    const defaults = initialValues(collection, undefined, createFieldDefaults);
    for (const field of storedFields(collection)) {
      if (Object.hasOwn(createFieldDefaults, field.name) && !dirtyFields[field.name]) {
        setValue(field.name, defaults[field.name], { shouldDirty: false });
      }
    }
  }, [collection, createFieldDefaults, dirtyFields, id, setValue]);

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
    if (collection.writeMode === "command") {
      setPermissionAdvice("unknown");
      return;
    }
    if (!table || (id && !existing)) {
      setPermissionAdvice("unknown");
      return;
    }
    if (collection.upload) {
      // Media metadata and its file id are assigned by the upload client after streaming.
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
  }, [collection.upload, collection.writeMode, db, existing, id, serializedValuesKey, table]);

  if (error) return <div className="py-16 text-center text-sm text-destructive">Could not load document: {error.message}</div>;
  if (id && isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading document…</div>;
  if (id && !existing) return <NotFoundPage message="This document may have been deleted or is no longer available." />;
  if (id && collection.writeMode !== "command" && readAdvice === "denied") return <div className="py-16 text-center text-sm text-destructive" role="alert">Your current session cannot read this document.</div>;

  async function save(values: FieldValues) {
    const document = serializeValues(collection, values);
    setSaveError(undefined);
    try {
      if (collection.upload && !id && !selectedFile) throw new Error("Choose a file before creating media.");
      if (selectedFile) {
        const validation = validateSelectedFile(selectedFile, collection.upload);
        if (validation) throw new Error(validation);
      }
      if (!table) throw new Error("The generated Bebop app is missing this collection.");
      const advice = collection.upload || collection.writeMode === "command" ? "unknown" : id
        ? await db.canUpdate(table, id, document)
        : await db.canInsert(table, document);
      setPermissionAdvice(advice);
      if (advice === "denied") throw new Error("Your current session cannot save this document.");
      const operations = getMutations(client, collection.slug);
      if (!operations) throw new Error("The Bebop mutation client is missing this collection.");
      const mutationData = selectedFile ? { ...document, file: selectedFile } : document;
      const result = id
        ? await operations.update(id, mutationData)
        : await operations.create(mutationData);
      const resultDoc = (result as { doc?: AdminRecord } | undefined)?.doc;
      const globallyConfirmed = (result as { durability?: string } | undefined)?.durability === "global";
      const toastTitle = `${collection.labels.singular} ${id ? "updated" : "created"}`;
      const confirmationToastId = toast.add({
        type: globallyConfirmed ? "success" : "loading",
        title: `${toastTitle}${globallyConfirmed ? "" : " locally"}`,
        description: globallyConfirmed ? "Jazz confirmed the change." : "Waiting for Jazz to confirm this change.",
        timeout: globallyConfirmed ? 5000 : 0,
      });
      const waitForGlobal = (result as { waitForGlobal?: () => Promise<void> } | undefined)?.waitForGlobal;
      if (!globallyConfirmed && typeof waitForGlobal === "function") {
        void waitForGlobal().then(() => {
          toast.update(confirmationToastId, {
            type: "success",
            title: toastTitle,
            description: "Jazz confirmed the change. It is available to other synced clients.",
            timeout: 5000,
          });
        }).catch((syncFailure) => {
          toast.update(confirmationToastId, {
            type: "error",
            title: `Could not sync ${collection.labels.singular.toLocaleLowerCase()}`,
            description: syncFailure instanceof Error ? syncFailure.message : "Jazz did not confirm the change.",
            timeout: 7000,
          });
        });
      }
      if (modal) {
        const completedId = typeof resultDoc?.id === "string" ? resultDoc.id : id;
        if (!completedId) throw new Error("The saved media document did not return an ID.");
        modal.onComplete(completedId);
        return;
      }
      if (joinReturnPath && joinContext && resultDoc?.[joinContext.relationship.storageName] === joinContext.parentId) {
        navigate(joinReturnPath);
      } else if (!id && joinFields.length > 0 && resultDoc?.id) {
        navigate(`/admin/collections/${collection.slug}/${encodeURIComponent(resultDoc.id)}`);
      } else {
        navigate(`/admin/collections/${collection.slug}`);
      }
    } catch (mutationFailure) {
      const localWriteApplied = mutationFailure instanceof Error && "localWriteApplied" in mutationFailure;
      setSaveApplied(localWriteApplied);
      setSaveError(localWriteApplied
        ? `${(mutationFailure as Error).message} The local change was applied and may still sync.`
        : mutationFailure instanceof Error ? mutationFailure.message : "The document could not be saved.");
      const fieldErrors = mutationFailure instanceof Error && "fieldErrors" in mutationFailure
        ? (mutationFailure as Error & { fieldErrors?: Record<string, string> }).fieldErrors
        : undefined;
      for (const [field, message] of Object.entries(fieldErrors ?? {})) {
        if (collection.fields.some((candidate) => candidate.kind !== "join" && candidate.name === field)) {
          form.setError(field, { type: "bebop", message });
        }
      }
      const writeAccepted = mutationFailure instanceof Error && "writeAccepted" in mutationFailure && (mutationFailure as Error & { writeAccepted?: boolean }).writeAccepted;
      toast.add({
        type: localWriteApplied || writeAccepted ? "warning" : "error",
        title: writeAccepted ? "Saved, but an after hook failed" : localWriteApplied ? "Local change needs attention" : "Could not save document",
        description: mutationFailure instanceof Error ? mutationFailure.message : "The document could not be saved.",
      });
    }
  }

  function renderField(field: BebopAdminStoredField) {
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
            <FieldInput
              field={field}
              app={app}
              client={client}
              manifest={manifest}
              register={register}
              control={form.control}
              relationOptions={relationOptions}
              onCreateMedia={(file) => setMediaDialog({ mode: "create", fieldName: field.name, collectionSlug: field.relationTo ?? "", initialFile: file, returnToChoose: false })}
              onChooseMedia={() => setMediaDialog({ mode: "choose", fieldName: field.name, collectionSlug: field.relationTo ?? "" })}
              onEditMedia={(mediaId) => setMediaDialog({ mode: "edit", fieldName: field.name, collectionSlug: field.relationTo ?? "", id: mediaId })}
            />
          </>
        )}
        {errors[field.name] && <p className="text-xs text-destructive" role="alert">{String(errors[field.name]?.message ?? "Invalid value")}</p>}
      </div>
    );
  }

  return (
    <div className={`admin-editor ${modal ? "admin-editor-modal" : ""}`}>
      <div className="admin-editor-heading"><h1 className="truncate" title={title}>{title}</h1>{modal && <Button type="button" variant="ghost" size="icon" aria-label="Close media editor" onClick={modal.onClose}><X size={20} /></Button>}</div>
      <form onSubmit={handleSubmit(save)}>
        <div className="admin-editor-meta">
          <div className="admin-editor-dates">
            {id && collection.timestamps ? <>
              <span><span className="text-muted-foreground">Last Modified: </span>{formatDate(existing?.$updatedAt, true)}</span>
              <span><span className="text-muted-foreground">Created: </span>{formatDate(existing?.$createdAt, true)}</span>
            </> : <span className="text-muted-foreground">{modal ? `${id ? "Editing" : "Creating new"} ${collection.labels.singular}` : "New document"}</span>}
          </div>
          <div className="admin-editor-actions">
            <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={isSubmitting || saveApplied || permissionAdvice === "denied" || Boolean(id && !isDirty && !selectedFile)}>{saveApplied ? "Local write applied" : modal || id ? "Save" : "Create"}</Button>
            <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => modal ? modal.onClose() : navigate(joinReturnPath ?? `/admin/collections/${collection.slug}`)}>Cancel</Button>
          </div>
        </div>
        {permissionAdvice === "denied" && <p className="admin-editor-message text-destructive" role="status">{id ? "Your current session cannot update this document." : "Your current session cannot create this document."}</p>}
        {saveError && <p className="admin-editor-message text-destructive" role="alert">{saveError}</p>}
        {saveApplied && !saveError && <p className="admin-editor-message text-muted-foreground" role="status">The local change was applied. Jazz may still be syncing it.</p>}
        <fieldset disabled={Boolean(saveApplied || (id && permissionAdvice === "denied"))} className={`admin-editor-grid ${sidebarFields.length ? "" : "admin-editor-grid-single"}`}>
          <div className="admin-editor-main">
            {collection.upload && <div className="admin-editor-field">
              <Label className="text-[13px] font-normal">File {!id && <span className="text-destructive">*</span>}</Label>
              {selectedFile
                ? <PendingUploadPreview file={selectedFile} onClear={() => setSelectedFile(undefined)} />
                : id && typeof existing?.filename === "string" && <MediaPreview client={client} collection={collection.slug} id={id} filename={existing.filename} mimeType={String(existing.mimeType ?? "")} />}
              <UploadDropzone onFile={(file) => { setFileError(validateSelectedFile(file, collection.upload)); setSelectedFile(validateSelectedFile(file, collection.upload) ? undefined : file); }}
                accept={collection.upload.mimeTypes.join(",")} label={id ? "Replace file" : "Choose file"} error={fileError} />
            </div>}
            {mainFields.map(renderField)}
          </div>
          {sidebarFields.length > 0 && <aside className="admin-editor-side" aria-label="Additional fields">
            {sidebarFields.map(renderField)}
            {id && <div className="admin-editor-document-id"><span>Document ID</span><code>{id}</code></div>}
          </aside>}
        </fieldset>
      </form>
      {!modal && joinFields.map((field) => id && existing
        ? <JoinFieldPanel key={field.name} app={app} client={client} manifest={manifest} source={collection} field={field} parentId={id} parentLabel={parentLabel} relationOptions={relationOptions} />
        : <section key={field.name} className="mt-8 border-t pt-6">
            <h2 className="font-heading text-base font-semibold uppercase tracking-wide">{field.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Save this {collection.labels.singular.toLocaleLowerCase()} before managing {manifest.collections[field.collection]?.labels.plural.toLocaleLowerCase() ?? field.label.toLocaleLowerCase()}.</p>
          </section>)}
      <Drawer
        open={Boolean(mediaDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setMediaDialog((current) => current?.mode === "create" && current.returnToChoose
              ? { mode: "choose", fieldName: current.fieldName, collectionSlug: current.collectionSlug }
              : undefined);
          }
        }}
        swipeDirection="right"
      >
        <DrawerContent
          className="admin-media-drawer bebop-admin"
          style={{ width: "90vw", height: "100dvh", maxHeight: "100dvh", margin: 0 }}
        >
          <div ref={mediaPortal} className="admin-media-drawer-inner">
            {mediaDialog && (() => {
              const mediaCollection = manifest.collections[mediaDialog.collectionSlug];
              if (!mediaCollection) return null;
              const closeMediaDialog = () => {
                if (mediaDialog.mode === "create" && mediaDialog.returnToChoose) {
                  setMediaDialog({ mode: "choose", fieldName: mediaDialog.fieldName, collectionSlug: mediaDialog.collectionSlug });
                } else setMediaDialog(undefined);
              };
              const selectMedia = (mediaId: string) => {
                setValue(mediaDialog.fieldName, mediaId, { shouldDirty: true, shouldValidate: true });
                setMediaDialog(undefined);
              };
              return <>
                <DrawerTitle className="sr-only">
                  {mediaDialog.mode === "choose" ? `Choose ${mediaCollection.labels.plural}` : `${mediaDialog.mode === "create" ? "Create" : "Edit"} ${mediaCollection.labels.singular}`}
                </DrawerTitle>
                <AdminPortalContainer.Provider value={mediaPortal}>
                  {mediaDialog.mode === "choose" ? <div className="admin-media-picker">
                    <Button type="button" className="admin-media-picker-close" variant="ghost" size="icon" aria-label="Close media picker" onClick={closeMediaDialog}><X size={20} /></Button>
                    <CollectionList
                      app={app}
                      client={client}
                      collection={mediaCollection}
                      manifest={manifest}
                      relationOptions={relationOptions}
                      selectMode
                      onSelect={(row) => selectMedia(row.id)}
                      onCreate={() => setMediaDialog({ mode: "create", fieldName: mediaDialog.fieldName, collectionSlug: mediaDialog.collectionSlug, returnToChoose: true })}
                    />
                  </div> : <DocumentEditor
                    key={`${mediaDialog.mode}:${mediaDialog.mode === "edit" ? mediaDialog.id : "new"}`}
                    app={app}
                    client={client}
                    manifest={manifest}
                    collection={mediaCollection}
                    id={mediaDialog.mode === "edit" ? mediaDialog.id : undefined}
                    relationOptions={relationOptions}
                    modal={{
                      initialFile: mediaDialog.mode === "create" ? mediaDialog.initialFile : undefined,
                      onClose: closeMediaDialog,
                      onComplete: selectMedia,
                    }}
                  />}
                </AdminPortalContainer.Provider>
              </>;
            })()}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function JoinFieldPanel({ app, client, manifest, source, field, parentId, parentLabel, relationOptions }: {
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  source: BebopAdminCollection;
  field: BebopAdminJoinField;
  parentId: string;
  parentLabel: string;
  relationOptions?: BebopAdminProps["relationOptions"];
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
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: defaultColumns[0] ?? "id", direction: "asc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllCheckbox = useRef<HTMLInputElement>(null);
  const [createAdvice, setCreateAdvice] = useState<PermissionAdvice>("unknown");
  const where = useMemo(() => relation ? { [relation.storageName]: parentId } : {}, [parentId, relation]);
  const sortField = target ? fieldByName(target, sort.field) : undefined;
  const storedSortField = sortField && sortField.kind !== "join" ? sortField.storageName : "id";
  const { rows: rowResult, ids: idResult } = useAdminRows(client, field.collection, {
    where,
    sort: { field: storedSortField, direction: sort.direction },
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
  const titleField = target?.useAsTitle ? fieldByName(target, target.useAsTitle) : undefined;
  const linkedColumn = visible[0];
  const totalRows = idResult.data?.length ?? 0;
  const readDenied = target?.writeMode !== "command" && rows.some((row) => readPermissions[row.id] === "denied");
  const createAllowed = field.admin?.allowCreate !== false;

  useEffect(() => {
    setVisibleColumns(defaultColumns);
    setSort({ field: defaultColumns[0] ?? "id", direction: "asc" });
    setSelectedIds(new Set());
  }, [defaultColumns]);

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">{field.label}</h2>
        <div className="flex items-center gap-2">
          {selectedRows.length > 0 && <div className="admin-selection-bar" aria-label="Selected related records">
            <span>{selectedRows.length} selected</span>
            <span aria-hidden="true">—</span>
            <button type="button" className="admin-selection-action" onClick={toggleAllRows}>{allRowsSelected ? "Clear selection" : `Select all (${selectableRows.length})`}</button>
            <span aria-hidden="true">—</span>
            <button type="button" className="admin-selection-action" disabled={selectedRows.length !== 1} onClick={() => {
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
          <details className="admin-table-menu">
            <summary className="admin-table-menu-trigger">Columns <ChevronDown size={15} /></summary>
            <div className="admin-table-menu-content">
              <p className="admin-table-menu-label">Visible columns</p>
              {allColumns.map((column) => {
                const candidate = fieldByName(targetCollection!, column);
                const checked = visibleColumns.includes(column);
                return <label key={column} className="admin-menu-checkbox">
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
      ) : rowsLoading || idResult.isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading {targetCollection?.labels.plural.toLocaleLowerCase() ?? "records"}…</div>
      ) : !targetCollection || !relation ? (
        <div className="py-10 text-center text-sm text-destructive">The generated join relation is missing or invalid.</div>
      ) : totalRows === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium">{rows.length ? "No matching documents" : `No ${targetCollection.labels.plural.toLocaleLowerCase()} yet`}</p>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length ? "Try another search." : `Records related to this ${source.labels.singular.toLocaleLowerCase()} will appear here.`}</p>
        </div>
      ) : (
        <div className="admin-join-table-surface">
          <div className="admin-table-section">
            <Table>
              <TableHeader><TableRow><TableHead className="w-12"><input ref={selectAllCheckbox} type="checkbox" className="admin-checkbox" aria-label={`Select all ${targetCollection.labels.plural.toLocaleLowerCase()}`} checked={allRowsSelected} disabled={selectableRows.length === 0} onChange={toggleAllRows} /></TableHead>{visible.map((column) => {
                const candidate = fieldByName(targetCollection, column);
                const activeSort = sort.field === column;
                const SortIcon = activeSort ? sort.direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
                return <TableHead key={column} className="h-10 text-[13px] font-normal normal-case tracking-normal">
                  <button className="admin-sort-button" onClick={() => setSort((current) => ({ field: column, direction: current.field === column && current.direction === "asc" ? "desc" : "asc" }))}>
                    {candidate?.label ?? humanize(column)}<SortIcon size={13} />
                  </button>
                </TableHead>;
              })}{targetCollection.timestamps && <TableHead className="h-10 text-[13px] font-normal normal-case tracking-normal">Updated</TableHead>}</TableRow></TableHeader>
              <TableBody>{readableRows.length === 0
                ? <TableRow><TableCell colSpan={visible.length + (targetCollection.timestamps ? 1 : 0) + 1} className="py-8 text-center text-sm text-muted-foreground">{readDenied ? "No readable documents." : "No documents to display."}</TableCell></TableRow>
                : readableRows.map((row) => <TableRow key={row.id} className={selectedIds.has(row.id) ? "bg-accent" : "hover:bg-muted"}>
                    <TableCell className="w-12"><input type="checkbox" className="admin-checkbox" aria-label={`Select ${String(titleField ? valueFor(titleField, row) ?? row.id : row.id)}`} checked={selectedIds.has(row.id)} disabled={rowPermissions[row.id]?.update === "denied" && rowPermissions[row.id]?.delete === "denied"} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /></TableCell>
                    {visible.map((column) => {
                      const candidate = fieldByName(targetCollection, column);
                      const value = candidate ? valueFor(candidate, row) : row[column];
                      const displayValue = candidate?.kind === "relation" && candidate.name === field.on && value === parentId
                        ? parentLabel
                        : formatCell(candidate, value, relationOptions);
                      return <TableCell key={column} className="admin-table-cell">
                        {column === linkedColumn
                          ? <Link to={`/admin/collections/${field.collection}/${encodeURIComponent(row.id)}?${contextualQuery}`} className="underline underline-offset-2 hover:text-primary">{displayValue}</Link>
                          : displayValue}
                      </TableCell>;
                    })}
                    {targetCollection.timestamps && <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.$updatedAt, true)}</TableCell>}
                  </TableRow>)}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}

function initialValues(collection: BebopAdminCollection, row?: AdminRecord, defaults?: Readonly<Record<string, unknown>>): FieldValues {
  return Object.fromEntries(storedFields(collection).filter((field) => !field.generated).map((field) => {
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
  return Object.fromEntries(storedFields(collection).filter((field) => !field.generated).flatMap((field) => {
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
  onCreateMedia,
  onChooseMedia,
  onEditMedia,
}: {
  field: BebopAdminStoredField;
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  relationOptions?: BebopAdminProps["relationOptions"];
  onCreateMedia?: (file?: File) => void;
  onChooseMedia?: () => void;
  onEditMedia?: (id: string) => void;
}) {
  const rules: RegisterOptions<FieldValues, string> = {
    required: field.required ? `${field.label} is required.` : false,
    validate: (value) => {
      if (typeof value === "string" && value.trim() === "") return !field.required || `${field.label} is required.`;
      if (field.kind === "text" && typeof value === "string") {
        if (field.minLength !== undefined && value.length < field.minLength) return `${field.label} must be at least ${field.minLength} characters.`;
        if (field.maxLength !== undefined && value.length > field.maxLength) return `${field.label} must be at most ${field.maxLength} characters.`;
      }
      if ((field.kind === "number" || field.kind === "integer") && value !== "" && value !== undefined) {
        const number = Number(value);
        if (!Number.isFinite(number)) return `Enter a valid ${field.label.toLocaleLowerCase()}.`;
        if (field.min !== undefined && number < field.min) return `${field.label} must be at least ${field.min}.`;
        if (field.max !== undefined && number > field.max) return `${field.label} must be at most ${field.max}.`;
      }
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
  if (field.kind === "upload" && field.relationTo) {
    return <Controller control={control} name={field.name} rules={rules} render={({ field: input }) =>
      <UploadFieldInput field={field} client={client} collection={manifest.collections[field.relationTo ?? ""]}
        value={typeof input.value === "string" && input.value ? input.value : null}
        onChange={input.onChange} onBlur={input.onBlur} inputRef={input.ref}
        onCreateNew={(file) => onCreateMedia?.(file)} onChooseExisting={() => onChooseMedia?.()}
        onEdit={(id) => onEditMedia?.(id)} />
    } />;
  }
  if (field.kind === "select") {
    return (
      <Controller
        control={control}
        name={field.name}
        rules={rules}
        render={({ field: input }) => (
          <Select value={typeof input.value === "string" && input.value ? input.value : null} onValueChange={input.onChange}>
            <div className="relative">
              <SelectTrigger id={`field-${field.name}`} ref={input.ref} onBlur={input.onBlur} className="w-full pr-14">
                <SelectValue placeholder={`Select ${field.label.toLocaleLowerCase()}`}>
                  {(value: string | null) => value ? selectLabel(field, value) : `Select ${field.label.toLocaleLowerCase()}`}
                </SelectValue>
              </SelectTrigger>
              {!field.required && input.value && <ClearSelectionButton label={field.label} onClear={() => { input.onChange(""); input.onBlur(); }} />}
            </div>
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
  field: BebopAdminStoredField;
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
      <div className="relative">
        <SelectTrigger id={`field-${field.name}`} ref={inputRef} onBlur={onBlur} className="w-full pr-14">
          <SelectValue placeholder={isLoading ? "Loading related records…" : `Select ${field.label.toLocaleLowerCase()}`}>
            {(selectedValue: string | null) => selectedValue
              ? availableOptions.find((option) => option.id === selectedValue)?.name ?? selectedValue
              : isLoading ? "Loading related records…" : `Select ${field.label.toLocaleLowerCase()}`}
          </SelectValue>
        </SelectTrigger>
        {!field.required && value && <ClearSelectionButton label={field.label} onClear={() => { onChange(null); onBlur(); }} />}
      </div>
      <SelectContent>
        {availableOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ClearSelectionButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="absolute right-7 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      aria-label={`Clear ${label}`}
      title={`Clear ${label}`}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClear(); }}
    >
      <X aria-hidden="true" />
    </Button>
  );
}

function NotFoundPage({ message = "We couldn’t find the page you’re looking for." }: { message?: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center text-center">
      <p className="text-sm font-medium">Page not found</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button nativeButton={false} render={<Link to="/admin" />} variant="outline" className="mt-5">Back to overview</Button>
    </div>
  );
}
