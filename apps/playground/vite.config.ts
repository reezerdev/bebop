import { defineConfig, loadEnv, type Plugin } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { jazzPlugin } from "jazz-tools/dev/vite";
import { getBetterAuthURL } from "./auth-config.ts";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

function betterAuthPlugin(): Plugin {
  return {
    name: "bebop-better-auth",
    configureServer(server) {
      type AuthServer = Awaited<ReturnType<typeof import("./auth.ts").createAuthServer>>;
      let authServerPromise: Promise<AuthServer> | undefined;

      server.middlewares.use((request, response, next) => {
        const requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
        if (requestPath !== "/api/auth" && !requestPath.startsWith("/api/auth/")) {
          next();
          return;
        }

        authServerPromise ??= import("./auth.ts").then(({ createAuthServer }) =>
          createAuthServer({
            appId: server.config.env?.VITE_JAZZ_APP_ID,
            serverUrl: server.config.env?.VITE_JAZZ_SERVER_URL,
            backendSecret: process.env.BACKEND_SECRET,
          }),
        );

        void authServerPromise
          .then(({ handler }) => handler(request, response))
          .catch((error: unknown) => {
            console.error("[bebop auth] Could not serve Better Auth request:", error);
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
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, "");
  const baseURL = getBetterAuthURL(env.BETTER_AUTH_URL);

  // Keep secrets on the Node side. Vite only exposes variables with its VITE_ prefix.
  process.env.BETTER_AUTH_URL ??= baseURL;
  if (env.BETTER_AUTH_SECRET) process.env.BETTER_AUTH_SECRET ??= env.BETTER_AUTH_SECRET;

  return {
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    plugins: [
      react(),
      jazzPlugin({
        appId: "bebop-playground",
        server: {
          jwksUrl: `${baseURL}/api/auth/jwks`,
          jwtIssuer: baseURL,
          jwtAudience: baseURL,
        },
      }),
      betterAuthPlugin(),
    ],
  };
});
