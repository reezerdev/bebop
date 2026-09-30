import type { MutationErrorEvent, PermissionAdvice } from "jazz-tools";
import type { BebopAdminManifest } from "../../types.js";

export type BebopAdminClient = object & {
  onMutationError: (listener: (event: MutationErrorEvent) => void) => () => void;
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

export type AdminOutletContext = {
  setDocumentBreadcrumb: (title: string | undefined) => void;
};
