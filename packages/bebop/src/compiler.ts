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
    auth: config.collections.some((definition) => definition.auth),
    authCollection: config.collections.find((definition) => definition.auth)?.slug,
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
      const fieldNames = [
        ...(definition.auth ? ["name", "email", "emailVerified", "image", "role", "banned", "banReason", "banExpires", "createdAt", "updatedAt"] : []),
        ...storedFields.map((field) => field.name),
      ];
      const useAsTitle = definition.admin?.useAsTitle ?? (definition.auth ? "name" : fieldNames.includes("title") ? "title" : definition.upload ? "filename" : undefined);
      const titleFieldNames = useAsTitle === undefined ? [] : typeof useAsTitle === "string" ? [useAsTitle] : [...useAsTitle];
      const searchableTitleFields = titleFieldNames.filter((fieldName) =>
        fields.some((field) => field.name === fieldName && field.kind === "text"),
      );
      return {
        name,
        ...(definition.auth ? { auth: true as const } : {}),
        fields,
        access: definition.access,
        permissions: definition.permissions,
        writeMode: definition.writeMode ?? "direct",
        upload: definition.upload ? {
          mimeTypes: typeof definition.upload === "object" ? definition.upload.mimeTypes ?? [] : [],
          maxFileSize: config.upload?.limits?.fileSize ?? 20 * 1024 * 1024,
        } : undefined,
        admin: {
          labels: { singular: singularLabel, plural: pluralLabel },
          timestamps: definition.timestamps !== false,
          useAsTitle,
          defaultColumns: definition.admin?.defaultColumns ?? (definition.auth
            ? ["name", "email", "role", "createdAt"]
            : [
                ...titleFieldNames,
                ...fieldNames.filter((fieldName) => !titleFieldNames.includes(fieldName) && fieldName !== "id"),
              ].slice(0, 4)),
          listSearchableFields: definition.admin?.listSearchableFields ?? (definition.auth ? ["name", "email"] : searchableTitleFields),
        },
      };
    }),
  };
}

type NormalizedConfig = ReturnType<typeof normalizeConfig>;

function compileSchemaFromModel(model: NormalizedConfig): string {

  const tables = model.collections.filter((collection) => !collection.auth).map((collection) => {
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
          `${JSON.stringify(field.name)}: s.rel(${JSON.stringify(field.relationTo === model.authCollection ? "better_auth_user" : field.relationTo)}, ${JSON.stringify(columnName)})`,
        );
        continue;
      }

      columns.push(
        `${JSON.stringify(field.name)}: ${compileFieldType(field.definition as Exclude<FieldDefinition, { type: "relationship" | "upload" | "join" }>)}${field.required ? "" : ".optional()"}`,
      );
    }
    if (collection.upload) {
      // Keep upload bytes on the collection row so the collection's Jazz access
      // policy also governs the binary value.
      columns.push(`"data": s.bytes()`);
    }

    const relationObject = relations.length
      ? `{\n      ${relations.join(",\n      ")}\n    }`
      : "{}";

    const mainTable = `  ${JSON.stringify(collection.name)}: s.table(\n    {\n      ${columns.join(",\n      ")}\n    },\n    ${relationObject},\n  )`;
    return mainTable;
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
    const configuredFields = collection.fields.map((field) => field.kind === "join"
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
    const authFields = collection.auth ? [
      { name: "id", storageName: "id", label: "ID", kind: "text", required: true },
      { name: "name", storageName: "name", label: "Name", kind: "text", required: true },
      { name: "email", storageName: "email", label: "Email", kind: "text", required: true },
      { name: "emailVerified", storageName: "emailVerified", label: "Email verified", kind: "boolean", required: true },
      { name: "image", storageName: "image", label: "Image", kind: "text", required: false },
      { name: "role", storageName: "role", label: "Role", kind: "select", required: false, options: ["user", "admin"] },
      { name: "banned", storageName: "banned", label: "Banned", kind: "boolean", required: false },
      { name: "banReason", storageName: "banReason", label: "Ban reason", kind: "text", required: false },
      { name: "banExpires", storageName: "banExpires", label: "Ban expires", kind: "date", required: false },
      { name: "createdAt", storageName: "createdAt", label: "Created at", kind: "date", required: true },
      { name: "updatedAt", storageName: "updatedAt", label: "Updated at", kind: "date", required: true },
    ] : [];
    const fields = [...authFields, ...configuredFields];
    return [collection.name, {
      slug: collection.name,
      labels,
      fields,
      timestamps,
      ...(useAsTitle ? { useAsTitle } : {}),
      defaultColumns,
      listSearchableFields,
      writeMode: collection.writeMode,
      ...(collection.auth ? { auth: true as const } : {}),
      ...(collection.upload ? { upload: collection.upload } : {}),
    }] as const;
  });

  return `// Generated from bebop.config.ts. Do not edit this file.\nexport const bebopAdminManifest = ${JSON.stringify({ collections: Object.fromEntries(collections) }, null, 2)} as const;\n`;
}

function compileAccessCallbackRule(
  collectionName: string,
  accessOperation: string,
  jazzOperation: string,
  indent: string,
  includeAdminRead = false,
): string {
  const compiledRule = includeAdminRead
    ? `${indent}  return anyOf([session.where({ "claims.role": "admin" }), configuredRule]) as never;`
    : `${indent}  return configuredRule;`;
  return [
    `${indent}policy.${collectionName}.allow${jazzOperation}.where((row) => {`,
    `${indent}  const result = ${collectionName}Access.${accessOperation}!({ row, session, allOf, anyOf, exists, isCreator });`,
    `${indent}  const configuredRule = typeof result === "boolean" ? (result ? allOf([]) : anyOf([])) : result as never;`,
    compiledRule,
    `${indent}});`,
  ].join("\n");
}

function compileCollectionPermissionCallback(
  collectionName: string,
  collectionIndex: number,
  operation: "read" | "insert" | "update" | "delete",
  jazzOperation: "Read" | "Insert" | "Update" | "Delete",
): string {
  const permissionsName = `${collectionName}${operation[0]!.toUpperCase()}${operation.slice(1)}Permissions`;
  const callbackName = `${permissionsName}?.${operation}`;
  const jazzRule = `policy.${collectionName}.allow${jazzOperation}`;

  return [
    `  const ${permissionsName} = bebopConfig.collections[${collectionIndex}].permissions;`,
    `  if (${callbackName}) {`,
    `    ${callbackName}({`,
    `      rule: bebopRule(${jazzRule}, ${operation === "read"}),`,
    `      collections: bebopCollections,`,
    `      session, allOf, anyOf, allowedTo, isCreator,`,
    `    });`,
    `  } else {`,
    operation === "read"
      ? `    ${jazzRule}.where(session.where({ "claims.role": "admin" }));`
      : `    ${jazzRule}.never();`,
    `  }`,
  ].join("\n");
}

function compileCollectionPermissionHelpers(model: NormalizedConfig): string {
  const collectionNames = [
    ...model.collections.map((collection) => collection.name),
    ...(model.auth ? ["better_auth_user", "better_auth_session", "better_auth_account", "better_auth_verification", "better_auth_jwks"] : []),
  ];
  const collectionAliases = new Map(collectionNames.map((name) => [name, name]));
  if (model.authCollection) collectionAliases.set(model.authCollection, "better_auth_user");
  const collections = [...collectionAliases].map(([name, policyName]) =>
    `    ${JSON.stringify(name)}: { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.${policyName}.exists.where(input as never) } }`,
  ).join(",\n");
  return `\n  const bebopCollections = {\n${collections}\n  };\n` +
    `  const adminRead = session.where({ "claims.role": "admin" });\n` +
    `  const bebopRule = (builder: { where(input: never): unknown; always(): unknown; never(): unknown; whereOld?(input: never): unknown; whereNew?(input: never): unknown }, includeAdminRead = false) => ({\n` +
    `    where: (input: unknown) => {\n` +
    `      if (!includeAdminRead) return builder.where(input as never);\n` +
    `      const adminAwareRule = typeof input === "function"\n` +
    `        ? (row: never) => anyOf([adminRead, (input as (row: never) => never)(row)])\n` +
    `        : anyOf([adminRead, input as never]);\n` +
    `      return builder.where(adminAwareRule as never);\n` +
    `    },\n` +
    `    always: () => builder.always(),\n` +
    `    never: () => includeAdminRead ? builder.where(adminRead as never) : builder.never(),\n` +
    `    whereOld(input: unknown) { builder.whereOld?.(input as never); return this; },\n` +
    `    whereNew(input: unknown) { builder.whereNew?.(input as never); return this; },\n` +
    `  });\n`;
}

function compilePermissionsFromModel(
  model: NormalizedConfig,
  configModuleSpecifier = "./bebop.config.js",
  options: { blockCommandWrites?: boolean } = {},
): string {
  const operations = [
    ["read", "Read"],
    ["create", "Insert"],
    ["update", "Update"],
    ["delete", "Delete"],
  ] as const;
  const permissionOperations = [
    ["read", "Read"],
    ["insert", "Insert"],
    ["update", "Update"],
    ["delete", "Delete"],
  ] as const;
  const appCollections = model.collections.filter((collection) => !collection.auth);
  const hasCollectionPermissions = appCollections.some((collection) => collection.permissions !== undefined);
  const hasAccessCallbacks = appCollections.some((collection) => collection.access && collection.access !== "public" && collection.access !== "authenticated");
  const hasAuthenticatedAccess = appCollections.some((collection) => {
    if (collection.permissions !== undefined) return false;
    const access = collection.access;
    return access === undefined || access === "authenticated" || (
      typeof access === "object" && operations.some(([operation]) => access[operation] === undefined)
    );
  });
  const grants = model.collections
    .map((collection, index) => ({ collection, index }))
    .filter(({ collection }) => !collection.auth)
    .flatMap(({ collection, index }) => {
      const collectionName = collection.name;
      const access = collection.access;
      const permissions = collection.permissions;
      const blockedCommandWrites = options.blockCommandWrites && collection.writeMode === "command";
      if (permissions !== undefined) {
        const rules = permissionOperations.map(([operation, jazzOperation]) => {
          if (blockedCommandWrites && operation !== "read") {
            return `  policy.${collectionName}.allow${jazzOperation}.never();`;
          }
          return compileCollectionPermissionCallback(collectionName, index, operation, jazzOperation);
        });
        return rules;
      }

      if (blockedCommandWrites) {
        const accessBinding = access && access !== "public" && access !== "authenticated"
          ? [`  const ${collectionName}Access: Exclude<CollectionDefinition["access"], "public" | "authenticated"> = bebopConfig.collections[${index}].access;`]
          : [];
        const reads = access === "public"
          ? [`  policy.${collectionName}.allowRead.always();`]
          : access && access !== "authenticated" && access.read
              ? [compileAccessCallbackRule(collectionName, "read", "Read", "  ", true)]
              : [`  policy.${collectionName}.allowRead.where(authenticatedSession);`];
        return [
          ...accessBinding,
          ...reads,
          `  policy.${collectionName}.allowInsert.never();`,
          `  policy.${collectionName}.allowUpdate.never();`,
          `  policy.${collectionName}.allowDelete.never();`,
        ];
      }
      if (access === "public") {
        return operations.map(([, jazzOperation]) => `  policy.${collectionName}.allow${jazzOperation}.always();`);
      }
      if (access === "authenticated") {
        return operations.map(([, jazzOperation]) => `  policy.${collectionName}.allow${jazzOperation}.where(authenticatedSession);`);
      }
      if (!access) {
        return operations.map(([, jazzOperation]) => `  policy.${collectionName}.allow${jazzOperation}.where(authenticatedSession);`);
      }
      const rules: string[] = [`  const ${collectionName}Access: Exclude<CollectionDefinition["access"], "public" | "authenticated"> = bebopConfig.collections[${index}].access;`];
      for (const [accessOperation, jazzOperation] of operations) {
        if (access[accessOperation]) {
          rules.push(
            `  if (${collectionName}Access?.${accessOperation}) {\n` +
              `${compileAccessCallbackRule(collectionName, accessOperation, jazzOperation, "    ", accessOperation === "read")}\n` +
              `  }`,
          );
        } else {
          rules.push(`  policy.${collectionName}.allow${jazzOperation}.where(authenticatedSession);`);
        }
      }
      return rules;
    })
    .join("\n");

  const authImport = model.auth
    ? 'import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";\n'
    : "";
  const configImport = hasAccessCallbacks || hasCollectionPermissions
    ? `import bebopConfig from ${JSON.stringify(configModuleSpecifier)};\n${hasAccessCallbacks ? 'import type { CollectionDefinition } from "@bebopdev/core";\n' : ""}`
    : "";
  const existsHelper = hasAccessCallbacks
    ? (model.authCollection
        ? `\n  const authCollectionAlias = ${JSON.stringify({ [model.authCollection]: "better_auth_user" })};\n`
        : "\n") +
        `  const exists = (collectionName: string, condition: Record<string, unknown>) => {\n` +
        `    const tablePolicy = (policy as unknown as Record<string, { exists: { where(input: Record<string, unknown>): unknown } }>)[${model.authCollection ? `authCollectionAlias[collectionName as keyof typeof authCollectionAlias] ?? collectionName` : "collectionName"}];\n` +
        `    if (!tablePolicy) throw new Error(\`Unknown collection in access.exists(): \${collectionName}\`);\n` +
        `    return tablePolicy.exists.where(condition) as never;\n` +
        `  };\n`
    : "";
  const permissionContextNames = new Set<string>(["policy"]);
  if (hasAccessCallbacks || hasCollectionPermissions) for (const name of ["session", "allOf", "anyOf", "isCreator", "allowedTo"]) permissionContextNames.add(name);
  else if (hasAuthenticatedAccess) permissionContextNames.add("session");
  const permissionContext = [...permissionContextNames].join(", ");
  const authenticatedHelper = hasAuthenticatedAccess
    ? `\n  const authenticatedSession = session.where({ authMode: { in: ["external", "local-first"] } });\n`
    : "";
  const collectionPermissionHelpers = hasCollectionPermissions ? compileCollectionPermissionHelpers(model) : "";
  const appPermissions = `const appPermissions = s.definePermissions(app, ({ ${permissionContext} }) => {${existsHelper}${authenticatedHelper}${collectionPermissionHelpers}\n${grants}\n});`;

  return `// Generated from bebop.config.ts. Unspecified access defaults to authenticated sessions; omitted Jazz permission operations are denied.\nimport { schema as s } from "jazz-tools";\nimport { app } from "./bebop-generated-schema.js";\n${authImport}${configImport}\n${appPermissions}\n${model.auth ? "export default { ...betterAuthPermissions, ...appPermissions };" : "export default appPermissions;"}\n`;
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
  return compileCommandPermissionsFromModel(normalizeConfig(config), configModuleSpecifier);
}

function compileCommandPermissionsFromModel(model: NormalizedConfig, configModuleSpecifier: string): string {
  return "// Reference only. Do not deploy this policy or use it to authorize backend commands; use createBebopHandler.authorize.\n" +
    compilePermissionsFromModel(model, configModuleSpecifier);
}

export function compileArtifacts(config: BebopConfig, configModuleSpecifier = "./bebop.config.js") {
  const model = normalizeConfig(config);
  return {
    schema: compileSchemaFromModel(model),
    adminManifest: compileAdminManifestFromModel(model),
    permissions: compilePermissionsFromModel(model, configModuleSpecifier, { blockCommandWrites: true }),
    authorizationPermissions: compileCommandPermissionsFromModel(model, configModuleSpecifier),
    clientFactory: compileClientFactory(configModuleSpecifier),
    ...(model.auth ? { authGenerateConfig: compileBetterAuthGenerateConfig(configModuleSpecifier) } : {}),
  };
}

export function compileBetterAuthGenerateConfig(configModuleSpecifier = "./bebop.config.js"): string {
  return `// Generated from bebop.config.ts. Do not edit this file.\n` +
    `import { schema as s } from "jazz-tools";\n` +
    `import { createBebopBetterAuth } from "@bebopdev/core/server";\n` +
    `import bebopConfig from ${JSON.stringify(configModuleSpecifier)};\n\n` +
    `export const auth = createBebopBetterAuth({\n` +
    `  config: bebopConfig,\n` +
    `  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:5173",\n` +
    `  secret: process.env.BETTER_AUTH_SECRET ?? "bebop-schema-generation-placeholder-secret",\n` +
    `  jazz: {\n` +
    `    db: async () => { throw new Error("Better Auth schema generation cannot query the database."); },\n` +
    `    schema: s.defineApp({}).wasmSchema,\n` +
    `  },\n` +
    `});\n`;
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

  const authCollections = collections.filter((collection) => collection.auth === true);
  if (authCollections.length > 1) {
    throw new Error("Only one collection can set auth: true because a Better Auth instance has one user model.");
  }

  if (new Set(collectionNames).size !== collectionNames.length) {
    throw new Error("Collection slugs must be unique.");
  }

  for (const definition of collections) {
    const collectionName = definition.slug;
    if (definition.auth !== undefined && definition.auth !== true) {
      throw new Error(`Collection "${collectionName}" auth must be true when using Better Auth.`);
    }
    if (!namePattern.test(collectionName)) {
      throw new Error(`Invalid collection name "${collectionName}". Use letters, numbers, and underscores.`);
    }
    if (definition.upload !== undefined && definition.upload !== true && (typeof definition.upload !== "object" || definition.upload === null || (definition.upload.mimeTypes !== undefined && !Array.isArray(definition.upload.mimeTypes)))) {
      throw new Error(`Collection "${collectionName}" upload must be true or contain mimeTypes.`);
    }
    if (typeof definition.upload === "object") {
      for (const mimeType of definition.upload.mimeTypes ?? []) {
        if (!/^[\w.+-]+\/[\w.+*-]+$/.test(mimeType)) throw new Error(`Invalid MIME type "${mimeType}" in "${collectionName}".`);
      }
    }

    if (authCollections.length && collectionName.startsWith("better_auth_")) {
      throw new Error(
        `Collection name "${collectionName}" uses the reserved Better Auth table prefix "better_auth_".`,
      );
    }

    if (!Array.isArray(definition.fields) || (definition.fields.length === 0 && !definition.auth)) {
      throw new Error(`Collection "${collectionName}" must define at least one field unless it is the auth collection.`);
    }
    if (definition.auth && (definition.upload || definition.writeMode === "command" || definition.permissions !== undefined || definition.hooks !== undefined)) {
      throw new Error(`Auth collection "${collectionName}" is managed by Better Auth and cannot define upload, command writes, Jazz permissions, or lifecycle hooks.`);
    }
    if (definition.auth && (definition.access === "public" || definition.access === "authenticated")) {
      throw new Error(`Auth collection "${collectionName}" may use only access.admin; Better Auth manages the other access operations.`);
    }
    if (definition.auth && definition.access && definition.access !== "public" && definition.access !== "authenticated") {
      const unsupportedAuthAccess = ["read", "create", "update", "delete"] as const;
      const authAccess = definition.access;
      const operation = typeof authAccess === "object" && authAccess !== null
        ? unsupportedAuthAccess.find((name) => authAccess[name] !== undefined)
        : undefined;
      if (operation) {
        throw new Error(`Auth collection "${collectionName}" cannot define access.${operation}; Better Auth manages its data access. Use access.admin for admin panel entry.`);
      }
    }
    if (!definition.auth && definition.access && definition.access !== "public" && definition.access !== "authenticated" && definition.access.admin !== undefined) {
      throw new Error(`Collection "${collectionName}" can define access.admin only when it has auth: true.`);
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
    if (definition.access !== undefined && definition.permissions !== undefined) {
      throw new Error(`Collection "${collectionName}" cannot define both access and permissions; use permissions or keep the legacy access option.`);
    }
    if (definition.access && definition.access !== "public" && definition.access !== "authenticated") {
      for (const operation of ["read", "create", "update", "delete"] as const) {
        const rule = definition.access[operation];
        if (rule !== undefined && typeof rule !== "function") {
          throw new Error(`Collection "${collectionName}" access.${operation} must be a callback.`);
        }
      }
      if (definition.access.admin !== undefined && typeof definition.access.admin !== "function") {
        throw new Error(`Collection "${collectionName}" access.admin must be a callback.`);
      }
    }
    if (definition.permissions !== undefined && (typeof definition.permissions !== "object" || definition.permissions === null || Array.isArray(definition.permissions))) {
      throw new Error(`Collection "${collectionName}" permissions must be an operation callback object.`);
    }
    if (definition.permissions) {
      for (const operation of ["read", "insert", "update", "delete"] as const) {
        const rule = definition.permissions[operation];
        if (rule !== undefined && typeof rule !== "function") {
          throw new Error(`Collection "${collectionName}" permissions.${operation} must be a callback.`);
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

    const storedNames = new Set<string>(["id", ...(definition.upload ? ["filename", "mimeType", "filesize", "data"] : [])]);
    const fieldNames = new Set<string>([
      ...(definition.upload ? ["filename", "mimeType", "filesize"] : []),
      ...(definition.auth ? ["name", "email", "emailVerified", "image", "role", "banned", "banReason", "banExpires", "createdAt", "updatedAt"] : []),
    ]);
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
      if (field.type !== "join" && field.auth !== undefined && (!definition.auth || typeof field.auth !== "object" || field.auth === null || (field.auth.input !== undefined && typeof field.auth.input !== "boolean"))) {
        throw new Error(`Field "${collectionName}.${fieldName}" auth options are only supported on auth collections and auth.input must be a boolean.`);
      }

      if (definition.auth) {
        const reservedAuthFields = new Set([
          "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt",
          "role", "banned", "banReason", "banExpires",
        ]);
        if (reservedAuthFields.has(fieldName)) {
          throw new Error(`Field "${collectionName}.${fieldName}" is provided by Better Auth; define only custom user fields in the auth collection.`);
        }
        if (!["text", "number", "checkbox", "date", "json", "select"].includes(field.type)) {
          throw new Error(`Auth field "${collectionName}.${fieldName}" must be a scalar text, number, checkbox, date, json, or select field.`);
        }
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

      if (field.type === "relationship" && !collectionNames.includes(field.relationTo)) {
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
    const titleFieldNames = adminOptions?.useAsTitle === undefined
      ? []
      : typeof adminOptions.useAsTitle === "string" ? [adminOptions.useAsTitle] : adminOptions.useAsTitle;
    for (const fieldName of titleFieldNames) {
      if (!fieldNames.has(fieldName)) {
        throw new Error(`Collection "${collectionName}" admin.useAsTitle references unknown field "${fieldName}".`);
      }
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
      if (definition.auth && fieldName !== "name" && fieldName !== "email") {
        throw new Error(`Collection "${collectionName}" Better Auth list search supports only the "name" and "email" fields.`);
      }
      if (!fieldNames.has(fieldName)) {
        throw new Error(`Collection "${collectionName}" admin.listSearchableFields references unknown field "${fieldName}".`);
      }
      if (definition.upload && (fieldName === "filename" || fieldName === "mimeType")) continue;
      if (definition.auth && (fieldName === "name" || fieldName === "email")) continue;
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
