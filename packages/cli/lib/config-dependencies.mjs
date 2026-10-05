import { access, readFile } from "node:fs/promises";
import path from "node:path";

const importPattern = /\bfrom\s*["'](\.[^"']+)["']|\bimport\s*["'](\.[^"']+)["']|\bimport\s*\(\s*["'](\.[^"']+)["']/g;
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

async function resolveLocalImport(fromFile, specifier) {
  const target = path.resolve(path.dirname(fromFile), specifier);
  const extension = path.extname(target);
  const candidates = extension
    ? [target, ...sourceExtensions.map((sourceExtension) => target.slice(0, -extension.length) + sourceExtension)]
    : [...sourceExtensions.map((sourceExtension) => target + sourceExtension), ...sourceExtensions.map((sourceExtension) => path.join(target, `index${sourceExtension}`))];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch { /* Try the next source extension. */ }
  }
  return undefined;
}

/** Follow local static imports so a config split into collection modules regenerates on edit. */
export async function collectConfigDependencies(entryFiles) {
  const visited = new Set();
  const pending = [...entryFiles];
  while (pending.length) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    let source;
    try {
      source = await readFile(file, "utf8");
    } catch { continue; }
    for (const match of source.matchAll(importPattern)) {
      const dependency = await resolveLocalImport(file, match[1] ?? match[2] ?? match[3]);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
}
