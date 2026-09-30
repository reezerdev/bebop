import { useCallback, useMemo, useRef, useState, useEffect, type ComponentPropsWithRef, type ReactNode } from "react";
import { useAll, useDb, useOne } from "jazz-tools/react";
import type { QueryBuilder } from "jazz-tools";
import type { MutationErrorEvent, PermissionAdvice } from "jazz-tools";
import { Controller, useForm, type Control, type FieldErrors, type FieldPath, type FieldValues, type RegisterOptions, type UseFormRegister } from "react-hook-form";
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
    setUserPassword: (input: { userId: string; newPassword: string }) => Promise<{
      data?: { status: boolean } | null;
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
  /** Collections that create related records can provide their own client-side preflight. Jazz still validates the write. */
  preflightCreate?: (collectionSlug: string, data: Record<string, unknown>) => PermissionAdvice | undefined | Promise<PermissionAdvice | undefined>;
  /** Related-record updates can use the same server-authoritative preflight. */
  preflightUpdate?: (collectionSlug: string, data: Record<string, unknown>) => PermissionAdvice | undefined | Promise<PermissionAdvice | undefined>;
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

function collectionTitleFields(collection: BebopAdminCollection): BebopAdminStoredField[] {
  const names = collection.useAsTitle === undefined
    ? []
    : typeof collection.useAsTitle === "string" ? [collection.useAsTitle] : collection.useAsTitle;
  return names.flatMap((name) => {
    const field = fieldByName(collection, name);
    return field && field.kind !== "join" ? [field] : [];
  });
}

function composeCollectionTitle(
  collection: BebopAdminCollection,
  readValue: (field: BebopAdminStoredField) => unknown,
  relationOptions?: BebopAdminProps["relationOptions"],
): string | undefined {
  const parts = collectionTitleFields(collection).flatMap((field) => {
    const value = readValue(field);
    if (value === null || value === undefined || value === "") return [];
    if (field.kind === "relation" || field.kind === "upload") {
      const label = relationOptions?.[field.relationTo ?? ""]?.find((option) => option.id === value)?.name;
      return [label ?? String(value)];
    }
    return [field.kind === "select" ? selectLabel(field, String(value)) : String(value)];
  });
  const title = parts.join(" · ").trim();
  return title || undefined;
}

function recordTitle(collection: BebopAdminCollection, row: AdminRecord, relationOptions?: BebopAdminProps["relationOptions"]): string | undefined {
  return composeCollectionTitle(collection, (field) => valueFor(field, row), relationOptions);
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

function RelatedCollectionLabels({ app, client, collection, ids, relationOptions, onChange }: {
  app: object;
  client: BebopAdminClient;
  collection: BebopAdminCollection;
  ids: readonly string[];
  relationOptions?: BebopAdminProps["relationOptions"];
  onChange: (slug: string, options: readonly RelationOption[]) => void;
}) {
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const query = ids.length
    ? getMutations(client, collection.slug)?.query({ where: { id: { in: [...ids] } } })
    : undefined;
  const { data } = useAll<AdminRecord>(query);
  const readPermissions = useRowReadPermissions(db, table, data ?? []);
  const options = useMemo(() => (data ?? [])
    .filter((row) => readPermissions[row.id] !== "denied")
    .map((row) => ({ id: row.id, name: recordTitle(collection, row, relationOptions) ?? row.id })),
  [collection, data, readPermissions, relationOptions]);

  useEffect(() => { onChange(collection.slug, options); }, [collection.slug, onChange, options]);
  return null;
}

export function BebopAdmin({ app, client, manifest, canAccessAdmin, canManageUsers = false, authClient, user, createDefaults, preflightCreate, preflightUpdate, relationOptions, onLogout }: BebopAdminProps) {
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
        { path: "collections/:collectionSlug/create", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} preflightCreate={preflightCreate} preflightUpdate={preflightUpdate} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "collections/:collectionSlug/:id", element: <EditorRoute app={app} client={client} manifest={manifest} createDefaults={createDefaults} preflightCreate={preflightCreate} preflightUpdate={preflightUpdate} relationOptions={relationOptions} authClient={authClient} canManageUsers={canManageUsers} /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);

  return canAccessAdmin ? route : <main className="bebop-admin grid min-h-svh place-items-center bg-background px-6 font-sans text-foreground"><p role="alert">You do not have access to the Bebop admin.</p></main>;
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
    <div ref={portalContainer} className="bebop-admin min-h-svh bg-background font-sans text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-68 flex-col border-r border-sidebar-border bg-background text-sidebar-foreground transition-transform duration-200 ${sidebarCollapsed ? "-translate-x-full" : ""} ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}`}>
        <div className="flex h-12 shrink-0 items-center px-4 max-md:hidden">
          <Button variant="outline" size="icon-xs" aria-label="Collapse sidebar" onClick={() => setSidebarCollapsed(true)}>
            <ArrowLeft size={18} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pt-1 pb-6">
          <button className="mb-1 flex w-full items-center justify-between bg-transparent py-1 text-left text-[13px] text-muted-foreground hover:text-foreground" aria-expanded={collectionsOpen} onClick={() => setCollectionsOpen((open) => !open)}>
            <span>Collections</span><ChevronUp size={16} className={collectionsOpen ? "" : "rotate-180"} />
          </button>
          {collectionsOpen && <nav aria-label="Collections" className="flex flex-col">
            {collections.map((collection) => (
              <NavLink
                key={collection.slug}
                to={`/admin/collections/${collection.slug}`}
                className={({ isActive }) => `relative flex min-h-7 items-center text-[13px] leading-5 no-underline transition-colors hover:text-foreground ${isActive ? "font-semibold text-foreground before:absolute before:-left-5 before:top-1/2 before:h-3 before:w-0.5 before:-translate-y-1/2 before:bg-foreground before:content-['']" : "font-normal text-sidebar-foreground/85"}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="truncate">{collection.labels.plural}</span>
              </NavLink>
            ))}
          </nav>}
        </div>
        <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-none bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">{avatarInitials}</div>
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
      {mobileOpen && <button className="hidden max-md:fixed max-md:inset-0 max-md:z-30 max-md:block max-md:bg-black/30" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className={`min-h-svh transition-[padding] duration-200 max-md:pl-0 ${sidebarCollapsed ? "pl-0" : "pl-68"}`}>
        <header className="sticky top-0 z-20 flex h-12 items-center bg-background px-6 lg:px-15 max-md:px-3">
          <Button variant="ghost" size="icon" className="hidden max-md:mr-2 max-md:inline-flex" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </Button>
          {sidebarCollapsed && <Button variant="outline" size="icon" className="mr-3 max-md:hidden" aria-label="Expand sidebar" onClick={() => setSidebarCollapsed(false)}><ChevronRight size={18} /></Button>}
          <div className="flex items-center gap-3 text-[13px] font-normal">
            <Link to="/admin" className="flex size-8 items-center justify-center rounded-none bg-foreground text-base font-bold lowercase text-background no-underline" aria-label="Bebop dashboard">b</Link>
            <span className="text-muted-foreground">/</span>
            {currentCollection ? <Link to={`/admin/collections/${currentCollection.slug}`} className="hover:underline">{currentCollection.labels.plural}</Link> : <span>Dashboard</span>}
            {(isCreateRoute || isDocumentRoute) && <><span className="text-muted-foreground">/</span><span className="max-w-56 truncate" title={currentDocumentBreadcrumb}>{isCreateRoute ? `New ${currentCollection?.labels.singular ?? "document"}` : currentDocumentBreadcrumb ?? "Document"}</span></>}
            {activeCollection && !currentCollection && <span>Not found</span>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-6 pt-2 pb-6 lg:px-15 max-md:p-4">
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

function SelectionCheckbox(props: ComponentPropsWithRef<"input">) {
  return <input {...props} type="checkbox" className="appearance-none inline-grid size-4 shrink-0 cursor-pointer place-content-center border border-input bg-transparent before:content-[''] before:h-1 before:w-[0.45rem] before:scale-0 before:-rotate-45 before:border-b-2 before:border-l-2 before:border-primary-foreground checked:border-primary checked:bg-primary checked:before:scale-100 indeterminate:border-primary indeterminate:bg-primary indeterminate:before:h-0 indeterminate:before:scale-100 indeterminate:before:rotate-0 indeterminate:before:border-l-0 indeterminate:before:border-b-0 indeterminate:before:border-t-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50" />;
}

function EditorHeading({ title, action, modal = false }: { title: string; action?: ReactNode; modal?: boolean }) {
  return <div className={`flex min-h-20 items-center justify-between gap-4 border-b border-border pb-4 ${modal ? "px-6 pt-4 lg:px-11" : ""}`}><h1 className="min-w-0 truncate text-[32px] font-normal leading-tight tracking-tight" title={title}>{title}</h1>{action}</div>;
}

function EditorMeta({ details, actions, modal = false }: { details: ReactNode; actions?: ReactNode; modal?: boolean }) {
  return (
    <div className={`flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border py-3 ${modal ? "px-6 lg:px-11" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">{details}</div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}

function EditorField({ children, error }: { children: ReactNode; error?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 [&_[data-slot=input]]:h-10 [&_[data-slot=input]]:w-full [&_[data-slot=input]]:border [&_[data-slot=input]]:border-input [&_[data-slot=input]]:bg-muted/50 [&_[data-slot=input]]:px-3 [&_[data-slot=input]]:py-2 [&_[data-slot=input]]:text-[13px] [&_[data-slot=select-trigger]]:h-10 [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:border [&_[data-slot=select-trigger]]:border-input [&_[data-slot=select-trigger]]:bg-muted/50 [&_[data-slot=select-trigger]]:px-3 [&_[data-slot=select-trigger]]:py-2 [&_[data-slot=select-trigger]]:text-[13px] [&_[data-slot=textarea]]:min-h-32 [&_[data-slot=textarea]]:w-full [&_[data-slot=textarea]]:border [&_[data-slot=textarea]]:border-input [&_[data-slot=textarea]]:bg-muted/50 [&_[data-slot=textarea]]:px-3 [&_[data-slot=textarea]]:py-2 [&_[data-slot=textarea]]:text-[13px]">
      {children}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {collections.map((collection) => (
          <article key={collection.slug} className="flex min-h-40 items-start justify-between rounded-none border border-border bg-card p-5 text-card-foreground transition-colors hover:border-foreground/20">
            <Link to={`/admin/collections/${collection.slug}`} className="pt-1 text-base font-medium text-card-foreground no-underline hover:underline">{collection.labels.plural}</Link>
            <Link to={`/admin/collections/${collection.slug}/create`} className="flex size-9 shrink-0 items-center justify-center rounded-none border border-border text-card-foreground no-underline transition-colors hover:bg-accent" aria-label={`Create ${collection.labels.singular}`}>
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
                  <span>{fieldByName(collection, column)?.label ?? formatLabel(column)}</span>
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
            return <TableHead key={name} className="h-10 text-[13px] font-normal normal-case tracking-normal"><button className="inline-flex items-center gap-2 font-normal text-muted-foreground hover:text-foreground" onClick={() => { setSort((current) => ({ field: name, direction: current.field === name && current.direction === "asc" ? "desc" : "asc" })); setPage(1); }}>{fieldByName(collection, name)?.label ?? formatLabel(name)}<SortIcon size={13} /></button></TableHead>;
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

type AuthUserFormValues = {
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  password: string;
  [field: string]: string | boolean;
};

const authUserBuiltinFieldNames = new Set([
  "id", "name", "email", "emailVerified", "role", "banned", "banReason", "banExpires", "createdAt", "updatedAt",
]);

function authUserProfileFields(collection: BebopAdminCollection) {
  return collection.fields.filter((field) =>
    (field.name === "image" || !authUserBuiltinFieldNames.has(field.name)) &&
    (field.kind === "text" || field.kind === "select" || field.kind === "boolean"),
  ).sort((left, right) => Number(left.name === "image") - Number(right.name === "image"));
}

function authUserFormDefaults(collection: BebopAdminCollection, user?: Record<string, unknown>): AuthUserFormValues {
  const values: AuthUserFormValues = {
    name: String(user?.name ?? ""),
    email: String(user?.email ?? ""),
    role: primaryAuthRole(user?.role),
    emailVerified: user?.emailVerified === true,
    password: "",
  };
  for (const field of authUserProfileFields(collection)) {
    const value = user?.[field.name];
    values[field.name] = field.kind === "boolean" ? value === true : String(value ?? "");
  }
  return values;
}

function authUserProfileData(collection: BebopAdminCollection, values: AuthUserFormValues, existingUser?: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of authUserProfileFields(collection)) {
    const value = values[field.name] ?? (field.kind === "boolean" ? false : "");
    if (existingUser) {
      const previousValue = existingUser[field.name] ?? (field.kind === "boolean" ? false : "");
      if (!Object.is(value, previousValue)) data[field.name] = value;
    } else if (field.required || value !== "") {
      data[field.name] = value;
    }
  }
  return data;
}

function primaryAuthRole(value: unknown): string {
  const roles = (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .map((role) => String(role).trim())
    .filter(Boolean);
  return roles.includes("admin") ? "admin" : roles[0] ?? "user";
}

function AuthUserFields({ collection, register, control, errors, includePassword = false, passwordPanel, disabled = false }: {
  collection: BebopAdminCollection;
  register: UseFormRegister<AuthUserFormValues>;
  control: Control<AuthUserFormValues>;
  errors: FieldErrors<AuthUserFormValues>;
  includePassword?: boolean;
  passwordPanel?: ReactNode;
  disabled?: boolean;
}) {
  const roleField = collection.fields.find((field) => field.name === "role");
  const options = roleField?.kind === "select" && roleField.options?.length ? roleField.options : ["user", "admin"];
  const roleLabel = (value: string) => {
    const label = roleField?.kind === "select" ? selectLabel(roleField, value) : formatLabel(value);
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
  };
  const profileFields = authUserProfileFields(collection);

  return (
    <fieldset disabled={disabled} className="m-0 grid min-w-0 grid-cols-1 border-0 p-0 lg:grid-cols-[minmax(0,1fr)_minmax(260px,31%)]">
      <section aria-label="Email and password" className="col-span-1 mb-2 mt-7 flex min-w-0 flex-col gap-6 rounded-[3px] bg-card px-6 py-8 text-card-foreground ring-1 ring-foreground/5 sm:px-10 sm:py-10 lg:col-span-2">
        <EditorField error={errors.email?.message}>
          <Label htmlFor="bebop-user-email" className="text-[13px] font-normal normal-case tracking-normal">Email <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email", {
            required: "Enter an email address.",
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address." },
          })} />
        </EditorField>
        {passwordPanel}
        {includePassword && <EditorField error={errors.password?.message}>
          <Label htmlFor="bebop-user-password" className="text-[13px] font-normal normal-case tracking-normal">Password <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register("password", { required: "Enter an initial password." })} />
          <p className="text-xs text-muted-foreground">Better Auth hashes and stores this password; the admin UI does not keep a copy.</p>
        </EditorField>}
        <EditorField>
          <label htmlFor="bebop-user-email-verified" className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
            <input id="bebop-user-email-verified" type="checkbox" className="size-4 accent-primary" {...register("emailVerified")} />
            <span>Email verified</span>
          </label>
        </EditorField>
      </section>
      <div className="min-w-0 space-y-6 py-7 lg:pr-10">
        <EditorField error={errors.name?.message}>
          <Label htmlFor="bebop-user-name" className="text-[13px] font-normal normal-case tracking-normal">Name <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register("name", { required: "Enter a name." })} />
        </EditorField>
        {profileFields.map((field) => {
          const name = field.name as FieldPath<AuthUserFormValues>;
          const error = errors[name]?.message;
          const label = <>{field.label}{field.required && <> <span className="text-destructive">*</span></>}</>;
          if (field.kind === "select") {
            return <EditorField key={field.name} error={error}>
              <Label htmlFor={`bebop-user-${field.name}`} className="text-[13px] font-normal normal-case tracking-normal">{label}</Label>
              <Controller
                control={control}
                name={name}
                rules={field.required ? { required: `Select ${field.label.toLocaleLowerCase()}.` } : undefined}
                render={({ field: input }) => <Select value={String(input.value ?? "")} onValueChange={input.onChange}>
                  <SelectTrigger id={`bebop-user-${field.name}`} ref={input.ref} onBlur={input.onBlur} className="w-full">
                    <SelectValue placeholder={`Select ${field.label.toLocaleLowerCase()}`}>{(value: string | null) => value ? selectLabel(field, value) : `Select ${field.label.toLocaleLowerCase()}`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>{(field.options ?? []).map((option) => <SelectItem key={option} value={option}>{selectLabel(field, option)}</SelectItem>)}</SelectContent>
                </Select>}
              />
            </EditorField>;
          }
          if (field.kind === "boolean") {
            return <EditorField key={field.name} error={error}>
              <label htmlFor={`bebop-user-${field.name}`} className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
                <input id={`bebop-user-${field.name}`} type="checkbox" className="size-4 accent-primary" {...register(name, field.required ? { required: `Select ${field.label.toLocaleLowerCase()}.` } : undefined)} />
                <span>{label}</span>
              </label>
            </EditorField>;
          }
          return <EditorField key={field.name} error={error}>
            <Label htmlFor={`bebop-user-${field.name}`} className="text-[13px] font-normal normal-case tracking-normal">{label}</Label>
            <Input id={`bebop-user-${field.name}`} autoComplete={field.name === "image" ? "url" : "off"} aria-invalid={Boolean(error)} {...register(name, field.required ? { required: `Enter ${field.label.toLocaleLowerCase()}.` } : undefined)} />
          </EditorField>;
        })}
      </div>
      <aside className="min-w-0 space-y-6 border-t border-border py-7 lg:border-t-0 lg:border-l lg:pl-8" aria-label="Additional user information">
        <EditorField error={errors.role?.message}>
          <Label htmlFor="bebop-user-role" className="text-[13px] font-normal normal-case tracking-normal">Role <span className="text-destructive">*</span></Label>
          <Controller
            control={control}
            name="role"
            rules={{ required: "Select a role." }}
            render={({ field: input }) => <Select value={input.value || "user"} onValueChange={input.onChange}>
              <SelectTrigger id="bebop-user-role" ref={input.ref} onBlur={input.onBlur} className="w-full">
                <SelectValue placeholder="Select role">{(value: string | null) => roleLabel(value ?? input.value ?? "user")}</SelectValue>
              </SelectTrigger>
              <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{roleLabel(option)}</SelectItem>)}</SelectContent>
            </Select>}
          />
        </EditorField>
      </aside>
    </fieldset>
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
  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<AuthUserFormValues>({
    defaultValues: authUserFormDefaults(collection),
  });

  if (!canManageUsers) {
    return <section><PageTitle title={`Create ${collection.labels.singular}`} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Only a Better Auth administrator can create users.</p></section>;
  }
  if (!authClient) {
    return <section><PageTitle title={`Create ${collection.labels.singular}`} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Pass a Better Auth client configured with adminClient() to enable user management.</p></section>;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSaveError(undefined);
    try {
      const response = await authClient.admin.createUser({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        role: primaryAuthRole(values.role),
        data: { emailVerified: values.emailVerified, ...authUserProfileData(collection, values) },
      });
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
    <div>
      <EditorHeading title={`New ${collection.labels.singular}`} />
      <form onSubmit={onSubmit} noValidate>
        <EditorMeta
          details={<span className="text-muted-foreground">New document</span>}
          actions={<>
            <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create"}</Button>
            <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" disabled={isSubmitting} onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
          </>}
        />
        {saveError && <p role="alert" className="border-b border-border py-3 text-[13px] text-destructive">{saveError}</p>}
        <AuthUserFields collection={collection} register={register} control={control} errors={errors} includePassword disabled={isSubmitting} />
      </form>
    </div>
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
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<AuthUserFormValues>({
    defaultValues: authUserFormDefaults(collection),
  });

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
      const loadedUser = response.data;
      setUser(loadedUser);
      reset(authUserFormDefaults(collection, loadedUser));
    }).catch((caught: unknown) => {
      if (!active) return;
      setLoadError(caught instanceof Error ? caught.message : "Better Auth could not load this user.");
      setUser(undefined);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authClient, canManageUsers, collection, id, reset]);

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

  const onSubmit = handleSubmit(async (values) => {
    if (!user) return;
    setSaveError(undefined);
    if (changingPassword && !newPassword) {
      setSaveError("Enter a new password.");
      return;
    }
    if (changingPassword && newPassword !== confirmPassword) {
      setSaveError("Passwords do not match.");
      return;
    }
    const data: Record<string, unknown> = {};
    Object.assign(data, authUserProfileData(collection, values, user));
    const normalizedName = values.name.trim();
    const normalizedEmail = values.email.trim();
    const normalizedRole = primaryAuthRole(values.role);
    if (normalizedName !== String(user.name ?? "")) data.name = normalizedName;
    if (normalizedEmail !== String(user.email ?? "")) data.email = normalizedEmail;
    if (normalizedRole !== primaryAuthRole(user.role)) data.role = normalizedRole;
    if (values.emailVerified !== (user.emailVerified === true)) data.emailVerified = values.emailVerified;
    if (!Object.keys(data).length && !changingPassword) {
      reset(authUserFormDefaults(collection, user));
      return;
    }
    let updatedUser = user;
    let profileUpdated = false;
    try {
      if (Object.keys(data).length) {
        const response = await authClient.admin.updateUser({ userId: id, data });
        if (response.error || !response.data) {
          throw new Error(response.error?.message || "Better Auth did not return the updated user.");
        }
        updatedUser = response.data;
        profileUpdated = true;
        setUser(updatedUser);
        reset(authUserFormDefaults(collection, updatedUser));
      }
      if (changingPassword) {
        const response = await authClient.admin.setUserPassword({ userId: id, newPassword });
        if (response.error || !response.data?.status) {
          const reason = response.error?.message || "Better Auth did not confirm the password change.";
          throw new Error(profileUpdated ? `Profile changes were saved, but the password could not be changed: ${reason}` : reason);
        }
      }
      if (!profileUpdated) setUser(updatedUser);
      reset(authUserFormDefaults(collection, updatedUser));
      setChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.add({
        type: "success",
        title: `${collection.labels.singular} updated`,
        description: changingPassword ? "Account changes and password were saved." : "Better Auth saved the account changes.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Could not update ${collection.labels.singular.toLocaleLowerCase()}.`;
      setSaveError(message);
      toast.add({ type: "error", title: `Could not update ${collection.labels.singular.toLocaleLowerCase()}`, description: message });
    }
  });

  if (loading) return (
    <div>
      <EditorHeading title={collection.labels.singular} />
      <p className="border-b border-border py-3 text-[13px] text-muted-foreground" role="status">Loading user…</p>
    </div>
  );
  if (loadError || !user) return (
    <div>
      <EditorHeading title={collection.labels.singular} />
      <EditorMeta
        details={<span className="text-muted-foreground">Could not load this user.</span>}
        actions={
          <Button variant="outline" size="sm" className="normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Back to Users</Button>
        }
      />
      <p role="alert" className="border-b border-border py-3 text-[13px] text-destructive">{loadError ?? "User not found."}</p>
    </div>
  );

  return (
    <div>
      <EditorHeading title={title} />
      <form onSubmit={onSubmit} noValidate>
        <EditorMeta
          details={
            <>
              <span><span className="text-muted-foreground">Last Modified: </span>{formatDate(user.updatedAt, true)}</span>
              <span><span className="text-muted-foreground">Created: </span>{formatDate(user.createdAt, true)}</span>
            </>
          }
          actions={
            <>
              <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={(!isDirty && !(changingPassword && (newPassword.length > 0 || confirmPassword.length > 0))) || isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button>
              <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" disabled={isSubmitting} onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
            </>
          }
        />
        {saveError && <p role="alert" className="border-b border-border py-3 text-[13px] text-destructive">{saveError}</p>}
        <AuthUserFields
          collection={collection}
          register={register}
          control={control}
          errors={errors}
          disabled={isSubmitting}
          passwordPanel={changingPassword ? <>
            <EditorField>
              <Label htmlFor="bebop-user-new-password" className="text-[13px] font-normal normal-case tracking-normal">New Password <span className="text-destructive">*</span></Label>
              <Input id="bebop-user-new-password" type="password" autoComplete="new-password" aria-required="true" value={newPassword} onChange={(event) => setNewPassword(event.currentTarget.value)} />
            </EditorField>
            <EditorField>
              <Label htmlFor="bebop-user-confirm-password" className="text-[13px] font-normal normal-case tracking-normal">Confirm Password <span className="text-destructive">*</span></Label>
              <Input id="bebop-user-confirm-password" type="password" autoComplete="new-password" aria-required="true" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
            </EditorField>
            <div>
              <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => {
                setChangingPassword(false);
                setNewPassword("");
                setConfirmPassword("");
                setSaveError(undefined);
              }}>Cancel</Button>
            </div>
          </> : <div>
            <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => {
              setChangingPassword(true);
              setSaveError(undefined);
            }}>Change Password</Button>
          </div>}
        />
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
  const titleField = titleFields.find((field) => field.kind === "text") ?? titleFields[0];
  const searchField = titleFields.find((field) => field.kind === "text") ?? fieldByName(collection, collection.listSearchableFields[0] ?? "");
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
    ? recordTitle(collection, pendingDelete[0], displayRelationOptions) ?? pendingDelete[0].id
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
          relationOptions={displayRelationOptions}
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
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search by ${searchLabel}`} className="h-8 pl-10 text-[13px] focus-visible:bg-background" aria-label={`Search by ${searchLabel}`} />
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
        ) : totalRows === 0 ? (
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

function EditorRoute({ app, client, manifest, createDefaults, preflightCreate, preflightUpdate, relationOptions, authClient, canManageUsers }: Pick<BebopAdminProps, "app" | "client" | "manifest" | "createDefaults" | "preflightCreate" | "preflightUpdate" | "relationOptions" | "authClient" | "canManageUsers">) {
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
  return <DocumentEditor key={`${collectionSlug}:${id ?? "new"}:${searchParams.toString()}`} app={app} client={client} manifest={manifest} collection={collection} id={id} createDefaults={createDefaults?.[collectionSlug]} preflightCreate={preflightCreate} preflightUpdate={preflightUpdate} joinContext={joinContext} relationOptions={relationOptions} />;
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

function DocumentEditor({ app, client, manifest, collection, id, createDefaults, preflightCreate, preflightUpdate, joinContext, relationOptions, modal }: { app: object; client: BebopAdminClient; manifest: BebopAdminManifest; collection: BebopAdminCollection; id?: string; createDefaults?: Readonly<Record<string, unknown>>; preflightCreate?: BebopAdminProps["preflightCreate"]; preflightUpdate?: BebopAdminProps["preflightUpdate"]; joinContext?: JoinNavigationContext; relationOptions?: BebopAdminProps["relationOptions"]; modal?: EditorModalOptions }) {
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
  const titleFields = collectionTitleFields(collection);
  const [titleRelationOptions, setTitleRelationOptions] = useState<Record<string, readonly RelationOption[]>>({});
  const onTitleRelatedOptions = useCallback((slug: string, options: readonly RelationOption[]) => {
    setTitleRelationOptions((current) => {
      const previous = current[slug];
      if (previous?.length === options.length && previous.every((option, index) => option.id === options[index].id && option.name === options[index].name)) return current;
      return { ...current, [slug]: options };
    });
  }, []);
  const titleRelationIds = new Map<string, Set<string>>();
  for (const field of titleFields) {
    if (field.kind !== "relation" || !field.relationTo) continue;
    const value = Object.hasOwn(watchedValues, field.name) ? watchedValues[field.name] : existing ? valueFor(field, existing) : undefined;
    if (typeof value !== "string" || !value) continue;
    const ids = titleRelationIds.get(field.relationTo) ?? new Set<string>();
    ids.add(value);
    titleRelationIds.set(field.relationTo, ids);
  }
  const resolvedTitleRelationOptions = useMemo(() => ({ ...titleRelationOptions, ...relationOptions }), [relationOptions, titleRelationOptions]);
  const titleValue = composeCollectionTitle(
    collection,
    (field) => Object.hasOwn(watchedValues, field.name) ? watchedValues[field.name] : existing ? valueFor(field, existing) : undefined,
    resolvedTitleRelationOptions,
  );
  const title = titleValue ?? (id ? `Untitled ${collection.labels.singular.toLocaleLowerCase()}` : `New ${collection.labels.singular}`);
  const parentLabel = (existing ? recordTitle(collection, existing, resolvedTitleRelationOptions) : undefined) ?? id ?? "";
  const mainFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join" && !field.generated && !field.admin?.hidden && field.admin?.position !== "sidebar");
  const sidebarFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join" && !field.generated && !field.admin?.hidden && field.admin?.position === "sidebar");
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
    const check = (async () => {
      if (id) {
        const preflight = await preflightUpdate?.(collection.slug, serializedValues);
        return preflight ?? db.canUpdate(table, id, serializedValues);
      }
      const preflight = await preflightCreate?.(collection.slug, serializedValues);
      return preflight ?? db.canInsert(table, serializedValues);
    })();
    void check.then((advice) => {
      if (active) setPermissionAdvice(advice);
    }).catch(() => {
      if (active) setPermissionAdvice("unknown");
    });
    return () => { active = false; };
  }, [collection.slug, collection.upload, collection.writeMode, db, existing, id, preflightCreate, preflightUpdate, serializedValuesKey, table]);

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
      const preflight = !collection.upload && collection.writeMode !== "command"
        ? await (id ? preflightUpdate?.(collection.slug, document) : preflightCreate?.(collection.slug, document))
        : undefined;
      const advice = collection.upload || collection.writeMode === "command" ? "unknown" : id
        ? preflight ?? await db.canUpdate(table, id, document)
        : preflight ?? await db.canInsert(table, document);
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
      <EditorField key={field.name} error={errors[field.name] ? String(errors[field.name]?.message ?? "Invalid value") : undefined}>
        {field.kind === "boolean" ? (
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
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
      </EditorField>
    );
  }

  return (
    <div>
      {[...titleRelationIds].map(([slug, ids]) => {
        const relatedCollection = manifest.collections[slug];
        return relatedCollection ? <RelatedCollectionLabels
          key={`title:${slug}`}
          app={app}
          client={client}
          collection={relatedCollection}
          ids={[...ids].sort()}
          relationOptions={relationOptions}
          onChange={onTitleRelatedOptions}
        /> : null;
      })}
      <EditorHeading title={title} modal={Boolean(modal)} action={modal && <Button type="button" variant="ghost" size="icon" aria-label="Close media editor" onClick={modal.onClose}><X size={20} /></Button>} />
      <form onSubmit={handleSubmit(save)}>
        <EditorMeta
          modal={Boolean(modal)}
          details={id && collection.timestamps ? <>
            <span><span className="text-muted-foreground">Last Modified: </span>{formatDate(existing?.$updatedAt, true)}</span>
            <span><span className="text-muted-foreground">Created: </span>{formatDate(existing?.$createdAt, true)}</span>
          </> : <span className="text-muted-foreground">{modal ? `${id ? "Editing" : "Creating new"} ${collection.labels.singular}` : "New document"}</span>}
          actions={
            <>
              <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={isSubmitting || saveApplied || permissionAdvice === "denied" || Boolean(id && !isDirty && !selectedFile)}>{saveApplied ? "Local write applied" : modal || id ? "Save" : "Create"}</Button>
              <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => modal ? modal.onClose() : navigate(joinReturnPath ?? `/admin/collections/${collection.slug}`)}>Cancel</Button>
            </>
          }
        />
        {permissionAdvice === "denied" && <p className="border-b border-border py-3 text-[13px] text-destructive" role="status">{id ? "Your current session cannot update this document." : "Your current session cannot create this document."}</p>}
        {saveError && <p className="border-b border-border py-3 text-[13px] text-destructive" role="alert">{saveError}</p>}
        {saveApplied && !saveError && <p className="border-b border-border py-3 text-[13px] text-muted-foreground" role="status">The local change was applied. Jazz may still be syncing it.</p>}
        <fieldset disabled={Boolean(saveApplied || (id && permissionAdvice === "denied"))} className={`m-0 grid min-w-0 grid-cols-1 border-0 p-0 ${sidebarFields.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(260px,31%)]" : ""}`}>
          <div className={`min-w-0 space-y-6 py-7 ${modal ? "px-6 lg:px-11" : "lg:pr-10"}`}>
            {collection.upload && <div className="flex flex-col gap-2">
              <Label className="text-[13px] font-normal">File {!id && <span className="text-destructive">*</span>}</Label>
              {selectedFile
                ? <PendingUploadPreview file={selectedFile} onClear={() => setSelectedFile(undefined)} />
                : id && typeof existing?.filename === "string" && <MediaPreview client={client} collection={collection.slug} id={id} filename={existing.filename} mimeType={String(existing.mimeType ?? "")} />}
              <UploadDropzone onFile={(file) => { setFileError(validateSelectedFile(file, collection.upload)); setSelectedFile(validateSelectedFile(file, collection.upload) ? undefined : file); }}
                accept={collection.upload.mimeTypes.join(",")} label={id ? "Replace file" : "Choose file"} error={fileError} />
            </div>}
            {mainFields.map(renderField)}
          </div>
          {sidebarFields.length > 0 && <aside className={`min-w-0 space-y-6 border-t border-border py-7 lg:border-t-0 lg:border-l ${modal ? "px-6 lg:px-11" : "lg:pl-8"}`} aria-label="Additional fields">
            {sidebarFields.map(renderField)}
            {id && <div className="flex flex-col gap-1 border-t border-border pt-5 text-xs text-muted-foreground"><span>Document ID</span><code className="break-all text-foreground">{id}</code></div>}
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
          className="rounded-none border-l border-border bg-background font-sans text-foreground shadow-2xl bebop-admin"
          style={{ width: "90vw", height: "100dvh", maxHeight: "100dvh", margin: 0 }}
        >
          <div ref={mediaPortal} className="h-full min-h-0 overflow-y-auto">
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
                  {mediaDialog.mode === "choose" ? <div className="relative min-h-full px-6 py-8 lg:px-15 max-md:px-4 max-md:py-5">
                    <Button type="button" className="absolute right-4 top-4 z-10" variant="ghost" size="icon" aria-label="Close media picker" onClick={closeMediaDialog}><X size={20} /></Button>
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
                    <TableCell className="w-12"><SelectionCheckbox aria-label={`Select ${recordTitle(targetCollection, row, relationOptions) ?? row.id}`} checked={selectedIds.has(row.id)} disabled={rowPermissions[row.id]?.update === "denied" && rowPermissions[row.id]?.delete === "denied"} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /></TableCell>
                    {visible.map((column) => {
                      const candidate = fieldByName(targetCollection, column);
                      const value = candidate ? valueFor(candidate, row) : row[column];
                      const displayValue = candidate?.kind === "relation" && candidate.name === field.on && value === parentId
                        ? parentLabel
                        : formatCell(candidate, value, relationOptions);
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
  const availableOptions = options ?? readableRelatedRows.map((row) => ({
    id: row.id,
    name: targetCollection ? recordTitle(targetCollection, row) ?? row.id : row.id,
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
