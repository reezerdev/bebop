#!/usr/bin/env node

import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { collectConfigDependencies } from "../lib/config-dependencies.mjs";

const usage = `Usage:
  bebop generate [--config <path>] [--out-dir <path>]
  bebop validate [--config <path>] [--out-dir <path>]
  bebop dev [--config <path>] [--out-dir <path>] [-- <command> ...args]

Commands:
  generate   Generate Bebop schema, Jazz entry point, and permissions
  validate   Validate the generated schema with jazz-tools
  dev        Generate, watch Bebop config, and run the local dev server`;

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
  const { compileArtifacts } = await tsImport("@bebopdev/core", {
    parentURL: pathToFileURL(configPath).href,
  });
  return compileArtifacts;
}

function moduleSpecifier(fromDirectory, targetFile) {
  let relativePath = path.relative(fromDirectory, targetFile).split(path.sep).join("/");
  relativePath = relativePath.replace(/\.tsx$/, ".jsx").replace(/\.mts$/, ".mjs").replace(/\.cts$/, ".cjs").replace(/\.ts$/, ".js");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
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
  const compileArtifacts = await loadCompiler(paths.configPath);

  // Compile outputs before writing so invalid config keeps the last valid
  // generated schema and permissions available to the dev server.
  const configModuleSpecifier = moduleSpecifier(paths.outputDirectory, paths.configPath);
  const { schema, permissions, authorizationPermissions, adminManifest, clientFactory, authGenerateConfig } = compileArtifacts(config, configModuleSpecifier);
  await mkdir(paths.outputDirectory, { recursive: true });

  const authEnabled = config.collections.some((collection) => collection.auth === true);
  const generatedAuthConfig = path.join(paths.outputDirectory, "bebop-generated-auth.ts");
  let authConfigChanged = false;
  if (authEnabled) {
    authConfigChanged = await writeIfChanged(generatedAuthConfig, authGenerateConfig);
    await generateBetterAuthSchema(paths, generatedAuthConfig);
  } else {
    try {
      await access(generatedAuthConfig);
      await rm(generatedAuthConfig, { force: true });
      authConfigChanged = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const schemaFingerprintSource = authEnabled
    ? `${schema}\n${await readFile(path.join(paths.outputDirectory, "schema-better-auth", "schema.ts"), "utf8")}`
    : schema;
  const schemaFingerprint = createHash("sha256").update(schemaFingerprintSource).digest("hex");
  const jazzSchemaEntry =
    `// Generated by Bebop as Jazz's conventional schema.ts entry point.\n` +
    `// Bebop's generated schema is in bebop-generated-schema.ts.\n` +
    `// Schema fingerprint: ${schemaFingerprint}\n` +
    `export { app } from "./bebop-generated-schema.js";\n`;

  const changed = await Promise.all([
    writeIfChanged(path.join(paths.outputDirectory, "bebop-generated-schema.ts"), schema),
    writeIfChanged(path.join(paths.outputDirectory, "bebop-admin-manifest.ts"), adminManifest),
    writeIfChanged(path.join(paths.outputDirectory, "bebop-generated-client.ts"), clientFactory),
    writeIfChanged(path.join(paths.outputDirectory, "schema.ts"), jazzSchemaEntry),
    writeIfChanged(path.join(paths.outputDirectory, "permissions.ts"), permissions),
    writeIfChanged(path.join(paths.outputDirectory, "bebop-generated-command-permissions.ts"), authorizationPermissions),
  ]);
  changed.push(authConfigChanged);

  if (!quiet) {
    const output = path.relative(process.cwd(), paths.outputDirectory) || ".";
    const action = changed.some(Boolean) ? "Generated" : "Up to date";
    console.log(`${action} Bebop schema, admin manifest, typed client, Jazz schema entry point, and permission files in ${output}`);
  }
  return config;
}

async function generateBetterAuthSchema(paths, configFile) {
  const outputFile = path.join(paths.outputDirectory, "schema-better-auth", "schema.ts");
  await mkdir(path.dirname(outputFile), { recursive: true });

  let code;
  try {
    code = await run(
      "auth",
      ["generate", "--config", configFile, "--output", outputFile, "--yes"],
      {
        cwd: paths.configDirectory,
        env: {
          ...process.env,
          PATH: [path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin"), process.env.PATH ?? ""].join(path.delimiter),
        },
      },
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        'Better Auth is enabled but its schema CLI is unavailable. Reinstall the Bebop workspace dependencies with pnpm, then run bebop generate again.',
      );
    }
    throw error;
  }

  if (code !== 0) {
    throw new Error(`Better Auth schema generation failed with exit code ${code}.`);
  }
}

function run(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
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
  const config = await generate(paths);
  const command = commandArgs.length ? commandArgs[0] : "vite";
  const args = commandArgs.length ? commandArgs.slice(1) : ["--host", "127.0.0.1"];

  const configEntries = [paths.configPath];
  if (config.collections.some((collection) => collection.auth === true)) {
    configEntries.push(path.join(paths.outputDirectory, "bebop-generated-auth.ts"));
  }
  const fingerprint = async (file) => {
    try {
      const info = await stat(file);
      return `${info.mtimeMs}:${info.size}`;
    } catch (error) {
      if (error.code === "ENOENT") return "missing";
      throw error;
    }
  };
  let watchedFiles = new Map();
  const syncWatchers = async () => {
    const nextFiles = await collectConfigDependencies(configEntries);
    watchedFiles = new Map(await Promise.all([...nextFiles].map(async (file) => [file, await fingerprint(file)])));
    console.log(`Watching ${[...nextFiles].map((file) => path.relative(process.cwd(), file)).join(", ")} for schema changes`);
  };

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
        // A fresh process reloads imported collection modules as well as the root config.
        const code = await run(process.execPath, [fileURLToPath(import.meta.url), "generate", "--config", paths.configPath, "--out-dir", paths.outputDirectory]);
        if (code !== 0) console.error(`Could not regenerate the schema (exit code ${code}).`);
        await syncWatchers();
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

  await syncWatchers();
  let polling = false;
  const poll = setInterval(() => {
    if (polling) return;
    polling = true;
    void (async () => {
      try {
        for (const [file, previous] of watchedFiles) {
          const current = await fingerprint(file);
          if (current !== previous) {
            watchedFiles.set(file, current);
            scheduleGeneration();
          }
        }
      } catch (error) {
        console.error(`Config watcher error: ${error.message}`);
      } finally {
        polling = false;
      }
    })();
  }, 500);
  const closeWatchers = () => clearInterval(poll);

  const child = spawn(command, args, { cwd: process.cwd(), stdio: "inherit" });
  let stopping = false;
  const stopChild = (signal) => {
    if (stopping) return;
    stopping = true;
    closeWatchers();
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
      closeWatchers();
      clearTimeout(timer);
      resolve(exitCode ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1));
    });
  }).finally(() => {
    closeWatchers();
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
