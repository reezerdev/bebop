import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectConfigDependencies } from "../lib/config-dependencies.mjs";

const cliDirectory = path.resolve(import.meta.dirname, "..");

async function waitForFileText(file, text, child, output) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Bebop dev exited early: ${output()}`);
    try {
      if ((await readFile(file, "utf8")).includes(text)) return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${text}: ${output()}`);
}

async function waitForDifferentFileText(file, previous, child, output) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Bebop dev exited early: ${output()}`);
    try {
      const current = await readFile(file, "utf8");
      if (current !== previous) return current;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${file} to change: ${output()}`);
}

test("config watcher follows local imports, including TypeScript source behind .js specifiers", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bebop-config-watch-"));
  try {
    const collections = path.join(directory, "collections");
    await mkdir(collections);
    const config = path.join(directory, "bebop.config.ts");
    const posts = path.join(collections, "posts.ts");
    const fields = path.join(collections, "fields.ts");
    await writeFile(config, 'import { posts } from "./collections/posts.js";\nexport default posts;\n');
    await writeFile(posts, 'import { title } from "./fields.js";\nexport const posts = title;\n');
    await writeFile(fields, 'export const title = "Title";\n');

    assert.deepEqual(await collectConfigDependencies([config]), new Set([config, posts, fields]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("bebop dev regenerates when an imported collection module changes", { timeout: 12000 }, async () => {
  const directory = await mkdtemp(path.join(cliDirectory, ".watch-test-"));
  const config = path.join(directory, "bebop.config.ts");
  const fields = path.join(directory, "fields.ts");
  const generated = path.join(directory, "generated", "bebop-generated-schema.ts");
  await writeFile(config, 'import { defineConfig } from "@bebopdev/core";\nimport { fields } from "./fields.js";\nexport default defineConfig({ collections: [{ slug: "posts", fields }] });\n');
  await writeFile(fields, 'export const fields = [{ name: "title", type: "text" }];\n');

  const child = spawn(process.execPath, [
    path.join(cliDirectory, "bin", "bebop.mjs"), "dev", "--config", config,
    "--out-dir", path.join(directory, "generated"), "--", process.execPath,
    "-e", "setTimeout(() => {}, 20000)",
  ], { cwd: cliDirectory, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    await waitForFileText(generated, '"title"', child, () => output);
    await writeFile(fields, 'export const fields = [{ name: "title", type: "text" }, { name: "subtitle", type: "text" }];\n');
    await waitForFileText(generated, '"subtitle"', child, () => output);
    assert.match(output, /Watching .*fields\.ts/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("bebop dev changes the generated permissions file when access callbacks change", { timeout: 12000 }, async () => {
  const directory = await mkdtemp(path.join(cliDirectory, ".watch-test-"));
  const config = path.join(directory, "bebop.config.ts");
  const generated = path.join(directory, "generated", "permissions.ts");
  const source = (permission) => `import { defineConfig } from "@bebopdev/core";\nexport default defineConfig({ collections: [{ slug: "posts", fields: [{ name: "title", type: "text" }], permissions: { read: ({ rule }) => rule.${permission}() } }] });\n`;
  await writeFile(config, source("always"));

  const child = spawn(process.execPath, [
    path.join(cliDirectory, "bin", "bebop.mjs"), "dev", "--config", config,
    "--out-dir", path.join(directory, "generated"), "--", process.execPath,
    "-e", "setTimeout(() => {}, 20000)",
  ], { cwd: cliDirectory, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    await waitForFileText(generated, "Bebop permission source fingerprint:", child, () => output);
    const before = await readFile(generated, "utf8");
    await writeFile(config, source("never"));
    const after = await waitForDifferentFileText(generated, before, child, () => output);
    assert.notEqual(after.split("\n", 1)[0], before.split("\n", 1)[0]);
    assert.equal(after.slice(after.indexOf("\n")), before.slice(before.indexOf("\n")));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
    await rm(directory, { recursive: true, force: true });
  }
});
