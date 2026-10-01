import { defineConfig, loadEnv, type Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { jazzPlugin } from "jazz-tools/dev/vite";
import { getBetterAuthURL } from "./auth-config.ts";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

function toWebRequest(request: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }

  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const method = request.method ?? "GET";
  if (method === "GET" || method === "HEAD") return Promise.resolve(new Request(url, { method, headers }));

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.once("error", reject);
    request.once("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(new Request(url, { method, headers, ...(body ? { body } : {}) }));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function sendWebResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.end(Buffer.from(await response.arrayBuffer()));
}

function betterAuthPlugin(): Plugin {
  const authRuntimeFiles = new Set([
    path.join(projectDirectory, "auth.ts"),
    path.join(projectDirectory, "permissions.ts"),
    path.join(projectDirectory, "bebop.config.ts"),
    path.join(projectDirectory, "bebop-generated-schema.ts"),
    path.resolve(projectDirectory, "../../packages/bebop/dist/server.js"),
  ]);
  let restartPending = false;
  return {
    name: "bebop-better-auth",
    configureServer(server) {
      server.watcher.add([...authRuntimeFiles]);
      type AuthServer = Awaited<ReturnType<typeof import("./auth.ts").createAuthServer>>;
      let authServerPromise: Promise<AuthServer> | undefined;

      server.middlewares.use((request, response, next) => {
        const requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
        const isAuthRoute = requestPath === "/api/auth" || requestPath.startsWith("/api/auth/");
        const isUsersRoute = requestPath === "/api/bebop/users";
        const workspaceMembersMatch = /^\/api\/bebop\/workspaces\/([^/]+)\/members$/.exec(requestPath);
        const isAdminSetupRoute = requestPath === "/api/bebop/admin-setup";
        const isAdminAccessRoute = requestPath === "/api/bebop/admin-access";
        const isWorkspaceCreateRoute = requestPath === "/api/bebop/collections/workspaces" && request.method === "POST";
        const isCommandRoute = requestPath.startsWith("/api/bebop/collections/");
        if (!isAuthRoute && !isUsersRoute && !workspaceMembersMatch && !isAdminSetupRoute && !isAdminAccessRoute && !isCommandRoute) {
          next();
          return;
        }

        authServerPromise ??= server.ssrLoadModule("/auth.ts").then((module) => (module as typeof import("./auth.ts")).createAuthServer(
          {
            appId: server.config.env?.VITE_JAZZ_APP_ID,
            serverUrl: server.config.env?.VITE_JAZZ_SERVER_URL,
            backendSecret: process.env.BACKEND_SECRET,
          },
        ));

        void authServerPromise
          .then(async ({ handler, listUsers, listWorkspaceMembers, adminSetupStatus, adminAccessHandler, commandHandler, createWorkspaceHandler }) => {
            if (isUsersRoute) return listUsers(request, response);
            if (workspaceMembersMatch) return listWorkspaceMembers(request, response, decodeURIComponent(workspaceMembersMatch[1]));
            if (isAdminSetupRoute) return adminSetupStatus(request, response);
            if (isAdminAccessRoute) return sendWebResponse(await adminAccessHandler(await toWebRequest(request)), response);
            if (isWorkspaceCreateRoute) return sendWebResponse(await createWorkspaceHandler(await toWebRequest(request)), response);
            if (isCommandRoute) return sendWebResponse(await commandHandler(await toWebRequest(request)), response);
            return handler(request, response);
          })
          .catch((error: unknown) => {
            console.error("[bebop auth] Could not serve auth or Bebop command request:", error);
            if (!response.headersSent) {
              response.statusCode = 500;
              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify({ message: "Authentication service could not start." }));
            }
          });
      });

      server.httpServer?.once("close", () => {
        void authServerPromise?.then(({ close }) => close()).catch((error: unknown) => {
          console.error("[bebop auth] Could not close the Jazz backend session:", error);
        });
      });
    },
    handleHotUpdate(context) {
      if (!authRuntimeFiles.has(path.resolve(context.file)) || restartPending) return;
      restartPending = true;
      // The auth handler is a long-lived server instance. HMR alone leaves its
      // authorization callback unchanged, so restart the server on backend edits.
      queueMicrotask(() => {
        void context.server.restart().finally(() => { restartPending = false; });
      });
      return [];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, "");
  const port = Number(process.env.BEBOP_DEV_PORT ?? 5173);
  const baseURL = getBetterAuthURL(process.env.BETTER_AUTH_URL ?? env.BETTER_AUTH_URL);

  // Keep secrets on the Node side. Vite only exposes variables with its VITE_ prefix.
  process.env.BETTER_AUTH_URL = baseURL;
  if (env.BETTER_AUTH_SECRET) process.env.BETTER_AUTH_SECRET ??= env.BETTER_AUTH_SECRET;

  return {
    server: { host: "127.0.0.1", port, strictPort: true },
    plugins: [
      react(),
      tailwindcss(),
      jazzPlugin({
        appId: "bebop-first-admin-playground-20260929",
        server: {
          dataDir: process.env.BEBOP_JAZZ_DATA_DIR ?? path.join(projectDirectory, "node_modules", ".cache", "bebop-first-admin-20260929-jazz-dev-server"),
          jwksUrl: `${baseURL}/api/auth/jwks`,
          jwtIssuer: baseURL,
          jwtAudience: baseURL,
        },
      }),
      betterAuthPlugin(),
    ],
  };
});
