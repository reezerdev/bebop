#!/usr/bin/env node

import { lstat, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { createInterface } from "node:readline/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playgroundRoot = join(repositoryRoot, "apps", "playground");
const cacheRoot = resolve(playgroundRoot, "node_modules", ".cache");
const databaseDirectoryName = "bebop-first-admin-20260929-jazz-dev-server";
const databasePath = resolve(cacheRoot, databaseDirectoryName);
const devServerHost = "127.0.0.1";
const devServerPort = 5173;

function printUsage() {
  process.stdout.write(
    "Delete the playground's local Jazz server database.\n\n" +
      "Usage: pnpm db:reset\n\n" +
      "Stop pnpm dev first. The command asks you to type DELETE before removing the data.\n",
  );
}

function isPortOpen(host, port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolvePort(false);
    }, 1000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolvePort(false);
    });
  });
}

async function assertNoSymlinkComponents(path) {
  const parts = relative(repositoryRoot, path).split(sep).filter(Boolean);
  let current = repositoryRoot;

  for (const part of parts) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing to follow a symbolic link in the database path: ${current}`);
    }
  }
}

async function getDatabaseDirectory() {
  if (dirname(databasePath) !== cacheRoot || databasePath === cacheRoot) {
    throw new Error("Refusing to remove an unexpected database path.");
  }
  if (!databasePath.startsWith(`${cacheRoot}${sep}`)) {
    throw new Error("Refusing to remove a path outside the playground cache.");
  }

  let info;
  try {
    info = await lstat(databasePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  await assertNoSymlinkComponents(cacheRoot);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error("Refusing to remove the database because its path is not a regular directory.");
  }
  return info;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }
  if (args.length > 0) {
    printUsage();
    throw new Error(`Unknown option: ${args[0]}`);
  }
  if (!process.stdin.isTTY) {
    throw new Error("Run this command in an interactive terminal so you can confirm the deletion.");
  }
  if (await isPortOpen(devServerHost, devServerPort)) {
    throw new Error(`The playground dev server is reachable at http://${devServerHost}:${devServerPort}. Stop pnpm dev, then run pnpm db:reset again.`);
  }

  const info = await getDatabaseDirectory();
  if (!info) {
    process.stdout.write("No playground Jazz database exists; nothing was deleted.\n");
    return;
  }

  process.stdout.write(
    `This permanently deletes the playground's local Jazz server database:\n${databasePath}\n\n` +
      "It does not clear browser IndexedDB copies.\n",
  );
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let confirmation;
  try {
    confirmation = await prompt.question('Type DELETE to continue: ');
  } finally {
    prompt.close();
  }
  if (confirmation !== "DELETE") {
    process.stdout.write("Cancelled; no database files were removed.\n");
    return;
  }

  if (await isPortOpen(devServerHost, devServerPort)) {
    throw new Error("The playground dev server started during confirmation. Stop it and retry; no files were removed.");
  }
  await getDatabaseDirectory();
  await rm(databasePath, { recursive: true });
  process.stdout.write("Playground Jazz server database deleted. Run pnpm dev to create a fresh one.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
