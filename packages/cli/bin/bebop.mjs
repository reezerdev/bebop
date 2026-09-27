#!/usr/bin/env node

import { watch } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const usage = `Usage:
  bebop generate [--config <path>] [--out-dir <path>]
  bebop validate [--config <path>] [--out-dir <path>]
  bebop dev [--config <path>] [--out-dir <path>] [-- <command> ...args]

Commands:
  generate   Generate Jazz schema and permissions from bebop.config.ts
  validate   Validate the generated schema with jazz-tools
  dev        Generate, watch the config, and run the local dev server`;

function parseArgs(args) {
  const [command, ...rest] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { help: true };
  }

  const options = { command, config: "bebop.config.ts", outDir: undefined, commandArgs: [] };
  let index = 0;

  while (index < rest.length) {
    const value = rest[index];
    if (value === "--") {
      options.commandArgs = rest.slice(index + 1);
      break;
    }
    if (value === "--config" || value === "--out-dir") {
      const optionValue = rest[index + 1];
      if (!optionValue || optionValue.startsWith("--")) {
        throw new Error(`Expected a path after ${value}.`);
      }
      if (value === "--config") options.config = optionValue;
      else options.outDir = optionValue;
      index += 2;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  if (!["generate", "validate", "dev"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  return options;
}

function resolveProjectPaths(options) {
  const configPath = path.resolve(process.cwd(), options.config);
  return {
    configPath,
    configDirectory: path.dirname(configPath),
    configFilename: path.basename(configPath),
    outputDirectory: path.resolve(process.cwd(), options.outDir ?? path.dirname(configPath)),
  };
}

async function loadConfig(configPath) {
  const configUrl = pathToFileURL(configPath);
  configUrl.searchParams.set("bebop-reload", randomUUID());
  const loaded = await tsImport(configUrl.href, { parentURL: import.meta.url });
  const config = loaded.default ?? loaded.config;
  if (!config || typeof config !== "object") {
    throw new Error(`Expected ${configPath} to export a Bebop config as its default export.`);
  }
  return config;
}

async function loadCompiler(configPath) {
  const { compileSchema, compilePermissions } = await tsImport("@bebop/core", {
    parentURL: pathToFileURL(configPath).href,
  });
  return { compileSchema, compilePermissions };
}

async function writeIfChanged(filePath, content) {
  try {
    if (await readFile(filePath, "utf8") === content) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return true;
}

async function generate(paths, { quiet = false } = {}) {
  const config = await loadConfig(paths.configPath);
  const { compileSchema, compilePermissions } = await loadCompiler(paths.configPath);

  // Compile both outputs before writing either file so invalid config keeps the
  // last valid generated schema and permissions available to the dev server.
  const schema = compileSchema(config);
  const permissions = compilePermissions(config);
  await mkdir(paths.outputDirectory, { recursive: true });

  const changed = await Promise.all([
    writeIfChanged(path.join(paths.outputDirectory, "schema.ts"), schema),
    writeIfChanged(path.join(paths.outputDirectory, "permissions.ts"), permissions),
  ]);

  if (!quiet) {
    const output = path.relative(process.cwd(), paths.outputDirectory) || ".";
    const action = changed.some(Boolean) ? "Generated" : "Up to date";
    console.log(`${action} schema.ts and permissions.ts in ${output}`);
  }
}

function run(command, args, { cwd = process.cwd() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1));
    });
  });
}

async function validate(paths) {
  await generate(paths);
  const code = await run("jazz-tools", ["validate"], { cwd: paths.outputDirectory });
  if (code !== 0) process.exitCode = code;
}

async function dev(paths, commandArgs) {
  await generate(paths);
  const command = commandArgs.length ? commandArgs[0] : "vite";
  const args = commandArgs.length ? commandArgs.slice(1) : ["--host", "127.0.0.1"];
  console.log(`Watching ${path.relative(process.cwd(), paths.configPath)} for schema changes`);

  let timer;
  let generating = false;
  let pendingGeneration = false;
  const scheduleGeneration = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (generating) {
        pendingGeneration = true;
        return;
      }
      generating = true;
      try {
        await generate(paths);
      } catch (error) {
        console.error(`Could not regenerate the schema: ${error.message}`);
      } finally {
        generating = false;
        if (pendingGeneration) {
          pendingGeneration = false;
          scheduleGeneration();
        }
      }
    }, 120);
  };

  const watcher = watch(paths.configDirectory, (event, filename) => {
    if (filename?.toString() === paths.configFilename) scheduleGeneration();
  });
  watcher.on("error", (error) => console.error(`Config watcher error: ${error.message}`));

  const child = spawn(command, args, { cwd: process.cwd(), stdio: "inherit" });
  let stopping = false;
  const stopChild = (signal) => {
    if (stopping) return;
    stopping = true;
    watcher.close();
    clearTimeout(timer);
    child.kill(signal);
  };
  const onInterrupt = () => stopChild("SIGINT");
  const onTerminate = () => stopChild("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);

  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      watcher.close();
      clearTimeout(timer);
      resolve(exitCode ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1));
    });
  }).finally(() => {
    watcher.close();
    clearTimeout(timer);
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  });
  if (code !== 0) process.exitCode = code;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
  } else {
    const paths = resolveProjectPaths(options);
    if (options.command === "generate") await generate(paths);
    else if (options.command === "validate") await validate(paths);
    else await dev(paths, options.commandArgs);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
