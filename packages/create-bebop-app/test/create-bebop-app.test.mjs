import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageDirectory, "bin", "create-bebop-app.mjs");

test("prints scoped npm create and npx usage", () => {
  const output = execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
  assert.match(output, /npm create @bebopdev\/bebop-app@beta/);
  assert.match(output, /npx @bebopdev\/create-bebop-app@beta/);
  assert.match(output, /--use-pnpm/);
});

test("creates a basic app and uses the requested package manager in its README", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bebop-create-test-"));
  const destination = path.join(temporaryDirectory, "My Tasks App");
  try {
    const result = spawnSync(process.execPath, [cliPath, destination, "--no-install", "--use-pnpm"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
    assert.equal(manifest.name, "my-tasks-app");
    assert.equal(manifest.dependencies["@bebopdev/core"], "0.1.0");
    assert.equal(manifest.dependencies["@bebopdev/admin"], "0.1.0");
    assert.equal(manifest.devDependencies["@bebopdev/cli"], "0.1.0");
    assert.equal(manifest.scripts.dev, "bebop dev -- vite --host 127.0.0.1 --port 5174 --strictPort");

    const readme = await readFile(path.join(destination, "README.md"), "utf8");
    assert.match(readme, /^# My Tasks App/m);
    assert.match(readme, /pnpm install\npnpm dev/);

    const files = await readdir(destination);
    assert.ok(files.includes("bebop.config.ts"));
    assert.ok(files.includes("bebop-generated-schema.ts"));
    assert.ok(files.includes("src"));
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
