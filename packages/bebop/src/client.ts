import type { Db, MutationErrorEvent, QueryBuilder, TableProxy, WriteHandle, WriteResult } from "jazz-tools";
import type {
  BebopConfig,
  CollectionChangeContext,
  CollectionDocument,
  CollectionHooks,
  Fields,
  StoredFields,
} from "./bebop.ts";

type RequiredStoredKeys<TFields extends Fields> = {
  [TName in keyof StoredFields<TFields>]-?: {} extends Pick<StoredFields<TFields>, TName> ? never : TName;
}[keyof StoredFields<TFields>];

export type CollectionCreateData<TFields extends Fields> = Pick<StoredFields<TFields>, RequiredStoredKeys<TFields>> &
  Partial<Omit<StoredFields<TFields>, RequiredStoredKeys<TFields>>>;
export type CollectionUpdateData<TFields extends Fields> = Partial<StoredFields<TFields>>;

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

export type BebopMutationResult<TDocument> = {
  doc: TDocument;
  /** The mutation has been applied locally; call waitForGlobal for server confirmation. */
  durability: "local";
  write: WriteHandle<unknown, unknown>;
  waitForGlobal: () => Promise<void>;
};

export type BebopDeleteResult<TDocument> = {
  id: string;
  doc?: TDocument;
  durability: "local";
  write: WriteHandle<unknown, unknown>;
  waitForGlobal: () => Promise<void>;
};

export type BebopCollectionClient<TFields extends Fields> = {
  query(options?: BebopQueryOptions<TFields>): QueryBuilder<CollectionDocument<TFields>>;
  queryIds(options?: Pick<BebopQueryOptions<TFields>, "where">): QueryBuilder<{ id: string }>;
  find(options?: BebopQueryOptions<TFields>): Promise<CollectionDocument<TFields>[]>;
  findById(id: string): Promise<CollectionDocument<TFields> | null>;
  create(data: CollectionCreateData<TFields>): Promise<BebopMutationResult<CollectionDocument<TFields>>>;
  update(id: string, data: CollectionUpdateData<TFields>): Promise<BebopMutationResult<CollectionDocument<TFields>>>;
  delete(id: string): Promise<BebopDeleteResult<CollectionDocument<TFields>>>;
};

export type BebopClient<TConfig extends BebopConfig> = {
  [TCollection in TConfig["collections"][number] as TCollection["slug"]]: BebopCollectionClient<TCollection["fields"]>;
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
  where(input: Record<string, unknown>): BebopQuery;
};

function nonnegativeInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  return value;
}

export function createBebopClient<const TConfig extends BebopConfig>(options: {
  app: Record<TConfig["collections"][number]["slug"], object>;
  config: TConfig;
  db: Db;
}): BebopClient<TConfig> {
  const { app, config, db } = options;
  const collections: Record<string, BebopCollectionClient<Fields>> = {};

  for (const definition of config.collections) {
    const collectionName = definition.slug;
    const table = app[collectionName as TConfig["collections"][number]["slug"]] as BebopTable;
    if (!table) throw new Error(`Generated Bebop app is missing collection "${collectionName}".`);

    const hooks = definition.hooks as CollectionHooks<Fields> | undefined;
    const readLocalDocument = (id: string) => db.one(table.where({ id }));
    const storedFields = new Set(definition.fields.flatMap((field) => field.type === "join"
      ? []
      : [field.type === "relationship" ? `${field.name}Id` : field.name]));
    const validateWriteData = (data: Record<string, unknown>) => {
      for (const name of Object.keys(data)) {
        if (!storedFields.has(name)) throw new Error(`Unknown ${collectionName} write field "${name}".`);
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
      queryIds: (options = {}) => {
        let result = table.select("id");
        const where = validatedWhere(options.where as Record<string, unknown> | undefined);
        if (where) result = result.where(where);
        return result as QueryBuilder<{ id: string }>;
      },
      find: (options) => db.all(query(options)),
      findById: (id) => readLocalDocument(id) as Promise<CollectionDocument<Fields> | null>,
      async create(data) {
        validateWriteData(data as Record<string, unknown>);
        const context: CollectionChangeContext<Fields> = {
          operation: "create",
          data: { ...data } as Partial<StoredFields<Fields>>,
        };
        const patch = await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        validateWriteData(document);
        const write = db.insert(table, document) as WriteResult<CollectionDocument<Fields>> & WriteHandle<unknown, unknown>;
        const doc = write.value;
        try {
          await hooks?.afterChange?.({ operation: "create", doc });
        } catch (error) {
          throw new BebopHookError("afterChange", error, write);
        }
        return { doc, ...localWrite(write) };
      },

      async update(id, data) {
        validateWriteData(data as Record<string, unknown>);
        const originalDoc = await readLocalDocument(id) as CollectionDocument<Fields> | null;
        if (!originalDoc) throw new BebopDocumentNotFoundError(collectionName, id);
        const context: CollectionChangeContext<Fields> = {
          operation: "update",
          id,
          data: { ...data } as Partial<StoredFields<Fields>>,
          originalDoc,
        };
        const patch = await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        validateWriteData(document);
        const write = db.update(table, id, document) as WriteHandle<unknown, unknown>;
        const doc = { ...originalDoc, ...document } as CollectionDocument<Fields>;
        try {
          await hooks?.afterChange?.({ operation: "update", doc, originalDoc });
        } catch (error) {
          throw new BebopHookError("afterChange", error, write);
        }
        return { doc, ...localWrite(write) };
      },

      async delete(id) {
        const doc = await readLocalDocument(id) as CollectionDocument<Fields> | null ?? undefined;
        await hooks?.beforeDelete?.({ id, ...(doc ? { doc } : {}) });
        const write = db.delete(table, id) as WriteHandle<unknown, unknown>;
        try {
          await hooks?.afterDelete?.({ id, ...(doc ? { doc } : {}) });
        } catch (error) {
          throw new BebopHookError("afterDelete", error, write);
        }
        return { id, ...(doc ? { doc } : {}), ...localWrite(write) };
      },
    };
  }

  return {
    ...collections,
    onMutationError: (listener) => db.onMutationError(listener),
  } as BebopClient<TConfig>;
}
