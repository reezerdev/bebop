import type { BebopConfig, FieldDefinition } from "./bebop.ts";

const namePattern = /^[A-Za-z][A-Za-z0-9_]*$/;

function fieldKind(field: FieldDefinition) {
  if (field.type === "relationship") return "relation" as const;
  if (field.type === "checkbox") return "boolean" as const;
  if (field.type === "number" && field.integer) return "integer" as const;
  return field.type;
}

function selectOptionValue(option: string | { label: string; value: string }): string {
  return typeof option === "string" ? option : option.value;
}

export function normalizeConfig(config: BebopConfig) {
  validateConfig(config);
  return {
    auth: config.auth,
    collections: config.collections.map((definition) => {
      const name = definition.slug;
      const pluralLabel = definition.labels?.plural ?? definition.admin?.label ?? humanize(name);
      const singularLabel = definition.labels?.singular ?? singularize(pluralLabel);
      const fields = definition.fields.map((field) => ({
        name: field.name,
        storageName: field.type === "relationship" ? `${field.name}Id` : field.name,
        label: field.label ?? humanize(field.name),
        kind: fieldKind(field),
        required: Boolean(field.required),
        definition: field,
        ...(field.admin?.position ? { admin: { position: field.admin.position } } : {}),
        ...(field.type === "select" ? { options: field.options.map(selectOptionValue) } : {}),
        ...(field.type === "select" && field.options.some((option) => typeof option !== "string")
          ? { optionLabels: Object.fromEntries(field.options.flatMap((option) => typeof option === "string" ? [] : [[option.value, option.label]])) }
          : {}),
        ...(field.type === "relationship" ? { relationTo: field.relationTo } : {}),
      }));
      const fieldNames = fields.map((field) => field.name);
      const useAsTitle = definition.admin?.useAsTitle ?? (fieldNames.includes("title") ? "title" : undefined);
      return {
        name,
        fields,
        access: definition.access,
        admin: {
          labels: { singular: singularLabel, plural: pluralLabel },
          timestamps: definition.timestamps !== false,
          useAsTitle,
          defaultColumns: definition.admin?.defaultColumns ?? [
            ...(useAsTitle ? [useAsTitle] : []),
            ...fieldNames.filter((fieldName) => fieldName !== useAsTitle),
          ].slice(0, 4),
          listSearchableFields: definition.admin?.listSearchableFields ?? (useAsTitle ? [useAsTitle] : []),
        },
      };
    }),
  };
}

type NormalizedConfig = ReturnType<typeof normalizeConfig>;

function compileSchemaFromModel(model: NormalizedConfig): string {

  const tables = model.collections.map((collection) => {
    const columns: string[] = [];
    const relations: string[] = [];

    for (const field of collection.fields) {
      if (field.kind === "relation") {
        const columnName = field.storageName;
        const optional = field.required ? "" : ".optional()";
        columns.push(`${JSON.stringify(columnName)}: s.uuid()${optional}`);
        relations.push(
          `${JSON.stringify(field.name)}: s.rel(${JSON.stringify(field.relationTo)}, ${JSON.stringify(columnName)})`,
        );
        continue;
      }

      columns.push(
        `${JSON.stringify(field.name)}: ${compileFieldType(field.definition as Exclude<FieldDefinition, { type: "relationship" }>)}${field.required ? "" : ".optional()"}`,
      );
    }

    const relationObject = relations.length
      ? `{\n      ${relations.join(",\n      ")}\n    }`
      : "{}";

    return `  ${JSON.stringify(collection.name)}: s.table(\n    {\n      ${columns.join(",\n      ")}\n    },\n    ${relationObject},\n  )`;
  });

  const authImport = model.auth
    ? 'import { schema as betterAuthSchema } from "./schema-better-auth/schema.js";\n'
    : "";
  const entries = [...(model.auth ? ["  ...betterAuthSchema"] : []), ...tables];

  return `// Generated in bebop-generated-schema.ts from bebop.config.ts. Edit that file, then run bebop generate.\nimport { schema as s } from "jazz-tools";\n${authImport}\nconst schema = {\n${entries.join(",\n")}\n} as const;\n\ntype AppSchema = s.Schema<typeof schema>;\nexport const app: s.App<AppSchema> = s.defineApp(schema);\n`;
}

function compileAdminManifestFromModel(model: NormalizedConfig): string {
  const collections = model.collections.map((collection) => {
    const { labels, timestamps, useAsTitle, defaultColumns, listSearchableFields } = collection.admin;
    const fields = collection.fields.map(({ name, storageName, label: fieldLabel, kind, required, ...rest }) => ({
      name, storageName, label: fieldLabel, kind, required,
      ...(rest.admin ? { admin: rest.admin } : {}),
      ...(rest.options ? { options: rest.options } : {}),
      ...(rest.optionLabels ? { optionLabels: rest.optionLabels } : {}),
      ...(rest.relationTo ? { relationTo: rest.relationTo } : {}),
    }));
    return [collection.name, {
      slug: collection.name,
      labels,
      fields,
      timestamps,
      ...(useAsTitle ? { useAsTitle } : {}),
      defaultColumns,
      listSearchableFields,
    }] as const;
  });

  return `// Generated from bebop.config.ts. Do not edit this file.\nexport const bebopAdminManifest = ${JSON.stringify({ collections: Object.fromEntries(collections) }, null, 2)} as const;\n`;
}

function compilePermissionsFromModel(
  model: NormalizedConfig,
  configModuleSpecifier = "./bebop.config.js",
): string {
  const hasAccessCallbacks = model.collections.some((collection) => collection.access && collection.access !== "public");
  const grants = model.collections
    .flatMap((collection, index) => {
      const collectionName = collection.name;
      const access = collection.access;
      if (!access) return [];
      const operations = [
        ["read", "Read"],
        ["create", "Insert"],
        ["update", "Update"],
        ["delete", "Delete"],
      ] as const;
      if (access === "public") {
        return operations.map(([, jazzOperation]) => `  policy.${collectionName}.allow${jazzOperation}.always();`);
      }
      const rules: string[] = [`  const ${collectionName}Access: Exclude<CollectionDefinition["access"], "public"> = bebopConfig.collections[${index}].access;`];
      for (const [accessOperation, jazzOperation] of operations) {
        if (!access[accessOperation]) continue;
        rules.push(
          `  if (${collectionName}Access?.${accessOperation}) {\n` +
            `    policy.${collectionName}.allow${jazzOperation}.where((row) => ${collectionName}Access.${accessOperation}!({ row, session, allOf, anyOf, exists, isCreator }) as never);\n` +
            `  }`,
        );
      }
      return rules;
    })
    .join("\n");

  const authImport = model.auth
    ? 'import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";\n'
    : "";
  const configImport = hasAccessCallbacks
    ? `import bebopConfig from ${JSON.stringify(configModuleSpecifier)};\nimport type { CollectionDefinition } from "@bebop/core";\n`
    : "";
  const existsHelper = hasAccessCallbacks
    ? `\n  const exists = (collectionName: string, condition: Record<string, unknown>) => {\n` +
        `    const tablePolicy = (policy as unknown as Record<string, { exists: { where(input: Record<string, unknown>): unknown } }>)[collectionName];\n` +
        `    if (!tablePolicy) throw new Error(\`Unknown collection in access.exists(): \${collectionName}\`);\n` +
        `    return tablePolicy.exists.where(condition) as never;\n` +
        `  };\n`
    : "";
  const permissionContext = hasAccessCallbacks ? "policy, session, allOf, anyOf, isCreator" : "policy";
  const appPermissions = `const appPermissions = s.definePermissions(app, ({ ${permissionContext} }) => {${existsHelper}\n${grants}\n});`;

  return `// Generated from bebop.config.ts. Missing collection operations are denied by Jazz.\nimport { schema as s } from "jazz-tools";\nimport { app } from "./bebop-generated-schema.js";\n${authImport}${configImport}\n${appPermissions}\n${model.auth ? "export default { ...betterAuthPermissions, ...appPermissions };" : "export default appPermissions;"}\n`;
}

export function compileSchema(config: BebopConfig): string {
  return compileSchemaFromModel(normalizeConfig(config));
}

export function compileAdminManifest(config: BebopConfig): string {
  return compileAdminManifestFromModel(normalizeConfig(config));
}

export function compilePermissions(config: BebopConfig, configModuleSpecifier = "./bebop.config.js"): string {
  return compilePermissionsFromModel(normalizeConfig(config), configModuleSpecifier);
}

export function compileArtifacts(config: BebopConfig, configModuleSpecifier = "./bebop.config.js") {
  const model = normalizeConfig(config);
  return {
    schema: compileSchemaFromModel(model),
    adminManifest: compileAdminManifestFromModel(model),
    permissions: compilePermissionsFromModel(model, configModuleSpecifier),
    clientFactory: compileClientFactory(configModuleSpecifier),
  };
}

export function compileClientFactory(configModuleSpecifier = "./bebop.config.js"): string {
  return `// Generated from bebop.config.ts. Do not edit this file.\nimport { createBebopClient as createClient } from "@bebop/core";\nimport type { Db } from "jazz-tools";\nimport { app } from "./bebop-generated-schema.js";\nimport bebopConfig from ${JSON.stringify(configModuleSpecifier)};\n\nexport function createBebopClient(db: Db) {\n  return createClient({ app, config: bebopConfig, db });\n}\n`;
}

function compileFieldType(field: Exclude<FieldDefinition, { type: "relationship" }>): string {
  switch (field.type) {
    case "text":
      return "s.string()";
    case "number":
      return field.integer ? "s.int()" : "s.float()";
    case "checkbox":
      return "s.boolean()";
    case "date":
      return "s.timestamp()";
    case "json":
      return "s.json()";
    case "select":
      return `s.enum(${field.options.map((option) => JSON.stringify(selectOptionValue(option))).join(", ")})`;
  }
}

function validateConfig(config: BebopConfig): void {
  if (!Array.isArray(config.collections) || config.collections.length === 0) {
    throw new Error("Bebop config must define at least one collection.");
  }

  const collectionNames = config.collections.map((collection) => collection.slug);

  if (config.auth && config.auth.provider !== "better-auth") {
    throw new Error(`Unsupported authentication provider "${config.auth.provider}".`);
  }

  if (new Set(collectionNames).size !== collectionNames.length) {
    throw new Error("Collection slugs must be unique.");
  }

  for (const definition of config.collections) {
    const collectionName = definition.slug;
    if (!namePattern.test(collectionName)) {
      throw new Error(`Invalid collection name "${collectionName}". Use letters, numbers, and underscores.`);
    }

    if (config.auth && collectionName.startsWith("better_auth_")) {
      throw new Error(
        `Collection name "${collectionName}" uses the reserved Better Auth table prefix "better_auth_".`,
      );
    }

    if (!Array.isArray(definition.fields) || definition.fields.length === 0) {
      throw new Error(`Collection "${collectionName}" must define at least one field.`);
    }

    if (definition.timestamps === false) {
      throw new Error(
        `Collection "${collectionName}" cannot disable timestamps: Jazz records $createdAt and $updatedAt as built-in metadata.`,
      );
    }

    if (definition.access !== undefined && definition.access !== "public" && (typeof definition.access !== "object" || definition.access === null)) {
      throw new Error(`Collection "${collectionName}" access must be "public" or an operation callback object.`);
    }
    if (definition.access && definition.access !== "public") {
      for (const operation of ["read", "create", "update", "delete"] as const) {
        const rule = definition.access[operation];
        if (rule !== undefined && typeof rule !== "function") {
          throw new Error(`Collection "${collectionName}" access.${operation} must be a callback.`);
        }
      }
    }

    for (const hook of ["beforeChange", "afterChange", "beforeDelete", "afterDelete"] as const) {
      const callback = definition.hooks?.[hook];
      if (callback !== undefined && typeof callback !== "function") {
        throw new Error(`Collection "${collectionName}" hooks.${hook} must be a callback.`);
      }
    }

    if (definition.admin?.label !== undefined && !definition.admin.label.trim()) {
      throw new Error(`Collection "${collectionName}" admin label cannot be empty.`);
    }
    for (const name of ["singular", "plural"] as const) {
      if (definition.labels?.[name] !== undefined && !definition.labels[name]?.trim()) {
        throw new Error(`Collection "${collectionName}" labels.${name} cannot be empty.`);
      }
    }

    const storedNames = new Set<string>(["id"]);
    const fieldNames = new Set<string>();
    for (const field of definition.fields) {
      const fieldName = field.name;
      if (!["text", "number", "checkbox", "date", "json", "select", "relationship"].includes(field.type)) {
        throw new Error(`Unsupported field type "${field.type}" in collection "${collectionName}".`);
      }
      if (!namePattern.test(fieldName) || fieldName === "id") {
        throw new Error(`Invalid field name "${fieldName}" in collection "${collectionName}".`);
      }

      if (field.label !== undefined && !field.label.trim()) {
        throw new Error(`Field "${collectionName}.${fieldName}" label cannot be empty.`);
      }

      if (fieldNames.has(fieldName)) {
        throw new Error(`Duplicate field name "${fieldName}" in collection "${collectionName}".`);
      }
      fieldNames.add(fieldName);

      const storageName = field.type === "relationship" ? `${fieldName}Id` : fieldName;
      if (storedNames.has(storageName)) {
        throw new Error(`Field "${fieldName}" conflicts with another stored field in "${collectionName}".`);
      }
      storedNames.add(storageName);

      if (field.type === "relationship" && !collectionNames.includes(field.relationTo) && !(config.auth?.provider === "better-auth" && field.relationTo === "better_auth_user")) {
        throw new Error(`Relation "${collectionName}.${fieldName}" targets unknown collection "${field.relationTo}".`);
      }

      if (field.type === "select") {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          throw new Error(`Select field "${collectionName}.${fieldName}" must have at least one option.`);
        }
        const values: string[] = field.options.map(selectOptionValue);
        if (values.some((value: string) => typeof value !== "string" || !value.trim()) || new Set(values).size !== values.length) {
          throw new Error(`Select field "${collectionName}.${fieldName}" must have unique non-empty option values.`);
        }
        if (field.options.some((option: string | { label: string; value: string }) => typeof option !== "string" && (typeof option.label !== "string" || !option.label.trim()))) {
          throw new Error(`Select field "${collectionName}.${fieldName}" must have non-empty option labels.`);
        }
      }
      if (field.admin?.position !== undefined && field.admin.position !== "main" && field.admin.position !== "sidebar") {
        throw new Error(`Field "${collectionName}.${fieldName}" admin.position must be "main" or "sidebar".`);
      }
    }

    const adminOptions = definition.admin;
    if (adminOptions?.useAsTitle && !fieldNames.has(adminOptions.useAsTitle)) {
      throw new Error(`Collection "${collectionName}" admin.useAsTitle references unknown field "${adminOptions.useAsTitle}".`);
    }
    for (const fieldName of adminOptions?.defaultColumns ?? []) {
      if (!fieldNames.has(fieldName)) {
        throw new Error(`Collection "${collectionName}" admin.defaultColumns references unknown field "${fieldName}".`);
      }
    }
    for (const fieldName of adminOptions?.listSearchableFields ?? []) {
      if (!fieldNames.has(fieldName)) {
        throw new Error(`Collection "${collectionName}" admin.listSearchableFields references unknown field "${fieldName}".`);
      }
      if (definition.fields.find((field: FieldDefinition) => field.name === fieldName)?.type !== "text") {
        throw new Error(`Collection "${collectionName}" admin.listSearchableFields field "${fieldName}" must be text.`);
      }
    }
  }
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function singularize(value: string): string {
  if (/\b(news|series|species)$/i.test(value)) return value;
  if (/(ches|shes|sses|xes|zes)$/i.test(value)) return value.slice(0, -2);
  if (/ies$/i.test(value)) return `${value.slice(0, -3)}y`;
  if (/s$/i.test(value) && !/(ss|us|is)$/i.test(value)) return value.slice(0, -1);
  return value;
}
