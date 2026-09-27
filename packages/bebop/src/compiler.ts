import type { BebopConfig, FieldDefinition } from "./bebop.ts";

const namePattern = /^[A-Za-z][A-Za-z0-9_]*$/;

export function compileSchema(config: BebopConfig): string {
  validateConfig(config);

  const tables = Object.entries(config.collections).map(([collectionName, definition]) => {
    const columns: string[] = [];
    const relations: string[] = [];

    for (const [fieldName, field] of Object.entries(definition.fields)) {
      if (field.kind === "relation") {
        const columnName = `${fieldName}Id`;
        const optional = field.required ? "" : ".optional()";
        columns.push(`${JSON.stringify(columnName)}: s.uuid()${optional}`);
        relations.push(
          `${JSON.stringify(fieldName)}: s.rel(${JSON.stringify(field.to)}, ${JSON.stringify(columnName)})`,
        );
        continue;
      }

      columns.push(
        `${JSON.stringify(fieldName)}: ${compileFieldType(field)}${field.required ? "" : ".optional()"}`,
      );
    }

    const relationObject = relations.length
      ? `{\n      ${relations.join(",\n      ")}\n    }`
      : "{}";

    return `  ${JSON.stringify(collectionName)}: s.table(\n    {\n      ${columns.join(",\n      ")}\n    },\n    ${relationObject},\n  )`;
  });

  const authImport = config.auth
    ? 'import { schema as betterAuthSchema } from "./schema-better-auth/schema.js";\n'
    : "";
  const entries = [...(config.auth ? ["  ...betterAuthSchema"] : []), ...tables];

  return `// Generated in bebop-generated-schema.ts from bebop.config.ts. Edit that file, then run bebop generate.\nimport { schema as s } from "jazz-tools";\n${authImport}\nconst schema = {\n${entries.join(",\n")}\n} as const;\n\ntype AppSchema = s.Schema<typeof schema>;\nexport const app: s.App<AppSchema> = s.defineApp(schema);\n`;
}

export function compilePermissions(config: BebopConfig): string {
  validateConfig(config);

  const grants = Object.keys(config.collections)
    .flatMap((collectionName) =>
      (["Read", "Insert", "Update", "Delete"] as const).map(
        (operation) => `  policy.${collectionName}.allow${operation}.always();`,
      ),
    )
    .join("\n");

  const authImport = config.auth
    ? 'import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";\n'
    : "";
  const appPermissions = `const appPermissions = s.definePermissions(app, ({ policy }) => {\n${grants}\n});`;

  return `// Generated for the local playground. Review every grant before syncing or deploying.\nimport { schema as s } from "jazz-tools";\nimport { app } from "./bebop-generated-schema.js";\n${authImport}\n${appPermissions}\n${config.auth ? "export default { ...betterAuthPermissions, ...appPermissions };" : "export default appPermissions;"}\n`;
}

function compileFieldType(field: Exclude<FieldDefinition, { kind: "relation" }>): string {
  switch (field.kind) {
    case "text":
      return "s.string()";
    case "number":
      return "s.float()";
    case "integer":
      return "s.int()";
    case "boolean":
      return "s.boolean()";
    case "date":
      return "s.timestamp()";
    case "json":
      return "s.json()";
    case "select":
      return `s.enum(${field.options.map((option) => JSON.stringify(option)).join(", ")})`;
  }
}

function validateConfig(config: BebopConfig): void {
  if (!config.collections || Object.keys(config.collections).length === 0) {
    throw new Error("Bebop config must define at least one collection.");
  }

  const collectionNames = Object.keys(config.collections);

  if (config.auth && config.auth.provider !== "better-auth") {
    throw new Error(`Unsupported authentication provider "${config.auth.provider}".`);
  }

  for (const [collectionName, definition] of Object.entries(config.collections)) {
    if (!namePattern.test(collectionName)) {
      throw new Error(`Invalid collection name "${collectionName}". Use letters, numbers, and underscores.`);
    }

    if (config.auth && collectionName.startsWith("better_auth_")) {
      throw new Error(
        `Collection name "${collectionName}" uses the reserved Better Auth table prefix "better_auth_".`,
      );
    }

    if (!definition.fields || Object.keys(definition.fields).length === 0) {
      throw new Error(`Collection "${collectionName}" must define at least one field.`);
    }

    if (definition.timestamps === false) {
      throw new Error(
        `Collection "${collectionName}" cannot disable timestamps: Jazz records $createdAt and $updatedAt as built-in metadata.`,
      );
    }

    const storedNames = new Set<string>(["id"]);
    for (const [fieldName, field] of Object.entries(definition.fields)) {
      if (!namePattern.test(fieldName) || fieldName === "id") {
        throw new Error(`Invalid field name "${fieldName}" in collection "${collectionName}".`);
      }

      const storageName = field.kind === "relation" ? `${fieldName}Id` : fieldName;
      if (storedNames.has(storageName)) {
        throw new Error(`Field "${fieldName}" conflicts with another stored field in "${collectionName}".`);
      }
      storedNames.add(storageName);

      if (field.kind === "relation" && !collectionNames.includes(field.to)) {
        throw new Error(`Relation "${collectionName}.${fieldName}" targets unknown collection "${field.to}".`);
      }

      if (field.kind === "select" && field.options.length === 0) {
        throw new Error(`Select field "${collectionName}.${fieldName}" must have at least one option.`);
      }
    }
  }
}
