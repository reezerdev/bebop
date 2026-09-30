import { APIError, betterAuth, type Auth, type BetterAuthOptions, type BetterAuthPlugin, type InferAPI } from "better-auth";
import { admin, jwt } from "better-auth/plugins";
import { jazzAdapter } from "jazz-tools/better-auth-adapter";
import type { BebopConfig } from "./bebop.ts";

export type CreateBebopBetterAuthOptions<Plugins extends readonly BetterAuthPlugin[] = []> = {
  config: BebopConfig;
  baseURL: string;
  secret: string;
  jazz: Parameters<typeof jazzAdapter>[0];
  /** Trusted server-side Better Auth settings. Bebop always installs its Admin and JWT plugins. */
  options?: Omit<BetterAuthOptions, "baseURL" | "secret" | "database" | "plugins" | "user"> & {
    user?: BetterAuthOptions["user"];
    plugins?: Plugins;
    admin?: Parameters<typeof admin>[0];
  };
};

type BebopBetterAuthOptions<Plugins extends readonly BetterAuthPlugin[]> = Omit<BetterAuthOptions, "plugins"> & {
  plugins: [...Plugins, ReturnType<typeof jwt>, ReturnType<typeof admin>];
};

type BebopPluginEndpoints = ReturnType<typeof jwt>["endpoints"] & ReturnType<typeof admin>["endpoints"];
export type BebopBetterAuth<Plugins extends readonly BetterAuthPlugin[] = []> = Auth<BebopBetterAuthOptions<Plugins>> & {
  api: Auth<BebopBetterAuthOptions<Plugins>>["api"] & InferAPI<BebopPluginEndpoints> & {
    getToken: (input: { headers: Headers }) => Promise<{ token: string }>;
    userHasPermission: (input: {
      headers: Headers;
      body: { permissions: Record<string, string[]>; userId?: string; role?: string };
    }) => Promise<{ success: boolean; error: string | null }>;
  };
};

const reservedUserFields = new Set([
  "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt",
  "role", "banned", "banReason", "banExpires",
]);

type BetterAuthAdditionalFields = NonNullable<NonNullable<BetterAuthOptions["user"]>["additionalFields"]>;

function authAdditionalFields(config: BebopConfig): BetterAuthAdditionalFields {
  const definition = config.collections.find((collection) => collection.auth);
  const fields: BetterAuthAdditionalFields = {};
  if (!definition) return fields;

  for (const field of definition.fields) {
    if (field.type === "join" || field.type === "relationship" || field.type === "upload") continue;
    if (reservedUserFields.has(field.name)) continue;
    const type = field.type === "text" ? "string"
      : field.type === "number" ? "number"
        : field.type === "checkbox" ? "boolean"
          : field.type === "date" ? "date"
            : field.type === "json" ? "json"
              : field.options.map((option) => typeof option === "string" ? option : option.value);
    fields[field.name] = {
      type,
      required: Boolean(field.required),
      // Custom values must be set by trusted code or an explicitly enabled field.
      input: field.auth?.input ?? false,
    } as (typeof fields)[string];
  }
  return fields;
}

function roleNames(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map((role) => String(role).trim()).filter(Boolean);
}

function lastAdminError(): APIError {
  return APIError.from("BAD_REQUEST", {
    code: "INVALID_USER",
    message: "At least one administrator must remain.",
  });
}

/**
 * Create the Better Auth instance paired with a Bebop auth collection.
 * Bebop owns the Jazz adapter, JWT plugin, and Better Auth Admin plugin;
 * the host still supplies its secret, public URL, and Jazz server database.
 */
export function createBebopBetterAuth<const Plugins extends readonly BetterAuthPlugin[] = []>(
  options: CreateBebopBetterAuthOptions<Plugins>,
): BebopBetterAuth<Plugins> {
  if (!options.config.collections.some((collection) => collection.auth)) {
    throw new Error('Bebop config needs one collection with `auth: true` before Better Auth can be created.');
  }

  const baseURL = options.baseURL.replace(/\/$/, "");
  const { admin: adminOptions, ...customOptions } = options.options ?? {};
  const userOptions = customOptions.user;
  const plugins = customOptions.plugins ?? [];
  const additionalFields = {
    ...userOptions?.additionalFields,
    ...authAdditionalFields(options.config),
  };
  const { user: _user, plugins: _plugins, databaseHooks: appDatabaseHooks, ...authOptions } = customOptions;
  const appUserCreateBefore = appDatabaseHooks?.user?.create?.before;
  const appUserUpdateBefore = appDatabaseHooks?.user?.update?.before;
  const appUserDeleteBefore = appDatabaseHooks?.user?.delete?.before;
  const configuredAdminRoles = adminOptions?.adminRoles;
  const adminRoles = (configuredAdminRoles === undefined
    ? ["admin"]
    : Array.isArray(configuredAdminRoles) ? configuredAdminRoles : [configuredAdminRoles])
    .flatMap((role) => role.split(",").map((name) => name.trim()).filter(Boolean));
  const adminUserIds = adminOptions?.adminUserIds ?? [];
  const isAdmin = (candidate: { id?: unknown; role?: unknown }) =>
    (typeof candidate.id === "string" && adminUserIds.includes(candidate.id)) || roleNames(candidate.role).some((role) => adminRoles.includes(role));
  const otherAdminsExist = async (listUsers: () => Promise<Array<{ id: string; role?: unknown }>>, userId: string) => {
    const users = await listUsers();
    return users.some((candidate) => candidate.id !== userId && isAdmin(candidate));
  };
  const databaseHooks: BetterAuthOptions["databaseHooks"] = {
    ...appDatabaseHooks,
    user: {
      ...appDatabaseHooks?.user,
      create: {
        ...appDatabaseHooks?.user?.create,
        before: async (user, context) => {
          const appResult = await appUserCreateBefore?.(user, context);
          if (appResult === false || !context) return appResult;

          const userData = appResult && typeof appResult === "object" && "data" in appResult
            ? { ...user, ...appResult.data }
            : user;
          const [firstUser] = await context.context.internalAdapter.listUsers(1);
          return firstUser === undefined
            ? { data: { ...userData, role: "admin" } }
            : appResult;
        },
      },
      update: {
        ...appDatabaseHooks?.user?.update,
        before: async (user, context) => {
          const appResult = await appUserUpdateBefore?.(user, context);
          if (appResult === false || !context) return appResult;

          const updateData = appResult && typeof appResult === "object" && "data" in appResult
            ? { ...user, ...appResult.data }
            : user;
          if (!Object.prototype.hasOwnProperty.call(updateData, "role")) return appResult;

          const requestBody = context.body as { userId?: unknown } | undefined;
          const targetUserId = typeof requestBody?.userId === "string"
            ? requestBody.userId
            : context.context.session?.user?.id;
          if (!targetUserId) {
            const users = await context.context.internalAdapter.listUsers();
            if (!roleNames(updateData.role).some((role) => adminRoles.includes(role)) && users.filter(isAdmin).length <= 1) {
              throw lastAdminError();
            }
            return appResult;
          }

          const targetUser = await context.context.internalAdapter.findUserById(targetUserId);
          if (targetUser && isAdmin(targetUser) && !isAdmin({ id: targetUser.id, role: updateData.role }) && !(await otherAdminsExist(() => context.context.internalAdapter.listUsers(), targetUser.id))) {
            throw lastAdminError();
          }
          return appResult;
        },
      },
      delete: {
        ...appDatabaseHooks?.user?.delete,
        before: async (user, context) => {
          const appResult = await appUserDeleteBefore?.(user, context);
          if (appResult === false || !context || !isAdmin(user)) return appResult;
          if (!(await otherAdminsExist(() => context.context.internalAdapter.listUsers(), user.id))) throw lastAdminError();
          return appResult;
        },
      },
    },
  };

  return betterAuth({
    ...authOptions,
    baseURL,
    secret: options.secret,
    database: jazzAdapter(options.jazz),
    emailAndPassword: { enabled: true, ...customOptions.emailAndPassword },
    user: {
      ...userOptions,
      additionalFields,
    },
    databaseHooks,
    plugins: [
      ...plugins,
      jwt({
        jwks: { keyPairConfig: { alg: "ES256" } },
        jwt: { issuer: baseURL, audience: baseURL },
      }),
      admin(adminOptions as Parameters<typeof admin>[0]),
    ],
  }) as BebopBetterAuth<Plugins>;
}
