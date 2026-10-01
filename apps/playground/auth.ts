import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createJazzSession } from "jazz-tools/backend";
import { createBebopAdminAccessHandler, createBebopBetterAuth, createBebopHandler } from "@bebopdev/core/server";
import { createBebopClient } from "./bebop-generated-client.js";
import { app } from "./bebop-generated-schema.js";
import permissions from "./permissions.js";
import bebopConfig from "./bebop.config.ts";
import { getBetterAuthURL } from "./auth-config.ts";
import { authorizeWorkspaceCommand } from "./command-authorization.js";
import { withStreamCollections } from "./src/stream-client.js";

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
    permissions,
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
    // The command endpoint has already verified Better Auth and Jazz identity.
    // Workspace creation is handled by the atomic endpoint below.
    async authorize({ request, collection, operation, userId, data, originalDoc, db }) {
      return authorizeWorkspaceCommand({
        userId,
        collection,
        operation,
        data,
        originalDoc: originalDoc as Record<string, unknown> | undefined,
        async isGlobalAdmin() {
          const permission = await auth.api.userHasPermission({
            headers: request.headers,
            body: { permissions: { user: ["list"] } },
          }).catch(() => null);
          const adminIds = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
          return adminIds.includes(userId ?? "") || permission?.success === true;
        },
        async isActiveWorkspaceAdmin(workspaceId) {
          const membership = await db.one(app.workspaceMemberships.where({
            workspaceId,
            userId,
            role: "admin",
            status: "active",
          }));
          return Boolean(membership);
        },
      });
    },
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

  async function createWorkspaceHandler(request: Request): Promise<Response> {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
    if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);
    if (request.headers.get("origin") !== new URL(request.url).origin) return json({ message: "Invalid request origin." }, 403);
    const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
    if (!session) return json({ message: "Sign in before creating a workspace." }, 401);
    let data: { name?: unknown; slug?: unknown };
    try { data = await request.json() as typeof data; }
    catch { return json({ message: "Workspace data must be valid JSON." }, 400); }
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    const slug = typeof data?.slug === "string" ? data.slug.trim() : "";
    if (!name || !slug || name.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return json({ message: "Enter a workspace name and a valid slug." }, 400);
    }
    try {
      const { token } = await auth.api.getToken({ headers: request.headers });
      const jazzRequest = new Request(request.url, { headers: { authorization: `Bearer ${token}` } });
      const writeDb = await snapshot.client!.withAttributionForRequest(jazzRequest);
      const transaction = await writeDb.exclusiveTransaction(async (tx) => {
        if (await tx.one(app.workspaces.where({ slug }))) throw new Error("That workspace slug is already in use.");
        const workspace = tx.insert(app.workspaces, { name, slug });
        tx.insert(app.workspaceMemberships, {
          workspaceId: workspace.id,
          userId: session.user.id,
          role: "admin",
          status: "active",
        });
        return workspace;
      });
      await transaction.wait();

      // Create each default channel with its own Stream and creator admin
      // membership. The Stream and membership must be globally available
      // before Jazz authorizes the Channel relationship.
      const streamClient = withStreamCollections(
        createBebopClient(writeDb),
        writeDb,
        session.user.id,
      );
      for (const channelName of ["general", "random"]) {
        const channel = await streamClient.channels.create({
          name: channelName,
          workspaceId: transaction.value.id,
          content: "",
          visibility: "public",
        });
        await channel.waitForGlobal();
      }

      return json({ doc: transaction.value, durability: "global" });
    } catch (error) {
      return json({ message: error instanceof Error ? error.message : "Could not create workspace." }, 409);
    }
  }

  const adminAccessHandler = createBebopAdminAccessHandler({
    config: bebopConfig,
    async resolveSession(request) {
      const headers = request.headers;
      const session = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      });
      if (!session) return null;

      const authUser = session.user as typeof session.user & { role?: string };
      const adminUserIds = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const roles = typeof authUser.role === "string"
        ? authUser.role.split(",").map((role) => role.trim())
        : [];

      // The session comes from Better Auth's verified server-side lookup, and
      // the role field is protected from public signup/update input. Trust
      // those built-in admin signals directly before making the permission
      // endpoint call, which can fail independently of session resolution.
      const isAdminByRole = roles.includes("admin");
      const isAdminById = adminUserIds.includes(session.user.id);
      const permission = isAdminByRole || isAdminById
        ? null
        : await auth.api.userHasPermission({
          headers,
          body: { permissions: { user: ["list"] } },
        });

      return {
        user: authUser,
        isAdmin: isAdminByRole || isAdminById || permission?.success === true,
      };
    },
    onError(error) {
      console.error("[bebop admin] Could not verify admin access:", error);
    },
  });

  return {
    handler: toNodeHandler(auth.handler),
    commandHandler,
    createWorkspaceHandler,
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

      const users = await (await auth.$context).internalAdapter.listUsers(1);
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
      const adminResult = await auth.api.userHasPermission({
        headers: fromNodeHeaders(request.headers),
        body: { permissions: { user: ["list"] } },
      });
      const adminIds = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      if (!adminResult.success && !adminIds.includes(session.user.id)) {
        response.statusCode = 403;
        response.end(JSON.stringify({ message: "Administrator access is required to list users." }));
        return;
      }

      const users = await snapshot.client!.db.all(app.better_auth_user.select("id", "name"), { tier: "global" });
      response.end(JSON.stringify(users.map(({ id, name }) => ({ id, name }))));
    },
    async listWorkspaceMembers(request: IncomingMessage, response: ServerResponse, workspaceId: string) {
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.setHeader("vary", "cookie");
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
        response.end(JSON.stringify({ message: "Sign in to view workspace members." }));
        return;
      }

      const memberships = await snapshot.client!.db.all(app.workspaceMemberships.where({
        workspaceId,
        status: "active",
      }), { tier: "global" });
      if (!memberships.some((membership) => membership.userId === session.user.id)) {
        response.statusCode = 403;
        response.end(JSON.stringify({ message: "Active workspace membership is required." }));
        return;
      }

      const activeMemberIds = new Set(memberships.map(({ userId }) => userId));
      const users = await snapshot.client!.db.all(app.better_auth_user.select("id", "name"), { tier: "global" });
      const workspaceUsers = users
        .filter(({ id }) => activeMemberIds.has(id))
        .map(({ id, name }) => ({ id, name }));
      if (!workspaceUsers.some(({ id }) => id === session.user.id)) {
        workspaceUsers.unshift({ id: session.user.id, name: session.user.name });
      }
      response.end(JSON.stringify(workspaceUsers));
    },
    close: () => jazzSession.close(),
  };
}
