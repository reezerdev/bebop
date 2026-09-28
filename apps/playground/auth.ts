import { betterAuth as createBetterAuth } from "better-auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createJazzSession } from "jazz-tools/backend";
import { jazzAdapter } from "jazz-tools/better-auth-adapter";
import { createBebopHandler } from "@bebopdev/core/server";
import { app } from "./bebop-generated-schema.js";
import commandPermissions from "./bebop-generated-command-permissions.js";
import bebopConfig from "./bebop.config.ts";
import { authOptions } from "./auth-options.ts";

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

  const jazzSession = await createJazzSession({
    app,
    // Keep command grants in this server-only session. The browser receives
    // permissions.ts, which denies direct writes to command collections.
    permissions: commandPermissions,
    appId: config.appId,
    driver: { type: "memory" },
    serverUrl: config.serverUrl,
    env: process.env.NODE_ENV === "production" ? "prod" : "dev",
    jwksUrl: `${authOptions.baseURL}/api/auth/jwks`,
    jwtIssuer: authOptions.baseURL,
    jwtAudience: authOptions.baseURL,
    initial: { backendSecret: config.backendSecret },
  });

  const snapshot = jazzSession.getSnapshot();
  if (snapshot.status !== "ready" || !snapshot.client) {
    await jazzSession.close();
    throw snapshot.error ?? new Error("The Jazz backend session is not ready.");
  }

  const auth = createBetterAuth({
    ...authOptions,
    secret,
    database: jazzAdapter({
      db: async () => snapshot.client!.db,
      schema: app.wasmSchema,
    }),
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

  return {
    handler: toNodeHandler(auth.handler),
    commandHandler,
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
