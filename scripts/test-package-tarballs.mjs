import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "bebop-package-test-"));
const tarballDirectory = path.join(temporaryRoot, "tarballs");
const consumerDirectory = path.join(temporaryRoot, "examples", "basic");
const packages = [
  ["@bebopdev/core", "packages/bebop"],
  ["@bebopdev/admin", "packages/admin"],
  ["@bebopdev/cli", "packages/cli"],
];
let succeeded = false;

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

try {
  await mkdir(tarballDirectory, { recursive: true });
  const tarballs = {};

  for (const [name, directory] of packages) {
    const packageDirectory = path.join(repositoryRoot, directory);
    const manifest = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
    run("pnpm", ["pack", "--pack-destination", tarballDirectory], packageDirectory);
    const filename = `${name.slice(1).replace("/", "-")}-${manifest.version}.tgz`;
    tarballs[name] = path.join(tarballDirectory, filename);
  }

  await mkdir(path.dirname(consumerDirectory), { recursive: true });
  await cp(path.join(repositoryRoot, "examples/basic"), consumerDirectory, {
    recursive: true,
    filter: (source) => !source.split(path.sep).some((part) => part === "node_modules" || part === ".env"),
  });
  await cp(path.join(repositoryRoot, "tsconfig.json"), path.join(temporaryRoot, "tsconfig.json"));

  const consumerManifestPath = path.join(consumerDirectory, "package.json");
  const consumerManifest = JSON.parse(await readFile(consumerManifestPath, "utf8"));
  for (const name of ["@bebopdev/core", "@bebopdev/admin"]) {
    consumerManifest.dependencies[name] = `file:${tarballs[name]}`;
  }
  consumerManifest.devDependencies["@bebopdev/cli"] = `file:${tarballs["@bebopdev/cli"]}`;
  await writeFile(consumerManifestPath, `${JSON.stringify(consumerManifest, null, 2)}\n`);
  await writeFile(
    path.join(temporaryRoot, "pnpm-workspace.yaml"),
    [
      "packages:",
      "  - \"examples/basic\"",
      "allowBuilds:",
      "  esbuild@0.27.7: true",
      "  esbuild@0.28.2: true",
      "  protobufjs@8.0.1: true",
      "overrides:",
      `  "@bebopdev/core": ${JSON.stringify(`file:${tarballs["@bebopdev/core"]}`)}`,
      "",
    ].join("\n"),
  );

  run("pnpm", ["install"], temporaryRoot);
  run("pnpm", ["exec", "bebop", "generate"], consumerDirectory);
  run("pnpm", ["exec", "bebop", "validate"], consumerDirectory);
  run("pnpm", ["exec", "tsc", "--noEmit"], consumerDirectory);
  run("pnpm", ["exec", "vite", "build"], consumerDirectory);
  succeeded = true;
  console.log("Packed-package consumer check passed.");
} finally {
  if (succeeded) {
    await rm(temporaryRoot, { recursive: true, force: true });
  } else {
    console.error(`Package-test files were kept at ${temporaryRoot}`);
  }
}
