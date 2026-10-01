#!/usr/bin/env node

import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateDirectory = path.join(packageRoot, "templates", "basic");
const usage = `Usage:
  npm create @bebopdev/bebop-app@beta [directory] [options]
  npx @bebopdev/create-bebop-app@beta [directory] [options]

Options:
  --use-npm       Install dependencies with npm (default)
  --use-pnpm      Install dependencies with pnpm
  --no-install    Create the project without installing dependencies
  -h, --help      Show this help`;

function parseArguments(args) {
  const options = { install: true, packageManager: undefined, directory: undefined, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--no-install") options.install = false;
    else if (value === "--use-npm") options.packageManager = "npm";
    else if (value === "--use-pnpm") options.packageManager = "pnpm";
    else if (value.startsWith("--")) throw new Error(`Unknown option: ${value}`);
    else if (options.directory) throw new Error("Only one project directory can be provided.");
    else options.directory = value;
  }
  return options;
}

function inferPackageManager() {
  return process.env.npm_config_user_agent?.startsWith("pnpm/") ? "pnpm" : "npm";
}

async function askForDirectory() {
  if (!process.stdin.isTTY) throw new Error("Pass a project directory, for example: create-bebop-app my-app");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question("Where should we create your Bebop app? (my-bebop-app) ");
    return answer.trim() || "my-bebop-app";
  } finally {
    prompt.close();
  }
}

function packageNameFor(directory) {
  const name = path.basename(directory)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  if (!name || name.startsWith(".")) throw new Error("The project directory must produce a valid package name.");
  return name;
}

async function ensureDirectoryIsEmpty(directory) {
  try {
    const entries = await readdir(directory);
    if (entries.length) throw new Error(`The target directory is not empty: ${directory}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function setProjectDetails(directory, displayName, packageManager) {
  const manifestPath = path.join(directory, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = packageNameFor(displayName);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const readmePath = path.join(directory, "README.md");
  let readme = await readFile(readmePath, "utf8");
  const title = displayName.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  readme = readme.replace("# Bebop Basic Example", `# ${title}`);
  readme = readme.replace("Requirements: Node.js 22.12 or newer and npm.", "Requirements: Node.js 22.12 or newer.");
  if (packageManager === "pnpm") {
    readme = readme.replace("npm install\nnpm run dev", "pnpm install\npnpm dev");
  }
  await writeFile(readmePath, readme);
}

function installDependencies(directory, packageManager) {
  const executable = process.platform === "win32" ? `${packageManager}.cmd` : packageManager;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["install"], {
      cwd: directory,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 1)));
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  const requestedDirectory = options.directory ?? await askForDirectory();
  const destination = path.resolve(process.cwd(), requestedDirectory);
  await ensureDirectoryIsEmpty(destination);
  await mkdir(destination, { recursive: true });
  await cp(templateDirectory, destination, { recursive: true });

  const packageManager = options.packageManager ?? inferPackageManager();
  await setProjectDetails(destination, path.basename(requestedDirectory), packageManager);

  if (options.install) {
    console.log(`Installing dependencies with ${packageManager}...`);
    const code = await installDependencies(destination, packageManager);
    if (code !== 0) {
      console.error(`Dependency installation failed with exit code ${code}. You can install them later with ${packageManager} install.`);
      process.exitCode = code;
      return;
    }
  }

  const relativeDirectory = path.relative(process.cwd(), destination) || ".";
  console.log(`\nCreated ${path.basename(destination)} with the Bebop basic starter.`);
  if (relativeDirectory !== ".") console.log(`  cd ${relativeDirectory}`);
  if (options.install) console.log(`  ${packageManager === "npm" ? "npm run dev" : `${packageManager} dev`}`);
  else console.log(`  ${packageManager} install\n  ${packageManager === "npm" ? "npm run dev" : `${packageManager} dev`}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
