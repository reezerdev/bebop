import { betterAuth as createBetterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { createJazzSession } from "jazz-tools/backend";
import { jazzAdapter } from "jazz-tools/better-auth-adapter";
import { app } from "./bebop-generated-schema.js";
import permissions from "./permissions.js";
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
    permissions,
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

  return {
    handler: toNodeHandler(auth.handler),
    close: () => jazzSession.close(),
  };
}
