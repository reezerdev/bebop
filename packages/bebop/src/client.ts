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
  [TName in keyof TFields]: TFields[TName] extends { required: true }
    ? TFields[TName] extends { kind: "relation" }
      ? `${Extract<TName, string>}Id`
      : Extract<TName, string>
    : never;
}[keyof TFields];

export type CollectionCreateData<TFields extends Fields> = Pick<StoredFields<TFields>, RequiredStoredKeys<TFields>> &
  Partial<Omit<StoredFields<TFields>, RequiredStoredKeys<TFields>>>;
export type CollectionUpdateData<TFields extends Fields> = Partial<StoredFields<TFields>>;

export type BebopMutationResult<TDocument> = {
  doc: TDocument;
  write: WriteHandle<unknown, unknown>;
};

export type BebopDeleteResult<TDocument> = {
  id: string;
  doc?: TDocument;
  write: WriteHandle<unknown, unknown>;
};

export type BebopCollectionClient<TFields extends Fields> = {
  create(data: CollectionCreateData<TFields>): Promise<BebopMutationResult<CollectionDocument<TFields>>>;
  update(id: string, data: CollectionUpdateData<TFields>): Promise<BebopMutationResult<CollectionDocument<TFields>>>;
  delete(id: string): Promise<BebopDeleteResult<CollectionDocument<TFields>>>;
};

export type BebopClient<TConfig extends BebopConfig> = {
  [TName in keyof TConfig["collections"]]: BebopCollectionClient<TConfig["collections"][TName]["fields"]>;
} & {
  onMutationError(listener: (event: MutationErrorEvent) => void): () => void;
};

export class BebopHookError extends Error {
  readonly localWriteApplied = true;

  constructor(readonly hook: "afterChange" | "afterDelete", cause: unknown) {
    super(`The ${hook} hook failed after the local Jazz write was applied.`, { cause });
    this.name = "BebopHookError";
  }
}

export class BebopDocumentNotFoundError extends Error {
  constructor(readonly collection: string, readonly id: string) {
    super(`Could not find ${collection} document "${id}" in the local database.`);
    this.name = "BebopDocumentNotFoundError";
  }
}

type BebopTable = TableProxy<Record<string, unknown> & { id: string }, Record<string, unknown>> & {
  where(input: Record<string, unknown>): QueryBuilder<Record<string, unknown> & { id: string }>;
};

export function createBebopClient<const TConfig extends BebopConfig>(options: {
  app: Record<keyof TConfig["collections"], object>;
  config: TConfig;
  db: Db;
}): BebopClient<TConfig> {
  const { app, config, db } = options;
  const collections: Record<string, BebopCollectionClient<Fields>> = {};

  for (const [collectionName, definition] of Object.entries(config.collections)) {
    const table = app[collectionName as keyof TConfig["collections"]] as BebopTable;
    if (!table) throw new Error(`Generated Bebop app is missing collection "${collectionName}".`);

    const hooks = definition.hooks as CollectionHooks<Fields> | undefined;
    const readLocalDocument = (id: string) => db.one(table.where({ id }));

    collections[collectionName] = {
      async create(data) {
        const context: CollectionChangeContext<Fields> = {
          operation: "create",
          data: { ...data },
        };
        const patch = await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        const write = db.insert(table, document) as WriteResult<CollectionDocument<Fields>> & WriteHandle<unknown, unknown>;
        const doc = write.value;
        try {
          await hooks?.afterChange?.({ operation: "create", doc });
        } catch (error) {
          throw new BebopHookError("afterChange", error);
        }
        return { doc, write };
      },

      async update(id, data) {
        const originalDoc = await readLocalDocument(id) as CollectionDocument<Fields> | null;
        if (!originalDoc) throw new BebopDocumentNotFoundError(collectionName, id);
        const context: CollectionChangeContext<Fields> = {
          operation: "update",
          id,
          data: { ...data },
          originalDoc,
        };
        const patch = await hooks?.beforeChange?.(context);
        const document = { ...context.data, ...patch };
        const write = db.update(table, id, document) as WriteHandle<unknown, unknown>;
        const doc = { ...originalDoc, ...document } as CollectionDocument<Fields>;
        try {
          await hooks?.afterChange?.({ operation: "update", doc, originalDoc });
        } catch (error) {
          throw new BebopHookError("afterChange", error);
        }
        return { doc, write };
      },

      async delete(id) {
        const doc = await readLocalDocument(id) as CollectionDocument<Fields> | null ?? undefined;
        await hooks?.beforeDelete?.({ id, ...(doc ? { doc } : {}) });
        const write = db.delete(table, id) as WriteHandle<unknown, unknown>;
        try {
          await hooks?.afterDelete?.({ id, ...(doc ? { doc } : {}) });
        } catch (error) {
          throw new BebopHookError("afterDelete", error);
        }
        return { id, ...(doc ? { doc } : {}), write };
      },
    };
  }

  return {
    ...collections,
    onMutationError: (listener) => db.onMutationError(listener),
  } as BebopClient<TConfig>;
}
