import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

const port = 5174;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      BETTER_AUTH_URL: baseURL,
      BEBOP_DEV_PORT: String(port),
      BETTER_AUTH_SECRET: "bebop-playwright-secret-for-local-smoke-tests",
      BACKEND_SECRET: "bebop-playwright-backend-secret-for-local-smoke-tests",
      BEBOP_JAZZ_DATA_DIR: path.join(tmpdir(), `bebop-playwright-jazz-${process.pid}`),
    },
  },
});
