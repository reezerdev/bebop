import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createJazzSession } from "jazz-tools/backend";
import { createBebopAdminAccessHandler, createBebopBetterAuth, createBebopHandler } from "@bebopdev/core/server";
import { app } from "./bebop-generated-schema.js";
import commandPermissions from "./bebop-generated-command-permissions.js";
import bebopConfig from "./bebop.config.ts";
import { getBetterAuthURL } from "./auth-config.ts";

type AuthServerConfig = {
  appId?: string;
  serverUrl?: string;
  backendSecret?: string;
};

export async function createAuthServer(config: AuthServerConfig) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("Set BETTER_AUTH_SECRET in apps/playground/.env before using Better Auth.");
  }
  if (!config.appId || !config.serverUrl || !config.backendSecret) {
    throw new Error("The Jazz dev server has not provided its app ID, URL, or backend secret yet.");
  }
  const baseURL = getBetterAuthURL(process.env.BETTER_AUTH_URL);

  const jazzSession = await createJazzSession({
    app,
    // Keep command grants in this server-only session. The browser receives
    // permissions.ts, which denies direct writes to command collections.
    permissions: commandPermissions,
    appId: config.appId,
    driver: { type: "memory" },
    serverUrl: config.serverUrl,
    env: process.env.NODE_ENV === "production" ? "prod" : "dev",
    jwksUrl: `${baseURL}/api/auth/jwks`,
    jwtIssuer: baseURL,
    jwtAudience: baseURL,
    initial: { backendSecret: config.backendSecret },
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
      // Better Auth's Admin plugin assigns "user" by default. On a clean
      // database, promote the first account created through Better Auth so
      // the admin panel has an initial administrator, as in Payload's setup.
      // This only runs on the trusted server adapter; clients cannot choose a
      // role in the sign-up payload.
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              const existingUsers = await snapshot.client!.db.all(
                app.better_auth_user.select("id"),
                { tier: "global" },
              );
              return existingUsers.length === 0 ? { data: { role: "admin" } } : undefined;
            },
          },
        },
      },
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

  const commandHandler = createBebopHandler({
    app,
    config: bebopConfig,
    async resolveSession(request) {
      const origin = request.headers.get("origin");
      if (!origin || origin !== new URL(request.url).origin) return null;

      const headers = request.headers;
      const session = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      });
      if (!session) return null;

      // Exchange the verified Better Auth cookie for a short-lived JWT that
      // Jazz verifies via the configured Better Auth JWKS endpoint.
      const { token } = await auth.api.getToken({ headers });
      const jazzRequest = new Request(request.url, {
        headers: { authorization: `Bearer ${token}` },
      });
      const client = snapshot.client!;
      return {
        authorizationDb: await client.forRequest(jazzRequest),
        writeDb: await client.withAttributionForRequest(jazzRequest),
        userId: session.user.id,
      };
    },
  });

  const adminAccessHandler = createBebopAdminAccessHandler({
    config: bebopConfig,
    async resolveSession(request) {
      const headers = request.headers;
      const session = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      });
      if (!session) return null;

      const permission = await auth.api.userHasPermission({
        headers,
        body: { permissions: { user: ["list"] } },
      });
      return { user: session.user, isAdmin: permission.success };
    },
  });

  return {
    handler: toNodeHandler(auth.handler),
    commandHandler,
    adminAccessHandler,
    async adminSetupStatus(request: IncomingMessage, response: ServerResponse) {
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.setHeader("vary", "cookie");
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("allow", "GET");
        response.end(JSON.stringify({ message: "Method not allowed." }));
        return;
      }

      const users = await snapshot.client!.db.all(app.better_auth_user.select("id"), { tier: "global" });
      response.end(JSON.stringify({ available: users.length === 0 }));
    },
    async listUsers(request: IncomingMessage, response: ServerResponse) {
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("allow", "GET");
        response.end(JSON.stringify({ message: "Method not allowed." }));
        return;
      }

      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
        query: { disableCookieCache: true },
      });
      if (!session) {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Sign in to view authors." }));
        return;
      }

      const users = await snapshot.client!.db.all(app.better_auth_user.select("id", "name"), { tier: "global" });
      response.end(JSON.stringify(users.map(({ id, name }) => ({ id, name }))));
    },
    close: () => jazzSession.close(),
  };
}
