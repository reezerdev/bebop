import type { Db, MutationErrorEvent, QueryBuilder, TableProxy, WriteHandle, WriteResult } from "jazz-tools";
import type {
  BebopConfig,
  CollectionChangeContext,
  CollectionDocument,
  CollectionHooks,
  Fields,
  StoredFields,
} from "./bebop.ts";
import { runMaybeLoggedHook, type HookLogEvent } from "./hook-logging.ts";
import { applyFieldDefaults, validateCollectionData } from "./validation.ts";

function logClientHookEvent(event: HookLogEvent): void {
  const { err, ...fields } = event;
  if (event.outcome === "error") console.error("[bebop] Hook failed", fields, err);
  else if (event.outcome === "skipped") console.info("[bebop] Hook skipped (no callback configured)", fields);
  else console.info("[bebop] Hook completed", fields);
}

type RequiredCreateKey<TField> = TField extends { required: true }
  ? TField extends { default: unknown }
    ? never
    : TField extends { type: "join" }
      ? never
      : TField extends { type: "relationship" | "upload"; name: infer TName extends string }
        ? `${TName}Id`
        : TField extends { name: infer TName extends string }
          ? TName
          : never
  : never;
type RequiredStoredKeys<TFields extends Fields> = RequiredCreateKey<TFields[number]>;

export type CollectionCreateData<TFields extends Fields> = Pick<StoredFields<TFields>, RequiredStoredKeys<TFields>> &
  Partial<Omit<StoredFields<TFields>, RequiredStoredKeys<TFields>>>;
export type CollectionUpdateData<TFields extends Fields> = Partial<StoredFields<TFields>>;
export type BebopUploadMetadata = { filename: string; mimeType: string; filesize: number };
export type BebopClientDocument<TFields extends Fields, TUpload extends boolean> = CollectionDocument<TFields> & (TUpload extends true ? BebopUploadMetadata : object);

type QueryValue<T> = Exclude<T, undefined> | (undefined extends T ? null : never);
type QueryPredicate<T> = QueryValue<T> | ({
  eq?: QueryValue<T>;
  ne?: QueryValue<T>;
  in?: Exclude<QueryValue<T>, null>[];
  notIn?: Exclude<QueryValue<T>, null>[];
} & (NonNullable<QueryValue<T>> extends string ? { contains?: string } : {})
  & (NonNullable<QueryValue<T>> extends number | Date ? {
    gt?: NonNullable<QueryValue<T>>;
    gte?: NonNullable<QueryValue<T>>;
    lt?: NonNullable<QueryValue<T>>;
    lte?: NonNullable<QueryValue<T>>;
  } : {}));

export type BebopQueryOptions<TFields extends Fields> = {
  where?: { [TName in keyof StoredFields<TFields>]?: QueryPredicate<StoredFields<TFields>[TName]> } & {
    id?: QueryPredicate<string>;
  };
  orderBy?: { field: keyof StoredFields<TFields> | "id" | "$createdAt" | "$updatedAt"; direction?: "asc" | "desc" };
  limit?: number;
  offset?: number;
  includeTimestamps?: boolean;
};

export type BebopSearchOptions<TFields extends Fields> = {
  search: string;
  fields: readonly Extract<keyof StoredFields<TFields>, string>[];
  where?: BebopQueryOptions<TFields>["where"];
  orderBy?: BebopQueryOptions<TFields>["orderBy"];
  limit?: number;
  offset?: number;
};

type BebopLocalWrite = {
  durability: "local";
  write: WriteHandle<unknown, unknown>;
  waitForGlobal: () => Promise<void>;
};
type BebopConfirmedWrite = {
  /** Command writes are returned only after Jazz confirms them globally. */
  durability: "global";
  waitForGlobal: () => Promise<void>;
};

export type BebopMutationResult<TDocument> = {
  doc: TDocument;
} & (BebopLocalWrite | BebopConfirmedWrite);

export type BebopDeleteResult<TDocument> = {
  id: string;
  doc?: TDocument;
} & (BebopLocalWrite | BebopConfirmedWrite);

export type BebopCommandRequest = {
  collection: string;
  operation: "create" | "update" | "delete";
  id?: string;
  data?: Readonly<Record<string, unknown>>;
};

export type BebopCommandTransport = (request: BebopCommandRequest) => Promise<{
  doc?: Readonly<Record<string, unknown>>;
}>;

export class BebopCommandError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Readonly<Record<string, string>>,
    readonly status?: number,
    readonly writeAccepted = false,
  ) {
    super(message);
    this.name = "BebopCommandError";
  }
}

export function createBebopFetchTransport(options: { basePath?: string; fetch?: typeof fetch } = {}): BebopCommandTransport {
  const basePath = (options.basePath ?? "/api/bebop").replace(/\/$/, "");
  const fetcher = options.fetch ?? globalThis.fetch;
  return async ({ collection, operation, id, data }) => {
    const path = `${basePath}/collections/${encodeURIComponent(collection)}${id ? `/${encodeURIComponent(id)}` : ""}`;
    const response = await fetcher(path, {
      method: operation === "create" ? "POST" : operation === "update" ? "PATCH" : "DELETE",
      credentials: "same-origin",
      headers: data ? { "content-type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
    const payload = await response.json().catch(() => ({})) as { message?: unknown; fieldErrors?: unknown; doc?: Record<string, unknown>; writeAccepted?: unknown };
    if (!response.ok) {
      const fieldErrors = payload.fieldErrors && typeof payload.fieldErrors === "object"
        ? payload.fieldErrors as Record<string, string>
        : undefined;
      throw new BebopCommandError(
        typeof payload.message === "string" ? payload.message : `Bebop command failed (${response.status}).`,
        fieldErrors,
        response.status,
        payload.writeAccepted === true,
      );
    }
    return { ...(payload.doc ? { doc: payload.doc } : {}) };
  };
}

export type BebopCollectionClient<TFields extends Fields, TUpload extends boolean = false> = {
  query(options?: BebopQueryOptions<TFields>): QueryBuilder<BebopClientDocument<TFields, TUpload>>;
  queryIds(options?: Pick<BebopQueryOptions<TFields>, "where">): QueryBuilder<{ id: string }>;
  search(options: BebopSearchOptions<TFields>): QueryBuilder<BebopClientDocument<TFields, TUpload>>;
  searchIds(options: Pick<BebopSearchOptions<TFields>, "search" | "fields" | "where">): readonly QueryBuilder<{ id: string }>[];
  find(options?: BebopQueryOptions<TFields>): Promise<BebopClientDocument<TFields, TUpload>[]>;
  findById(id: string): Promise<BebopClientDocument<TFields, TUpload> | null>;
  create(data: CollectionCreateData<TFields> & (TUpload extends true ? { file: Blob } : object)): Promise<BebopMutationResult<BebopClientDocument<TFields, TUpload>>>;
  update(id: string, data: CollectionUpdateData<TFields> & (TUpload extends true ? { file?: Blob } : object)): Promise<BebopMutationResult<BebopClientDocument<TFields, TUpload>>>;
  delete(id: string): Promise<BebopDeleteResult<BebopClientDocument<TFields, TUpload>>>;
} & (TUpload extends true ? { readFile(id: string): Promise<Blob | null> } : object);

export type BebopClient<TConfig extends BebopConfig> = {
  [TCollection in TConfig["collections"][number] as TCollection extends { auth: true } ? never : TCollection["slug"]]: BebopCollectionClient<TCollection["fields"], TCollection extends { upload: true | object } ? true : false>;
} & {
  onMutationError(listener: (event: MutationErrorEvent) => void): () => void;
};

export class BebopHookError extends Error {
  readonly localWriteApplied = true;

  constructor(readonly hook: "afterChange" | "afterDelete", cause: unknown, readonly write: WriteHandle<unknown, unknown>) {
    super(`The ${hook} hook failed after the local Jazz write was applied.`, { cause });
    this.name = "BebopHookError";
  }
}

function localWrite(write: WriteHandle<unknown, unknown>) {
  return {
    durability: "local" as const,
    write,
    waitForGlobal: async () => { await write.wait({ tier: "global" }); },
  };
}

export class BebopDocumentNotFoundError extends Error {
  constructor(readonly collection: string, readonly id: string) {
    super(`Could not find ${collection} document "${id}" in the local database.`);
    this.name = "BebopDocumentNotFoundError";
  }
}

type BebopQuery = QueryBuilder<Record<string, unknown> & { id: string }> & {
  where(input: Record<string, unknown>): BebopQuery;
  orderBy(field: string, direction?: "asc" | "desc"): BebopQuery;
  limit(value: number): BebopQuery;
  offset(value: number): BebopQuery;
};

type BebopTable = TableProxy<Record<string, unknown> & { id: string }, Record<string, unknown>> & {
  select(...fields: string[]): BebopQuery;
  select(selection: Record<string, { from: number; to: number }>): BebopQuery;
  where(input: Record<string, unknown>): BebopQuery;
};
type StreamingBebopTable = TableProxy<
  Record<string, unknown> & { id: string },
  Record<string, unknown>,
  Record<string, unknown> & { data: ReadableStream<Uint8Array> },
  Record<string, unknown> & { data: ReadableStream<Uint8Array> }
>;
type BebopAppWithUnion = { union(queries: Readonly<Record<string, BebopQuery>>): BebopQuery };
type AdminUploadDocument = { filesize?: number; mimeType?: string };

function nonnegativeInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  return value;
}

export function createBebopClient<const TConfig extends BebopConfig>(options: {
  app: object;
  config: TConfig;
  db: Db;
  commandTransport?: BebopCommandTransport;
}): BebopClient<TConfig> {
  const { app, config, db, commandTransport } = options;
  const logHooks = config.logging?.hooks === true;
  const collections: Record<string, BebopCollectionClient<Fields> & { readFile(id: string): Promise<Blob | null> }> = {};

  for (const definition of config.collections) {
    if (definition.auth) continue;
    const collectionName = definition.slug;
    const table = (app as Record<string, unknown>)[collectionName] as BebopTable;
    if (!table) throw new Error(`Generated Bebop app is missing collection "${collectionName}".`);

    const hooks = definition.hooks as CollectionHooks<Fields> | undefined;
    const decodeCommandDocument = (value: Readonly<Record<string, unknown>>) => {
      const document = { ...value };
      for (const field of definition.fields) {
        if (field.type === "date" && typeof document[field.name] === "string") {
          document[field.name] = new Date(document[field.name] as string);
        }
      }
      for (const name of ["$createdAt", "$updatedAt"]) {
        if (typeof document[name] === "string") document[name] = new Date(document[name] as string);
      }
      return document as CollectionDocument<Fields>;
    };
    const maxFileSize = config.upload?.limits?.fileSize ?? 20 * 1024 * 1024;
    const mimeTypes = typeof definition.upload === "object" ? definition.upload.mimeTypes ?? [] : [];
    const writableFields = new Set(definition.fields.flatMap((field) => field.type === "join"
      ? []
      : [field.type === "relationship" || field.type === "upload" ? `${field.name}Id` : field.name]));
    const storedFields = new Set(writableFields);
    if (definition.upload) for (const name of ["filename", "mimeType", "filesize"]) storedFields.add(name);
    const selectedCollectionFields = [
      "id",
      ...storedFields,
    ];
    const selectCollection = (includeTimestamps = false) => definition.upload
      ? table.select(...selectedCollectionFields, ...(includeTimestamps ? ["$createdAt", "$updatedAt"] : []))
      : table.select("*", ...(includeTimestamps ? ["$createdAt", "$updatedAt"] : []));
    const readLocalDocument = (id: string) => definition.upload
      ? db.one(selectCollection().where({ id }))
      : db.one(table.where({ id }));
    const validateWriteData = (data: Record<string, unknown>) => {
      for (const name of Object.keys(data)) {
        if (!writableFields.has(name)) throw new Error(`Unknown ${collectionName} write field "${name}".`);
      }
      return data;
    };
    const validatedWhere = (where: Record<string, unknown> | undefined) => {
      if (!where) return undefined;
      for (const name of Object.keys(where)) {
        if (name !== "id" && !storedFields.has(name)) throw new Error(`Unknown ${collectionName} query field "${name}".`);
      }
      return where;
    };
    const configuredTitleFields = definition.admin?.useAsTitle === undefined
      ? []
      : typeof definition.admin.useAsTitle === "string" ? [definition.admin.useAsTitle] : definition.admin.useAsTitle;
    const searchableFields = definition.admin?.listSearchableFields ?? (
      configuredTitleFields.length ? configuredTitleFields.filter((name) => definition.fields.some((field) => field.name === name && field.type === "text"))
        : definition.fields.some((field) => field.type !== "join" && field.name === "title") ? ["title"]
          : []
    );
    const validateSearchFields = (fields: readonly string[]) => {
      if (!fields.length) throw new Error(collectionName + " has no configured listSearchableFields.");
      for (const name of fields) {
        const field = definition.fields.find((candidate) => candidate.name === name);
        const generatedTextField = definition.upload && (name === "filename" || name === "mimeType");
        if (!searchableFields.includes(name) || (field?.type !== "text" && !generatedTextField)) {
          throw new Error("Unknown " + collectionName + " searchable text field \"" + name + "\".");
        }
      }
    };
    const orderQuery = (result: BebopQuery, orderBy: BebopQueryOptions<Fields>["orderBy"]) => {
      if (!orderBy) return result;
      const field = String(orderBy.field);
      if (field !== "id" && field !== "$createdAt" && field !== "$updatedAt" && !storedFields.has(field)) {
        throw new Error("Unknown " + collectionName + " sort field \"" + field + "\".");
      }
      return result.orderBy(field, orderBy.direction);
    };
    const searchIds = (options: Pick<BebopSearchOptions<Fields>, "search" | "fields" | "where">) => {
      const search = options.search.trim();
      const fields = [...new Set(options.fields.map(String))];
      validateSearchFields(fields);
      const where = validatedWhere(options.where as Record<string, unknown> | undefined) ?? {};
      if (!search) return [table.select("id").where(where) as QueryBuilder<{ id: string }>];
      return fields.map((field) => table.select("id").where({ ...where, [field]: { contains: search } }) as QueryBuilder<{ id: string }>);
    };
    const searchPage = (options: BebopSearchOptions<Fields>) => {
      const search = options.search.trim();
      const fields = [...new Set(options.fields.map(String))];
      validateSearchFields(fields);
      const where = validatedWhere(options.where as Record<string, unknown> | undefined) ?? {};
      const queries = search
        ? Object.fromEntries(fields.map((field, index) => [
          "field_" + index,
          (definition.upload ? selectCollection() : table).where({ ...where, [field]: { contains: search } }),
        ]))
        : { all: (definition.upload ? selectCollection() : table).where(where) };
      let result = (app as unknown as BebopAppWithUnion).union(queries);
      result = orderQuery(result, options.orderBy as BebopQueryOptions<Fields>["orderBy"]);
      const limit = nonnegativeInteger(options.limit, "limit");
      const offset = nonnegativeInteger(options.offset, "offset");
      if (limit !== undefined) result = result.limit(limit);
      if (offset !== undefined) result = result.offset(offset);
      return result as QueryBuilder<CollectionDocument<Fields>>;
    };
    const validateFile = (file: unknown) => {
      if (!(file instanceof Blob)) throw new TypeError(`${collectionName} requires a file.`);
      if (file.size > maxFileSize) throw new RangeError(`File exceeds the ${maxFileSize} byte upload limit.`);
      const mimeType = file.type || "application/octet-stream";
      if (mimeTypes.length && !mimeTypes.some((allowed) => allowed === mimeType || allowed.endsWith("/*") && mimeType.startsWith(allowed.slice(0, -1)))) {
        throw new Error(`File type "${mimeType}" is not allowed for ${collectionName}.`);
      }
      const filename = "name" in file && typeof file.name === "string" && file.name.trim() ? file.name : "upload";
      return { file, filename, mimeType, filesize: file.size };
    };
    const query: BebopCollectionClient<Fields>["query"] = (options = {}) => {
      let result = selectCollection(options.includeTimestamps);
      const where = validatedWhere(options.where as Record<string, unknown> | undefined);
      if (where) result = result.where(where);
      if (options.orderBy) {
        const field = String(options.orderBy.field);
        if (field !== "id" && field !== "$createdAt" && field !== "$updatedAt" && !storedFields.has(field)) {
          throw new Error(`Unknown ${collectionName} sort field "${field}".`);
        }
        result = result.orderBy(field, options.orderBy.direction);
      }
      const limit = nonnegativeInteger(options.limit, "limit");
      const offset = nonnegativeInteger(options.offset, "offset");
      if (limit !== undefined) result = result.limit(limit);
      if (offset !== undefined) result = result.offset(offset);
      return result as QueryBuilder<CollectionDocument<Fields>>;
    };

    collections[collectionName] = {
      query,
      search: searchPage,
      searchIds,
      queryIds: (options = {}) => {
        let result = table.select("id");
        const where = validatedWhere(options.where as Record<string, unknown> | undefined);
        if (where) result = result.where(where);
        return result as QueryBuilder<{ id: string }>;
      },
      find: (options) => db.all(query(options)),
      findById: (id) => readLocalDocument(id) as Promise<CollectionDocument<Fields> | null>,
      async create(data) {
        const { file, ...rawInput } = data as Record<string, unknown>;
        const input = applyFieldDefaults(definition, rawInput);
        validateWriteData(input);
        if (!definition.upload && file !== undefined) throw new Error(`Unknown ${collectionName} write field "file".`);
        const mediaFile = definition.upload ? validateFile(file) : undefined;
        await validateCollectionData(definition, input, "create");
        if (definition.writeMode === "command") {
          if (!commandTransport) throw new Error(`Collection "${collectionName}" uses writeMode "command" and requires a command transport.`);
          const response = await commandTransport({ collection: collectionName, operation: "create", data: input });
          if (!response.doc || typeof response.doc.id !== "string") throw new Error(`Command handler did not return the created ${collectionName} document.`);
          return { doc: decodeCommandDocument(response.doc), durability: "global" as const, waitForGlobal: async () => {} };
        }
        const context: CollectionChangeContext<Fields> = {
          operation: "create",
          data: { ...input } as Partial<StoredFields<Fields>>,
        };
        const patch = logHooks
          ? await runMaybeLoggedHook(
              { collection: collectionName, hook: "beforeChange", operation: "create" },
              hooks?.beforeChange ? () => hooks.beforeChange!(context) : undefined,
              logClientHookEvent,
            )
          : await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        validateWriteData(document);
        await validateCollectionData(definition, document, "create");
        let write: WriteHandle<unknown, unknown>;
        let doc: CollectionDocument<Fields>;
        if (definition.upload) {
          const { file: validatedFile, ...metadata } = mediaFile!;
          const streamingTable = table as unknown as StreamingBebopTable;
          write = await db.insertStreaming(streamingTable, {
            ...document,
            ...metadata,
            data: validatedFile.stream(),
          }) as WriteHandle<unknown, unknown>;
          const created = await readLocalDocument((write.value as { id: string }).id) as CollectionDocument<Fields> | null;
          if (!created) throw new Error(`Jazz did not return the newly uploaded ${collectionName} document.`);
          doc = created;
        } else {
          write = db.insert(table, document) as WriteResult<CollectionDocument<Fields>>;
          doc = write.value as CollectionDocument<Fields>;
        }
        try {
          const hookContext = { operation: "create" as const, doc };
          if (logHooks) {
            await runMaybeLoggedHook(
              { collection: collectionName, hook: "afterChange", operation: "create", id: doc.id },
              hooks?.afterChange ? () => hooks.afterChange!(hookContext) : undefined,
              logClientHookEvent,
            );
          } else {
            await hooks?.afterChange?.(hookContext);
          }
        } catch (error) {
          throw new BebopHookError("afterChange", error, write);
        }
        return { doc, ...localWrite(write) };
      },

      async update(id, data) {
        const { file, ...input } = data as Record<string, unknown>;
        validateWriteData(input);
        if (!definition.upload && file !== undefined) throw new Error(`Unknown ${collectionName} write field "file".`);
        const mediaFile = file !== undefined ? validateFile(file) : undefined;
        const originalDoc = await readLocalDocument(id) as CollectionDocument<Fields> | null;
        if (definition.writeMode !== "command" && !originalDoc) throw new BebopDocumentNotFoundError(collectionName, id);
        await validateCollectionData(definition, input, "update", originalDoc ?? undefined);
        if (definition.writeMode === "command") {
          if (!commandTransport) throw new Error(`Collection "${collectionName}" uses writeMode "command" and requires a command transport.`);
          const response = await commandTransport({ collection: collectionName, operation: "update", id, data: input });
          if (!response.doc || typeof response.doc.id !== "string") throw new Error(`Command handler did not return the updated ${collectionName} document.`);
          return { doc: decodeCommandDocument(response.doc), durability: "global" as const, waitForGlobal: async () => {} };
        }
        const context: CollectionChangeContext<Fields> = {
          operation: "update",
          id,
          data: { ...input } as Partial<StoredFields<Fields>>,
          originalDoc: originalDoc!,
        };
        const patch = logHooks
          ? await runMaybeLoggedHook(
              { collection: collectionName, hook: "beforeChange", operation: "update", id },
              hooks?.beforeChange ? () => hooks.beforeChange!(context) : undefined,
              logClientHookEvent,
            )
          : await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        validateWriteData(document);
        await validateCollectionData(definition, document, "update", originalDoc!);
        let write: WriteHandle<unknown, unknown>;
        let changes = document;
        if (file !== undefined) {
          const { file: validatedFile, ...metadata } = mediaFile!;
          changes = { ...document, ...metadata };
          const streamingTable = table as unknown as StreamingBebopTable;
          write = await db.updateStreaming(streamingTable, id, {
            ...changes,
            data: validatedFile.stream(),
          }) as WriteHandle<unknown, unknown>;
        } else {
          write = db.update(table, id, document) as WriteHandle<unknown, unknown>;
        }
        const doc = { ...originalDoc, ...changes } as CollectionDocument<Fields>;
        try {
          const hookContext = { operation: "update" as const, doc, originalDoc: originalDoc! };
          if (logHooks) {
            await runMaybeLoggedHook(
              { collection: collectionName, hook: "afterChange", operation: "update", id },
              hooks?.afterChange ? () => hooks.afterChange!(hookContext) : undefined,
              logClientHookEvent,
            );
          } else {
            await hooks?.afterChange?.(hookContext);
          }
        } catch (error) {
          throw new BebopHookError("afterChange", error, write);
        }
        return { doc, ...localWrite(write) };
      },

      async delete(id) {
        if (definition.writeMode === "command") {
          if (!commandTransport) throw new Error(`Collection "${collectionName}" uses writeMode "command" and requires a command transport.`);
          await commandTransport({ collection: collectionName, operation: "delete", id });
          return { id, durability: "global" as const, waitForGlobal: async () => {} };
        }
        const doc = await readLocalDocument(id) as CollectionDocument<Fields> | null ?? undefined;
        const beforeDeleteContext = { id, ...(doc ? { doc } : {}) };
        if (logHooks) {
          await runMaybeLoggedHook(
            { collection: collectionName, hook: "beforeDelete", operation: "delete", id },
            hooks?.beforeDelete ? () => hooks.beforeDelete!(beforeDeleteContext) : undefined,
            logClientHookEvent,
          );
        } else {
          await hooks?.beforeDelete?.(beforeDeleteContext);
        }
        const write = db.delete(table, id) as WriteHandle<unknown, unknown>;
        try {
          const afterDeleteContext = { id, ...(doc ? { doc } : {}) };
          if (logHooks) {
            await runMaybeLoggedHook(
              { collection: collectionName, hook: "afterDelete", operation: "delete", id },
              hooks?.afterDelete ? () => hooks.afterDelete!(afterDeleteContext) : undefined,
              logClientHookEvent,
            );
          } else {
            await hooks?.afterDelete?.(afterDeleteContext);
          }
        } catch (error) {
          throw new BebopHookError("afterDelete", error, write);
        }
        return { id, ...(doc ? { doc } : {}), ...localWrite(write) };
      },
      async readFile(id: string) {
        if (!definition.upload) throw new Error(`${collectionName} is not upload-enabled.`);
        const media = await readLocalDocument(id) as AdminUploadDocument | null;
        if (!media || typeof media.filesize !== "number") return null;
        const chunks: BlobPart[] = [];
        const pageSize = 1024 * 1024;
        for (let from = 0; from < media.filesize; from += pageSize) {
          const to = Math.min(from + pageSize, media.filesize);
          const page = await db.one(table.select({ data: { from, to } }).where({ id })) as { data?: unknown } | null;
          if (!(page?.data instanceof Uint8Array) || page.data.byteLength !== to - from) {
            throw new Error(`Jazz returned an incomplete bytes page for ${collectionName} document "${id}".`);
          }
          chunks.push(Uint8Array.from(page.data));
        }
        return new Blob(chunks, { type: media.mimeType ?? "application/octet-stream" });
      },
    };
  }

  return {
    ...collections,
    onMutationError: (listener) => db.onMutationError(listener),
  } as BebopClient<TConfig>;
}
