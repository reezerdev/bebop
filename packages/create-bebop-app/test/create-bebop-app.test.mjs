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

    const readme = await readFile(path.join(destination, "README.md"), "utf8");
    assert.match(readme, /^# My Tasks App/m);
    assert.match(readme, /TanStack Start web app and an Expo React Native app/);
    assert.match(readme, /pnpm install/);

    const files = await readdir(destination);
    assert.ok(files.includes("apps"));
    assert.ok(files.includes("pnpm-workspace.yaml"));
    assert.ok(files.includes("turbo.json"));
    const webManifest = JSON.parse(await readFile(path.join(destination, "apps/web/package.json"), "utf8"));
    const mobileManifest = JSON.parse(await readFile(path.join(destination, "apps/mobile/package.json"), "utf8"));
    assert.equal(webManifest.dependencies["@tanstack/react-start"], "1.168.60");
    assert.equal(webManifest.dependencies["@bebopdev/admin"], "0.1.0");
    assert.equal(mobileManifest.dependencies.expo, "~57.0.26");
    assert.equal(mobileManifest.dependencies["expo-secure-store"], "~57.0.4");
    assert.equal(mobileManifest.dependencies["expo-dev-client"], "~57.0.19");
    assert.equal(mobileManifest.dependencies["react-native"], "0.86.3");
    assert.equal(mobileManifest.dependencies["jazz-rn"], "2.0.0-alpha.58");
    assert.equal(mobileManifest.dependencies["@bebopdev/core"], "0.1.0");
    assert.equal(mobileManifest.scripts.dev, "expo start --dev-client --port 8081");
    assert.equal(mobileManifest.main, "index.js");
    assert.ok((await readdir(path.join(destination, "apps/mobile"))).includes("index.js"));
    assert.ok((await readdir(path.join(destination, "apps/mobile"))).includes("bebop-client.ts"));
    assert.ok((await readdir(path.join(destination, "apps/web"))).includes("bebop.config.ts"));
    assert.ok((await readdir(path.join(destination, "apps/web"))).includes("bebop-generated-schema.ts"));
    assert.ok((await readdir(path.join(destination, "apps/web/src/routes/admin"))).includes("index.tsx"));
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
