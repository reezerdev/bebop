import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageDirectory, "bin", "create-bebop-app.mjs");

test("prints scoped npm create and npx usage for the pnpm monorepo starter", () => {
  const output = execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
  assert.match(output, /npm create @bebopdev\/bebop-app@beta/);
  assert.match(output, /npx @bebopdev\/create-bebop-app@beta/);
  assert.match(output, /pnpm workspaces and Turborepo/);
});

test("creates the TanStack Start and Expo pnpm monorepo", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bebop-create-test-"));
  const destination = path.join(temporaryDirectory, "My Tasks App");
  try {
    const result = spawnSync(process.execPath, [cliPath, destination, "--no-install"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
    assert.equal(manifest.name, "my-tasks-app");
    assert.equal(manifest.packageManager, "pnpm@12.6.0");
    assert.equal(manifest.devDependencies.turbo, "2.11.4");
    assert.equal(manifest.scripts.dev, "turbo run dev");
    assert.equal(manifest.scripts["dev:web"], "turbo run dev --filter=web");
    const webViteConfig = await readFile(path.join(destination, "apps/web/vite.config.ts"), "utf8");
    const mobileApp = await readFile(path.join(destination, "apps/mobile/App.tsx"), "utf8");
    assert.match(webViteConfig, /appId: "bebop-my-tasks-app"/);
    assert.match(mobileApp, /appId="bebop-my-tasks-app"/);

    const readme = await readFile(path.join(destination, "README.md"), "utf8");
    assert.match(readme, /^# My Tasks App/m);
    assert.match(readme, /TanStack Start web app and an Expo React Native app/);
    assert.match(readme, /pnpm install/);

    const files = await readdir(destination);
    assert.ok(files.includes("apps"));
    assert.ok(files.includes(".gitignore"));
    assert.ok(files.includes("pnpm-workspace.yaml"));
    assert.ok(files.includes("turbo.json"));
    const gitignore = await readFile(path.join(destination, ".gitignore"), "utf8");
    for (const ignoredEntry of ["node_modules/", ".turbo/", ".expo/", ".output/", "apps/mobile/android/", "apps/mobile/ios/", ".env.*", "!.env.example", "*.tsbuildinfo", ".DS_Store"]) {
      assert.ok(gitignore.includes(ignoredEntry), `expected .gitignore to include ${ignoredEntry}`);
    }
    const webManifest = JSON.parse(await readFile(path.join(destination, "apps/web/package.json"), "utf8"));
    const mobileManifest = JSON.parse(await readFile(path.join(destination, "apps/mobile/package.json"), "utf8"));
    assert.equal(webManifest.dependencies["@tanstack/react-start"], "1.168.60");
    assert.equal(webManifest.dependencies["@bebopdev/admin"], "0.1.2");
    assert.equal(webManifest.dependencies["@bebopdev/core"], "0.1.1");
    assert.equal(webManifest.dependencies["better-auth"], "1.7.1");
    assert.equal(webManifest.devDependencies["@bebopdev/cli"], "0.1.1");
    assert.equal(mobileManifest.dependencies.expo, "~57.0.26");
    assert.equal(mobileManifest.dependencies["expo-secure-store"], "~57.0.4");
    assert.equal(mobileManifest.dependencies["expo-dev-client"], "~57.0.19");
    assert.equal(mobileManifest.dependencies["react-native"], "0.86.3");
    assert.equal(mobileManifest.dependencies["jazz-rn"], "2.0.0-alpha.58");
    assert.equal(mobileManifest.dependencies["@bebopdev/core"], "0.1.1");
    assert.equal(mobileManifest.scripts.dev, "expo start --dev-client --port 8081");
    assert.equal(mobileManifest.main, "index.js");
    assert.ok((await readdir(path.join(destination, "apps/mobile"))).includes("index.js"));
    assert.ok((await readdir(path.join(destination, "apps/mobile"))).includes("bebop-client.ts"));
    assert.ok((await readdir(path.join(destination, "apps/web"))).includes("bebop.config.ts"));
    assert.ok((await readdir(path.join(destination, "apps/web"))).includes("bebop-generated-schema.ts"));
    assert.ok((await readdir(path.join(destination, "apps/web/src/routes/admin"))).includes("index.tsx"));
    assert.ok((await readdir(path.join(destination, "apps/web/src/routes/api/auth"))).includes("$.ts"));
    assert.ok((await readdir(path.join(destination, "apps/web/src/routes/api/bebop"))).includes("admin-access.ts"));
    const adminRoute = await readFile(path.join(destination, "apps/web/src/ui/admin-route.tsx"), "utf8");
    assert.match(adminRoute, /BebopAdminLogin/);
    assert.match(adminRoute, /\/api\/bebop\/admin-access/);
    assert.doesNotMatch(adminRoute, /canAccessAdmin\s*\/>/);
    const rootRoute = await readFile(path.join(destination, "apps/web/src/routes/__root.tsx"), "utf8");
    assert.doesNotMatch(rootRoute, /JazzProvider/);
    const playgroundRoute = await readFile(path.join(destination, "apps/web/src/routes/index.tsx"), "utf8");
    assert.match(playgroundRoute, /JazzProvider/);
    const startTypes = await readFile(path.join(destination, "apps/web/src/tanstack-start.d.ts"), "utf8");
    assert.match(startTypes, /@tanstack\/react-start/);
    const appStyles = await readFile(path.join(destination, "apps/web/src/styles.css"), "utf8");
    assert.doesNotMatch(appStyles, /^h1\s*\{/m);
    assert.doesNotMatch(appStyles, /^button\s*\{/m);
    const localEnv = await readFile(path.join(destination, "apps/web/.env"), "utf8");
    assert.match(localEnv, /^BETTER_AUTH_URL=http:\/\/127\.0\.0\.1:3000$/m);
    assert.match(localEnv, /^BETTER_AUTH_SECRET=[A-Za-z0-9_-]{43}$/m);
    assert.ok(!files.includes("package-lock.json"));
    assert.ok(!files.includes("node_modules"));
    assert.ok(!files.includes(".env"));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("does not write into a non-empty directory", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bebop-create-test-"));
  const destination = path.join(temporaryDirectory, "existing");
  await mkdir(destination);
  await writeFile(path.join(destination, "keep.txt"), "keep");
  try {
    const result = spawnSync(process.execPath, [cliPath, destination, "--no-install"], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /target directory is not empty/i);
    assert.equal(await readFile(path.join(destination, "keep.txt"), "utf8"), "keep");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
