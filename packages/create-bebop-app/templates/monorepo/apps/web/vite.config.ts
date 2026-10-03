import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { jazzPlugin } from "jazz-tools/dev/vite";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, "");
  const baseURL = (process.env.BETTER_AUTH_URL ?? env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
  process.env.BETTER_AUTH_URL = baseURL;
  if (env.BETTER_AUTH_SECRET) process.env.BETTER_AUTH_SECRET ??= env.BETTER_AUTH_SECRET;

  return {
    plugins: [
      tanstackStart(),
      react(),
      jazzPlugin({
        appId: "bebop-starter",
        server: {
          port: 1625,
          jwksUrl: `${baseURL}/api/auth/jwks`,
          jwtIssuer: baseURL,
          jwtAudience: baseURL,
        },
      }),
    ],
  };
});
