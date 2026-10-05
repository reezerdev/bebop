import { createJazzSession } from "jazz-tools/backend";
import { createBebopAdminAccessHandler, createBebopBetterAuth } from "@bebopdev/core/server";
import { app } from "./bebop-generated-schema.js";
import bebopConfig from "./bebop.config.js";
import permissions from "./permissions.js";

type AuthServer = Awaited<ReturnType<typeof createAuthServer>>;
let authServerPromise: Promise<AuthServer> | undefined;

export function getAuthServer(): Promise<AuthServer> {
  authServerPromise ??= createAuthServer();
  return authServerPromise;
}

async function createAuthServer() {
  const baseURL = (process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
  const secret = process.env.BETTER_AUTH_SECRET;
  const appId = import.meta.env.VITE_JAZZ_APP_ID;
  const serverUrl = import.meta.env.VITE_JAZZ_SERVER_URL;
  const backendSecret = process.env.BACKEND_SECRET;

  if (!secret) throw new Error("Set BETTER_AUTH_SECRET in apps/web/.env before using the admin.");
  if (!appId || !serverUrl || !backendSecret) {
    throw new Error("The Jazz development server has not provided its app ID, URL, or backend secret yet.");
  }

  const jazzSession = await createJazzSession({
    app,
    permissions,
    appId,
    serverUrl,
    driver: { type: "memory" },
    env: process.env.NODE_ENV === "production" ? "prod" : "dev",
    jwksUrl: `${baseURL}/api/auth/jwks`,
    jwtIssuer: baseURL,
    jwtAudience: baseURL,
    initial: { backendSecret },
  });
  const snapshot = jazzSession.getSnapshot();
  if (snapshot.status !== "ready" || !snapshot.client) {
    await jazzSession.close();
    throw snapshot.error ?? new Error("The Jazz backend session is not ready.");
  }

  const auth = createBebopBetterAuth({
    config: bebopConfig,
    baseURL,
    secret,
    options: {
      admin: {
        adminUserIds: (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      },
    },
    jazz: {
      db: async () => snapshot.client!.db,
      schema: app.wasmSchema,
    },
  });

  const adminAccessHandler = createBebopAdminAccessHandler({
    config: bebopConfig,
    async resolveSession(request) {
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });
      if (!session) return null;

      const user = session.user as typeof session.user & { role?: string };
      const adminUserIds = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const roleAdmin = user.role?.split(",").some((role) => role.trim() === "admin") === true;
      const idAdmin = adminUserIds.includes(user.id);
      const permission = roleAdmin || idAdmin
        ? null
        : await auth.api.userHasPermission({ headers: request.headers, body: { permissions: { user: ["list"] } } });

      return { user, isAdmin: roleAdmin || idAdmin || permission?.success === true };
    },
    onError(error) {
      console.error("[bebop admin] Could not verify admin access:", error);
    },
  });

  return {
    auth,
    adminAccessHandler,
    async adminSetupStatus() {
      const users = await (await auth.$context).internalAdapter.listUsers(1);
      return Response.json({ available: users.length === 0 }, {
        headers: { "cache-control": "no-store" },
      });
    },
  };
}
