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

  return `// Generated from bebop.config.ts. Edit that file, then run bebop generate.\nimport { schema as s } from "jazz-tools";\n\nconst schema = {\n${tables.join(",\n")}\n} as const;\n\ntype AppSchema = s.Schema<typeof schema>;\nexport const app: s.App<AppSchema> = s.defineApp(schema);\n`;
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

  return `// Generated for the local playground. Review every grant before syncing or deploying.\nimport { schema as s } from "jazz-tools";\nimport { app } from "./schema.js";\n\nexport default s.definePermissions(app, ({ policy }) => {\n${grants}\n});\n`;
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

  for (const [collectionName, definition] of Object.entries(config.collections)) {
    if (!namePattern.test(collectionName)) {
      throw new Error(`Invalid collection name "${collectionName}". Use letters, numbers, and underscores.`);
    }

    if (!definition.fields || Object.keys(definition.fields).length === 0) {
      throw new Error(`Collection "${collectionName}" must define at least one field.`);
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
