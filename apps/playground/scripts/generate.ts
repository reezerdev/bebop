import { writeFile } from "node:fs/promises";
import config from "../bebop.config.ts";
import { compilePermissions, compileSchema } from "@bebop/core";

await Promise.all([
  writeFile("schema.ts", compileSchema(config), "utf8"),
  writeFile("permissions.ts", compilePermissions(config), "utf8"),
]);

console.log("Generated apps/playground/schema.ts and permissions.ts from bebop.config.ts");
