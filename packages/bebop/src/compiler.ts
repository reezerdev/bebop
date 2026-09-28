import type { BebopConfig, FieldDefinition, FieldOptions, Fields } from "./bebop.ts";

const namePattern = /^[A-Za-z][A-Za-z0-9_]*$/;

type StoredFieldKind = Exclude<FieldDefinition["type"], "join" | "relationship" | "upload" | "checkbox"> | "relation" | "upload" | "boolean" | "integer";

function fieldKind(field: Exclude<FieldDefinition, { type: "join" }>): StoredFieldKind {
  if (field.type === "relationship") return "relation" as const;
  if (field.type === "upload") return "upload" as const;
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
      const configuredFields = definition.fields.map((field) => {
        if (field.type === "join") {
          return {
            name: field.name,
            label: field.label ?? humanize(field.name),
            kind: "join" as const,
            required: false,
            collection: field.collection,
            on: field.on,
            ...(field.admin ? { admin: field.admin } : {}),
          };
        }
        return {
          name: field.name,
          storageName: field.type === "relationship" || field.type === "upload" ? `${field.name}Id` : field.name,
          label: field.label ?? humanize(field.name),
          kind: fieldKind(field),
          required: Boolean(field.required),
          definition: field,
          ...(field.admin ? { admin: field.admin } : {}),
          ...(field.type === "select" ? { options: field.options.map(selectOptionValue) } : {}),
          ...(field.type === "select" && field.options.some((option) => typeof option !== "string")
            ? { optionLabels: Object.fromEntries(field.options.flatMap((option) => typeof option === "string" ? [] : [[option.value, option.label]])) }
            : {}),
          ...(field.type === "relationship" || field.type === "upload" ? { relationTo: field.relationTo } : {}),
        };
      });
      const generatedFields = definition.upload
        ? ([
          ["filename", "text"], ["mimeType", "text"], ["filesize", "integer"],
        ] as const).map(([fieldName, kind]) => ({
          name: fieldName,
          storageName: fieldName,
          label: humanize(fieldName),
          kind,
          required: true,
          generated: true,
          admin: undefined,
          definition: (kind === "integer" ? { name: fieldName, type: "number" as const, integer: true } : { name: fieldName, type: "text" as const }),
        }))
        : [];
      const fields = [...configuredFields, ...generatedFields];
      const storedFields = fields.filter((field) => field.kind !== "join");
      const fieldNames = storedFields.map((field) => field.name);
      const useAsTitle = definition.admin?.useAsTitle ?? (fieldNames.includes("title") ? "title" : definition.upload ? "filename" : undefined);
      return {
        name,
        fields,
        access: definition.access,
        writeMode: definition.writeMode ?? "direct",
        upload: definition.upload ? {
          mimeTypes: typeof definition.upload === "object" ? definition.upload.mimeTypes ?? [] : [],
          maxFileSize: config.upload?.limits?.fileSize ?? 20 * 1024 * 1024,
        } : undefined,
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
      if (field.kind === "join") {
        relations.push(
          `${JSON.stringify(field.name)}: s.reverse(${JSON.stringify(field.collection)}, ${JSON.stringify(field.on)})`,
        );
        continue;
      }
      if (field.kind === "relation" || field.kind === "upload") {
        const columnName = field.storageName;
        const optional = field.required ? "" : ".optional()";
        columns.push(`${JSON.stringify(columnName)}: s.uuid()${optional}`);
        relations.push(
          `${JSON.stringify(field.name)}: s.rel(${JSON.stringify(field.relationTo)}, ${JSON.stringify(columnName)})`,
        );
        continue;
      }

      columns.push(
        `${JSON.stringify(field.name)}: ${compileFieldType(field.definition as Exclude<FieldDefinition, { type: "relationship" | "upload" | "join" }>)}${field.required ? "" : ".optional()"}`,
      );
    }
    if (collection.upload) {
      columns.push(`"fileId": s.uuid()`);
      relations.push(`"file": s.rel(${JSON.stringify(`bebop_files_${collection.name}`)}, "fileId")`);
    }

    const relationObject = relations.length
      ? `{\n      ${relations.join(",\n      ")}\n    }`
      : "{}";

    const mainTable = `  ${JSON.stringify(collection.name)}: s.table(\n    {\n      ${columns.join(",\n      ")}\n    },\n    ${relationObject},\n  )`;
    return collection.upload
      ? `${mainTable},\n  ${JSON.stringify(`bebop_files_${collection.name}`)}: s.table(\n    {\n      "ownerAccount": s.uuid(),\n      "mediaId": s.uuid().optional(),\n      "partIds": s.array(s.uuid()),\n      "partSizes": s.array(s.int())\n    },\n    {\n      "media": s.rel(${JSON.stringify(collection.name)}, "mediaId")\n    },\n  ),\n  ${JSON.stringify(`bebop_file_parts_${collection.name}`)}: s.table(\n    {\n      "data": s.bytes(),\n      "ownerAccount": s.uuid(),\n      "fileId": s.uuid()\n    },\n    {\n      "file": s.rel(${JSON.stringify(`bebop_files_${collection.name}`)}, "fileId")\n    },\n  )`
      : mainTable;
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
    const fields = collection.fields.map((field) => field.kind === "join"
      ? {
          name: field.name,
          label: field.label,
          kind: field.kind,
          required: false,
          collection: field.collection,
          on: field.on,
          ...(field.admin ? { admin: field.admin } : {}),
        }
      : {
          name: field.name,
          storageName: field.storageName,
          label: field.label,
          kind: field.kind,
          required: field.required,
          ...(field.admin ? { admin: field.admin } : {}),
          ...("options" in field && field.options ? { options: field.options } : {}),
          ...("optionLabels" in field && field.optionLabels ? { optionLabels: field.optionLabels } : {}),
          ...("minLength" in field && field.minLength !== undefined ? { minLength: field.minLength } : {}),
          ...("maxLength" in field && field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
          ...("min" in field && field.min !== undefined ? { min: field.min } : {}),
          ...("max" in field && field.max !== undefined ? { max: field.max } : {}),
          ...("relationTo" in field && field.relationTo ? { relationTo: field.relationTo } : {}),
          ...("generated" in field && field.generated ? { generated: true } : {}),
        });
    return [collection.name, {
      slug: collection.name,
      labels,
      fields,
      timestamps,
      ...(useAsTitle ? { useAsTitle } : {}),
      defaultColumns,
      listSearchableFields,
      writeMode: collection.writeMode,
      ...(collection.upload ? { upload: collection.upload } : {}),
    }] as const;
  });

  return `// Generated from bebop.config.ts. Do not edit this file.\nexport const bebopAdminManifest = ${JSON.stringify({ collections: Object.fromEntries(collections) }, null, 2)} as const;\n`;
}

function compilePermissionsFromModel(
  model: NormalizedConfig,
  configModuleSpecifier = "./bebop.config.js",
  options: { blockCommandWrites?: boolean } = {},
): string {
  const hasAccessCallbacks = model.collections.some((collection) => collection.access && collection.access !== "public" && collection.access !== "authenticated");
  const hasAuthenticatedAccess = model.collections.some((collection) => collection.access === "authenticated");
  const hasUploads = model.collections.some((collection) => collection.upload);
  const grants = model.collections
    .flatMap((collection, index) => {
      const collectionName = collection.name;
      const access = collection.access;
      const blockedCommandWrites = options.blockCommandWrites && collection.writeMode === "command";
      const fileRules = collection.upload ? [
        `  policy.bebop_files_${collectionName}.allowInsert.where({ ownerAccount: session.user.account });`,
        `  policy.bebop_files_${collectionName}.allowRead.where(allowedTo.read("media"));`,
        `  policy.bebop_files_${collectionName}.allowUpdate.whereOld({ ownerAccount: session.user.account, mediaId: null }).whereNew({ ownerAccount: session.user.account });`,
        `  policy.bebop_files_${collectionName}.allowDelete.where(anyOf([{ ownerAccount: session.user.account, mediaId: null }, allowedTo.delete("media")]));`,
        `  policy.bebop_file_parts_${collectionName}.allowInsert.where({ ownerAccount: session.user.account });`,
        `  policy.bebop_file_parts_${collectionName}.allowRead.where(allowedTo.read("file"));`,
        `  policy.bebop_file_parts_${collectionName}.allowUpdate.never();`,
        `  policy.bebop_file_parts_${collectionName}.allowDelete.where(allowedTo.delete("file"));`,
      ] : [];
      const operations = [
        ["read", "Read"],
        ["create", "Insert"],
        ["update", "Update"],
        ["delete", "Delete"],
      ] as const;
      if (!access) {
        return [
          ...operations.map(([, jazzOperation]) => `  policy.${collectionName}.allow${jazzOperation}.never();`),
          ...fileRules,
        ];
      }
      if (blockedCommandWrites) {
        const accessBinding = access && access !== "public" && access !== "authenticated"
          ? [`  const ${collectionName}Access: Exclude<CollectionDefinition["access"], "public" | "authenticated"> = bebopConfig.collections[${index}].access;`]
          : [];
        const reads = access === "public"
          ? [`  policy.${collectionName}.allowRead.always();`]
          : access === "authenticated"
            ? [`  policy.${collectionName}.allowRead.where(authenticatedSession);`]
            : access.read
              ? operations.filter(([operation]) => operation === "read").map(([, operation]) => `  policy.${collectionName}.allow${operation}.where((row) => ${collectionName}Access.read!({ row, session, allOf, anyOf, exists, isCreator }) as never);`)
              : [`  policy.${collectionName}.allowRead.never();`];
        return [
          ...accessBinding,
          ...reads,
          `  policy.${collectionName}.allowInsert.never();`,
          `  policy.${collectionName}.allowUpdate.never();`,
          `  policy.${collectionName}.allowDelete.never();`,
          ...fileRules,
        ];
      }
      if (access === "public") {
        return [...operations.map(([, jazzOperation]) => `  policy.${collectionName}.allow${jazzOperation}.always();`), ...fileRules];
      }
      if (access === "authenticated") {
        return [...operations.map(([, jazzOperation]) => `  policy.${collectionName}.allow${jazzOperation}.where(authenticatedSession);`), ...fileRules];
      }
      const rules: string[] = [`  const ${collectionName}Access: Exclude<CollectionDefinition["access"], "public" | "authenticated"> = bebopConfig.collections[${index}].access;`];
      for (const [accessOperation, jazzOperation] of operations) {
        if (access[accessOperation]) {
          rules.push(
            `  if (${collectionName}Access?.${accessOperation}) {\n` +
              `    policy.${collectionName}.allow${jazzOperation}.where((row) => ${collectionName}Access.${accessOperation}!({ row, session, allOf, anyOf, exists, isCreator }) as never);\n` +
              `  }`,
          );
        } else {
          rules.push(`  policy.${collectionName}.allow${jazzOperation}.never();`);
        }
      }
      return [...rules, ...fileRules];
    })
    .join("\n");

  const authImport = model.auth
    ? 'import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";\n'
    : "";
  const configImport = hasAccessCallbacks
    ? `import bebopConfig from ${JSON.stringify(configModuleSpecifier)};\nimport type { CollectionDefinition } from "@bebopdev/core";\n`
    : "";
  const existsHelper = hasAccessCallbacks
    ? `\n  const exists = (collectionName: string, condition: Record<string, unknown>) => {\n` +
        `    const tablePolicy = (policy as unknown as Record<string, { exists: { where(input: Record<string, unknown>): unknown } }>)[collectionName];\n` +
        `    if (!tablePolicy) throw new Error(\`Unknown collection in access.exists(): \${collectionName}\`);\n` +
        `    return tablePolicy.exists.where(condition) as never;\n` +
        `  };\n`
    : "";
  const permissionContextNames = new Set<string>(["policy"]);
  if (hasAccessCallbacks) for (const name of ["session", "allOf", "anyOf", "isCreator", "allowedTo"]) permissionContextNames.add(name);
  else if (hasAuthenticatedAccess) permissionContextNames.add("session");
  if (hasUploads) for (const name of ["session", "anyOf", "allowedTo"]) permissionContextNames.add(name);
  const permissionContext = [...permissionContextNames].join(", ");
  const authenticatedHelper = hasAuthenticatedAccess
    ? `\n  const authenticatedSession = session.where({ authMode: { in: ["external", "local-first"] } });\n`
    : "";
  const appPermissions = `const appPermissions = s.definePermissions(app, ({ ${permissionContext} }) => {${existsHelper}${authenticatedHelper}\n${grants}\n});`;

  return `// Generated from bebop.config.ts. Missing collection operations are explicitly denied.\nimport { schema as s } from "jazz-tools";\nimport { app } from "./bebop-generated-schema.js";\n${authImport}${configImport}\n${appPermissions}\n${model.auth ? "export default { ...betterAuthPermissions, ...appPermissions };" : "export default appPermissions;"}\n`;
}

export function compileSchema(config: BebopConfig): string {
  return compileSchemaFromModel(normalizeConfig(config));
}

export function compileAdminManifest(config: BebopConfig): string {
  return compileAdminManifestFromModel(normalizeConfig(config));
}

export function compilePermissions(config: BebopConfig, configModuleSpecifier = "./bebop.config.js"): string {
  return compilePermissionsFromModel(normalizeConfig(config), configModuleSpecifier, { blockCommandWrites: true });
}

export function compileCommandPermissions(config: BebopConfig, configModuleSpecifier = "./bebop.config.js"): string {
  return compilePermissionsFromModel(normalizeConfig(config), configModuleSpecifier);
}

export function compileArtifacts(config: BebopConfig, configModuleSpecifier = "./bebop.config.js") {
  const model = normalizeConfig(config);
  return {
    schema: compileSchemaFromModel(model),
    adminManifest: compileAdminManifestFromModel(model),
    permissions: compilePermissionsFromModel(model, configModuleSpecifier, { blockCommandWrites: true }),
    authorizationPermissions: compilePermissionsFromModel(model, configModuleSpecifier),
    clientFactory: compileClientFactory(configModuleSpecifier),
  };
}

export function compileClientFactory(configModuleSpecifier = "./bebop.config.js"): string {
  return `// Generated from bebop.config.ts. Do not edit this file.\nimport { createBebopClient as createClient } from "@bebopdev/core";\nimport type { BebopCommandTransport } from "@bebopdev/core";\nimport type { Db } from "jazz-tools";\nimport { app } from "./bebop-generated-schema.js";\nimport bebopConfig from ${JSON.stringify(configModuleSpecifier)};\n\nexport function createBebopClient(db: Db, options: { commandTransport?: BebopCommandTransport } = {}) {\n  return createClient({ app, config: bebopConfig, db, ...options });\n}\n`;
}

function compileFieldType(field: Exclude<FieldDefinition, { type: "relationship" | "upload" | "join" }>): string {
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

  const collections = config.collections as BebopConfig["collections"];
  const collectionNames = collections.map((collection) => collection.slug);
  const fileSizeLimit = config.upload?.limits?.fileSize;
  if (fileSizeLimit !== undefined && (!Number.isSafeInteger(fileSizeLimit) || fileSizeLimit <= 0)) {
    throw new Error("upload.limits.fileSize must be a positive safe integer.");
  }

  if (config.auth && config.auth.provider !== "better-auth") {
    throw new Error(`Unsupported authentication provider "${config.auth.provider}".`);
  }

  if (new Set(collectionNames).size !== collectionNames.length) {
    throw new Error("Collection slugs must be unique.");
  }

  for (const definition of collections) {
    const collectionName = definition.slug;
    if (!namePattern.test(collectionName)) {
      throw new Error(`Invalid collection name "${collectionName}". Use letters, numbers, and underscores.`);
    }
    if (collectionName.startsWith("bebop_files_") || collectionName.startsWith("bebop_file_parts_")) {
      throw new Error(`Collection name "${collectionName}" uses the reserved Bebop file table prefix.`);
    }
    if (definition.upload !== undefined && definition.upload !== true && (typeof definition.upload !== "object" || definition.upload === null || (definition.upload.mimeTypes !== undefined && !Array.isArray(definition.upload.mimeTypes)))) {
      throw new Error(`Collection "${collectionName}" upload must be true or contain mimeTypes.`);
    }
    if (typeof definition.upload === "object") {
      for (const mimeType of definition.upload.mimeTypes ?? []) {
        if (!/^[\w.+-]+\/[\w.+*-]+$/.test(mimeType)) throw new Error(`Invalid MIME type "${mimeType}" in "${collectionName}".`);
      }
    }

    if (config.auth && collectionName.startsWith("better_auth_")) {
      throw new Error(
        `Collection name "${collectionName}" uses the reserved Better Auth table prefix "better_auth_".`,
      );
    }

    if (!Array.isArray(definition.fields) || definition.fields.length === 0) {
      throw new Error(`Collection "${collectionName}" must define at least one field.`);
    }
    const fields = definition.fields as Fields;

    if (definition.timestamps === false) {
      throw new Error(
        `Collection "${collectionName}" cannot disable timestamps: Jazz records $createdAt and $updatedAt as built-in metadata.`,
      );
    }

    if (definition.writeMode !== undefined && definition.writeMode !== "direct" && definition.writeMode !== "command") {
      throw new Error(`Collection "${collectionName}" writeMode must be "direct" or "command".`);
    }
    if (definition.writeMode === "command" && definition.upload) {
      throw new Error(`Collection "${collectionName}" cannot combine writeMode "command" with Upload in this release.`);
    }
    if (definition.access !== undefined && definition.access !== "public" && definition.access !== "authenticated" && (typeof definition.access !== "object" || definition.access === null)) {
      throw new Error(`Collection "${collectionName}" access must be "authenticated", "public", or an operation callback object.`);
    }
    if (definition.access && definition.access !== "public" && definition.access !== "authenticated") {
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

    const storedNames = new Set<string>(["id", ...(definition.upload ? ["filename", "mimeType", "filesize", "fileId"] : [])]);
    const fieldNames = new Set<string>(definition.upload ? ["filename", "mimeType", "filesize"] : []);
    for (const field of fields) {
      const fieldName = field.name;
      if (!["text", "number", "checkbox", "date", "json", "select", "relationship", "upload", "join"].includes(field.type)) {
        throw new Error(`Unsupported field type "${field.type}" in collection "${collectionName}".`);
      }
      if (!namePattern.test(fieldName) || fieldName === "id") {
        throw new Error(`Invalid field name "${fieldName}" in collection "${collectionName}".`);
      }

      if (field.label !== undefined && !field.label.trim()) {
        throw new Error(`Field "${collectionName}.${fieldName}" label cannot be empty.`);
      }

      if (field.type === "text") {
        for (const key of ["minLength", "maxLength"] as const) {
          const value = field[key];
          if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
            throw new Error(`Field "${collectionName}.${fieldName}" ${key} must be a non-negative safe integer.`);
          }
        }
        if (field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) {
          throw new Error(`Field "${collectionName}.${fieldName}" minLength cannot exceed maxLength.`);
        }
        if (field.validate !== undefined && typeof field.validate !== "function") {
          throw new Error(`Field "${collectionName}.${fieldName}" validate must be a callback.`);
        }
      }
      if (field.type === "number") {
        for (const key of ["min", "max"] as const) {
          const value = field[key];
          if (value !== undefined && !Number.isFinite(value)) {
            throw new Error(`Field "${collectionName}.${fieldName}" ${key} must be a finite number.`);
          }
        }
        if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
          throw new Error(`Field "${collectionName}.${fieldName}" min cannot exceed max.`);
        }
        if (field.validate !== undefined && typeof field.validate !== "function") {
          throw new Error(`Field "${collectionName}.${fieldName}" validate must be a callback.`);
        }
      }

      if (fieldNames.has(fieldName)) {
        throw new Error(`Duplicate field name "${fieldName}" in collection "${collectionName}".`);
      }
      fieldNames.add(fieldName);

      if (field.type !== "join") {
        const storageName = field.type === "relationship" || field.type === "upload" ? `${fieldName}Id` : fieldName;
        if (storedNames.has(storageName)) {
          throw new Error(`Field "${fieldName}" conflicts with another stored field in "${collectionName}".`);
        }
        storedNames.add(storageName);
      }

      if (field.type === "relationship" && !collectionNames.includes(field.relationTo) && !(config.auth?.provider === "better-auth" && field.relationTo === "better_auth_user")) {
        throw new Error(`Relation "${collectionName}.${fieldName}" targets unknown collection "${field.relationTo}".`);
      }
      if (field.type === "upload" && !collections.some((candidate) => candidate.slug === field.relationTo && candidate.upload)) {
        throw new Error(`Upload field "${collectionName}.${fieldName}" must target an upload-enabled collection "${field.relationTo}".`);
      }

      if (field.type === "join") {
        const target = collections.find((candidate) => candidate.slug === field.collection);
        if (!target) {
          throw new Error(`Join field "${collectionName}.${fieldName}" targets unknown collection "${field.collection}".`);
        }
        const relationship = target.fields.find((candidate) => candidate.name === field.on);
        if (!relationship) {
          throw new Error(`Join field "${collectionName}.${fieldName}" references missing field "${field.collection}.${field.on}".`);
        }
        if (relationship.type !== "relationship") {
          throw new Error(`Join field "${collectionName}.${fieldName}" on field "${field.collection}.${field.on}" must be a relationship.`);
        }
        if (relationship.relationTo !== collectionName) {
          throw new Error(`Join field "${collectionName}.${fieldName}" on field "${field.collection}.${field.on}" must relate to "${collectionName}".`);
        }
        if (field.label !== undefined && !field.label.trim()) {
          throw new Error(`Field "${collectionName}.${fieldName}" label cannot be empty.`);
        }
        for (const column of field.admin?.defaultColumns ?? []) {
          const columnField = target.fields.find((candidate) => candidate.name === column);
          if (!columnField || columnField.type === "join") {
            throw new Error(`Join field "${collectionName}.${fieldName}" admin.defaultColumns references unknown stored field "${column}" in "${field.collection}".`);
          }
        }
        if (field.admin?.allowCreate !== undefined && typeof field.admin.allowCreate !== "boolean") {
          throw new Error(`Join field "${collectionName}.${fieldName}" admin.allowCreate must be a boolean.`);
        }
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
      if (field.type !== "join") {
        const fieldAdmin = field.admin as FieldOptions["admin"] | undefined;
        if (fieldAdmin?.position !== undefined && fieldAdmin.position !== "main" && fieldAdmin.position !== "sidebar") {
          throw new Error(`Field "${collectionName}.${fieldName}" admin.position must be "main" or "sidebar".`);
        }
        if (fieldAdmin?.input !== undefined && (field.type !== "text" || fieldAdmin.input !== "textarea")) {
          throw new Error(`Field "${collectionName}.${fieldName}" admin.input must be "textarea" on a text field.`);
        }
        if (fieldAdmin?.date !== undefined && (field.type !== "date" || !["dayOnly", "dayAndTime", undefined].includes(fieldAdmin.date.pickerAppearance))) {
          throw new Error(`Field "${collectionName}.${fieldName}" admin.date must configure a date field.`);
        }
      }
    }

    const adminOptions = definition.admin;
    if (adminOptions?.useAsTitle && !fieldNames.has(adminOptions.useAsTitle)) {
      throw new Error(`Collection "${collectionName}" admin.useAsTitle references unknown field "${adminOptions.useAsTitle}".`);
    }
    for (const fieldName of adminOptions?.defaultColumns ?? []) {
      if (fields.find((field) => field.name === fieldName)?.type === "join") {
        throw new Error(`Collection "${collectionName}" admin.defaultColumns cannot include virtual join field "${fieldName}".`);
      }
      if (!fieldNames.has(fieldName)) {
        throw new Error(`Collection "${collectionName}" admin.defaultColumns references unknown field "${fieldName}".`);
      }
    }
    for (const fieldName of adminOptions?.listSearchableFields ?? []) {
      if (!fieldNames.has(fieldName)) {
        throw new Error(`Collection "${collectionName}" admin.listSearchableFields references unknown field "${fieldName}".`);
      }
      if (definition.upload && (fieldName === "filename" || fieldName === "mimeType")) continue;
      if (fields.find((field: FieldDefinition) => field.name === fieldName)?.type !== "text") {
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
