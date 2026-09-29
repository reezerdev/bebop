import type { Db, MutationErrorEvent, QueryBuilder, TableProxy, WriteHandle, WriteResult } from "jazz-tools";
import type {
  BebopConfig,
  CollectionChangeContext,
  CollectionDocument,
  CollectionHooks,
  Fields,
  StoredFields,
} from "./bebop.ts";
import { validateCollectionData } from "./validation.ts";

type RequiredStoredKeys<TFields extends Fields> = {
  [TName in keyof StoredFields<TFields>]-?: {} extends Pick<StoredFields<TFields>, TName> ? never : TName;
}[keyof StoredFields<TFields>];

export type CollectionCreateData<TFields extends Fields> = Pick<StoredFields<TFields>, RequiredStoredKeys<TFields>> &
  Partial<Omit<StoredFields<TFields>, RequiredStoredKeys<TFields>>>;
export type CollectionUpdateData<TFields extends Fields> = Partial<StoredFields<TFields>>;
export type BebopUploadMetadata = { filename: string; mimeType: string; filesize: number; fileId: string };
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

function localWrite(write: WriteHandle<unknown, unknown>, extraWrites: WriteHandle<unknown, unknown>[] = []) {
  return {
    durability: "local" as const,
    write,
    waitForGlobal: async () => { await Promise.all([...extraWrites, write].map((handle) => handle.wait({ tier: "global" }))); },
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
  where(input: Record<string, unknown>): BebopQuery;
};
type BebopAppWithUnion = { union(queries: Readonly<Record<string, BebopQuery>>): BebopQuery };
type AdminUploadDocument = { fileId?: string; mimeType?: string };

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
  const collections: Record<string, BebopCollectionClient<Fields> & { readFile(id: string): Promise<Blob | null> }> = {};

  for (const definition of config.collections) {
    if (definition.auth) continue;
    const collectionName = definition.slug;
    const table = (app as Record<string, unknown>)[collectionName] as BebopTable;
    if (!table) throw new Error(`Generated Bebop app is missing collection "${collectionName}".`);

    const hooks = definition.hooks as CollectionHooks<Fields> | undefined;
    const readLocalDocument = (id: string) => db.one(table.where({ id }));
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
    const uploadTable = definition.upload ? (app as Record<string, unknown>)[`bebop_files_${collectionName}`] as BebopTable | undefined : undefined;
    const partTable = definition.upload ? (app as Record<string, unknown>)[`bebop_file_parts_${collectionName}`] as BebopTable | undefined : undefined;
    if (definition.upload && !uploadTable) throw new Error(`Generated Bebop app is missing file table for "${collectionName}".`);
    if (definition.upload && !partTable) throw new Error(`Generated Bebop app is missing file parts table for "${collectionName}".`);
    const maxFileSize = config.upload?.limits?.fileSize ?? 20 * 1024 * 1024;
    const mimeTypes = typeof definition.upload === "object" ? definition.upload.mimeTypes ?? [] : [];
    const writableFields = new Set(definition.fields.flatMap((field) => field.type === "join"
      ? []
      : [field.type === "relationship" || field.type === "upload" ? `${field.name}Id` : field.name]));
    const storedFields = new Set(writableFields);
    if (definition.upload) for (const name of ["filename", "mimeType", "filesize", "fileId"]) storedFields.add(name);
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
    const searchableFields = definition.admin?.listSearchableFields ?? (
      definition.admin?.useAsTitle ? [definition.admin.useAsTitle]
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
        ? Object.fromEntries(fields.map((field, index) => ["field_" + index, table.where({ ...where, [field]: { contains: search } })]))
        : { all: table.where(where) };
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
    const readPartIds = async (fileId: string): Promise<string[]> => {
      if (!uploadTable) return [];
      const file = await db.one(uploadTable.select("partIds").where({ id: fileId })) as { partIds?: string[] } | null;
      return file?.partIds ?? [];
    };
    const discardStagedFile = (fileId: string, partIds: readonly string[]) => {
      if (partTable) for (const partId of partIds) db.delete(partTable, partId);
      if (uploadTable) db.delete(uploadTable, fileId);
    };
    const stageFile = async (file: Blob) => {
      if (!uploadTable || !partTable) throw new Error(`Missing file tables for ${collectionName}.`);
      const ownerAccount = db.getAuthState().session?.user.account;
      if (!ownerAccount) throw new Error("Sign in before uploading a file.");
      // alpha.57's insertStreaming can publish a local row and later reject its commit.
      // Consume the browser stream in bounded chunks using ordinary s.bytes() rows.
      const fileWrite = db.insert(uploadTable, { ownerAccount, partIds: [], partSizes: [] });
      const fileId = fileWrite.value.id;
      const partIds: string[] = [];
      const partSizes: number[] = [];
      const writes: WriteHandle<unknown, unknown>[] = [fileWrite];
      const reader = file.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let offset = 0; offset < value.byteLength; offset += 256 * 1024) {
            const bytes = new Uint8Array(value.subarray(offset, offset + 256 * 1024));
            const partWrite = db.insert(partTable, { ownerAccount, fileId, data: bytes });
            writes.push(partWrite);
            partIds.push(partWrite.value.id);
            partSizes.push(bytes.byteLength);
          }
        }
        writes.push(db.update(uploadTable, fileId, { partIds, partSizes }));
        return { id: fileId, partIds, writes };
      } catch (error) {
        await reader.cancel().catch(() => {});
        discardStagedFile(fileId, partIds);
        throw error;
      } finally {
        reader.releaseLock();
      }
    };
    const query: BebopCollectionClient<Fields>["query"] = (options = {}) => {
      let result = table.select("*", ...(options.includeTimestamps ? ["$createdAt", "$updatedAt"] : []));
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
        const { file, ...input } = data as Record<string, unknown>;
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
        const patch = await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        validateWriteData(document);
        await validateCollectionData(definition, document, "create");
        let staged: Awaited<ReturnType<typeof stageFile>> | undefined;
        let write: WriteHandle<unknown, unknown>;
        let doc: CollectionDocument<Fields>;
        if (definition.upload) {
          const { file: validatedFile, ...metadata } = mediaFile!;
          staged = await stageFile(validatedFile);
          try {
            write = await db.transaction((tx) => {
              const created = tx.insert(table, { ...document, ...metadata, fileId: staged!.id });
              tx.update(uploadTable!, staged!.id, { mediaId: created.id });
              return created;
            });
            doc = write.value as CollectionDocument<Fields>;
          } catch (error) {
            discardStagedFile(staged.id, staged.partIds);
            throw error;
          }
        } else {
          write = db.insert(table, document) as WriteResult<CollectionDocument<Fields>>;
          doc = write.value as CollectionDocument<Fields>;
        }
        try {
          await hooks?.afterChange?.({ operation: "create", doc });
        } catch (error) {
          throw new BebopHookError("afterChange", error, write);
        }
        return { doc, ...localWrite(write, staged?.writes) };
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
        const patch = await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        validateWriteData(document);
        await validateCollectionData(definition, document, "update", originalDoc!);
        let staged: Awaited<ReturnType<typeof stageFile>> | undefined;
        let write: WriteHandle<unknown, unknown>;
        let changes = document;
        if (file !== undefined) {
          const { file: validatedFile, ...metadata } = mediaFile!;
          staged = await stageFile(validatedFile);
          changes = { ...document, ...metadata, fileId: staged.id };
          const oldFileId = (originalDoc as AdminUploadDocument).fileId;
          const oldPartIds = oldFileId ? await readPartIds(oldFileId) : [];
          try {
            write = await db.transaction((tx) => {
              tx.update(table, id, changes);
              tx.update(uploadTable!, staged!.id, { mediaId: id });
              if (oldFileId) {
                for (const partId of oldPartIds) tx.delete(partTable!, partId);
                tx.delete(uploadTable!, oldFileId);
              }
              return { ...originalDoc, ...changes };
            });
          } catch (error) {
            discardStagedFile(staged.id, staged.partIds);
            throw error;
          }
        } else {
          write = db.update(table, id, document) as WriteHandle<unknown, unknown>;
        }
        const doc = { ...originalDoc, ...changes } as CollectionDocument<Fields>;
        try {
          await hooks?.afterChange?.({ operation: "update", doc, originalDoc: originalDoc! });
        } catch (error) {
          throw new BebopHookError("afterChange", error, write);
        }
        return { doc, ...localWrite(write, staged?.writes) };
      },

      async delete(id) {
        if (definition.writeMode === "command") {
          if (!commandTransport) throw new Error(`Collection "${collectionName}" uses writeMode "command" and requires a command transport.`);
          await commandTransport({ collection: collectionName, operation: "delete", id });
          return { id, durability: "global" as const, waitForGlobal: async () => {} };
        }
        const doc = await readLocalDocument(id) as CollectionDocument<Fields> | null ?? undefined;
        await hooks?.beforeDelete?.({ id, ...(doc ? { doc } : {}) });
        const oldFileId = (doc as AdminUploadDocument | undefined)?.fileId;
        const oldPartIds = oldFileId ? await readPartIds(oldFileId) : [];
        const write = definition.upload && oldFileId && uploadTable
          ? await db.transaction((tx) => {
            for (const partId of oldPartIds) tx.delete(partTable!, partId);
            tx.delete(uploadTable, oldFileId);
            tx.delete(table, id);
          })
          : db.delete(table, id) as WriteHandle<unknown, unknown>;
        try {
          await hooks?.afterDelete?.({ id, ...(doc ? { doc } : {}) });
        } catch (error) {
          throw new BebopHookError("afterDelete", error, write);
        }
        return { id, ...(doc ? { doc } : {}), ...localWrite(write) };
      },
      async readFile(id: string) {
        if (!uploadTable || !partTable) throw new Error(`${collectionName} is not upload-enabled.`);
        const media = await readLocalDocument(id) as AdminUploadDocument | null;
        if (!media?.fileId) return null;
        const partIds = await readPartIds(media.fileId);
        const chunks: BlobPart[] = [];
        for (const partId of partIds) {
          const part = await db.one(partTable.select("data").where({ id: partId })) as { data?: Uint8Array } | null;
          if (!(part?.data instanceof Uint8Array)) throw new Error(`Missing file part "${partId}".`);
          chunks.push(Uint8Array.from(part.data));
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
