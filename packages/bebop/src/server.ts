import type { Db, QueryBuilder, TableProxy } from "jazz-tools";
import pino from "pino";
import type { BebopConfig, CollectionChangeContext, CollectionDocument, CollectionHooks, Fields } from "./bebop.ts";
import type { BebopCommandRequest } from "./client.ts";
import { runMaybeLoggedHook, type HookLogEvent } from "./hook-logging.ts";
import { applyFieldDefaults, BebopValidationError, validateCollectionData } from "./validation.ts";

export { createBebopBetterAuth } from "./auth.ts";
export type { BebopBetterAuth, CreateBebopBetterAuthOptions } from "./auth.ts";
export { createBebopAdminAccessHandler } from "./admin-access.ts";
export type { BebopAdminAccessHandlerOptions, BebopAdminAccessSession } from "./admin-access.ts";

type ServerDocument = Record<string, unknown> & { id: string };
type ServerTable = TableProxy<ServerDocument, Record<string, unknown>> & {
  where(input: Record<string, unknown>): QueryBuilder<ServerDocument>;
};
type ServerApp = Record<string, object>;

let hookLogger: ReturnType<typeof pino> | undefined;

function logServerHookEvent(event: HookLogEvent): void {
  hookLogger ??= pino({ name: "bebop" });
  const { err, ...fields } = event;
  if (event.outcome === "error") hookLogger.error({ ...fields, err }, "Bebop hook failed");
  else if (event.outcome === "skipped") hookLogger.info(fields, "Bebop hook skipped (no callback configured)");
  else hookLogger.info(fields, "Bebop hook completed");
}

export type BebopCommandSession = {
  /** Request-scoped Jazz Db used to read the current document for authorization. */
  authorizationDb: Db;
  /** Trusted server Db with backend write authority and attribution to this user. */
  writeDb: Db;
  userId: string;
};

export type BebopCommandAuthorizationContext = {
  request: Request;
  collection: string;
  operation: "create" | "update" | "delete";
  userId: string;
  /** The proposed write, including any beforeChange changes on the second check. */
  data?: Readonly<Record<string, unknown>>;
  originalDoc?: Readonly<ServerDocument>;
  /** Reads run as the verified user; this Db does not grant command writes. */
  db: Db;
};

export type BebopCommandHandlerOptions<TConfig extends BebopConfig> = {
  app: ServerApp;
  config: TConfig;
  /** Resolve the host session and reject missing or invalid authentication/CSRF. */
  resolveSession: (request: Request) => Promise<BebopCommandSession | null>;
  /** Trusted server authorization for command writes. Called before and after beforeChange. */
  authorize: (context: BebopCommandAuthorizationContext) => boolean | Promise<boolean>;
  onError?: (error: unknown, context: { request: Request; collection?: string; operation?: string }) => void;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRoute(request: Request): { collection: string; id?: string; operation: "create" | "update" | "delete" } | null {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const marker = segments.lastIndexOf("collections");
  if (marker < 0 || segments.length < marker + 2 || segments.length > marker + 3) return null;
  let collection: string;
  let id: string | undefined;
  try {
    collection = decodeURIComponent(segments[marker + 1]);
    id = segments[marker + 2] ? decodeURIComponent(segments[marker + 2]) : undefined;
  } catch {
    return null;
  }
  if (request.method === "POST" && !id) return { collection, operation: "create" };
  if (request.method === "PATCH" && id) return { collection, id, operation: "update" };
  if (request.method === "DELETE" && id) return { collection, id, operation: "delete" };
  return null;
}

function reviveDates(collection: BebopConfig["collections"][number], input: Record<string, unknown>): Record<string, unknown> {
  const data = { ...input };
  for (const field of collection.fields) {
    if (field.type !== "date" || typeof data[field.name] !== "string") continue;
    const parsed = new Date(data[field.name] as string);
    if (Number.isNaN(parsed.valueOf())) throw new TypeError(`Field "${field.name}" must be a valid date.`);
    data[field.name] = parsed;
  }
  return data;
}

function validateWriteFields(collection: BebopConfig["collections"][number], data: Record<string, unknown>): void {
  const allowed = new Set(collection.fields.flatMap((field) => field.type === "join"
    ? []
    : [field.type === "relationship" || field.type === "upload" ? `${field.name}Id` : field.name]));
  for (const name of Object.keys(data)) {
    if (!allowed.has(name)) throw new TypeError(`Unknown ${collection.slug} write field "${name}".`);
  }
}

function mutationRequest(collection: string, operation: string, id?: string): { collection: string; operation: string; id?: string } {
  return { collection, operation, ...(id ? { id } : {}) };
}

/** Create a host-mounted Web Request/Response endpoint for command collections. */
export function createBebopHandler<const TConfig extends BebopConfig>(options: BebopCommandHandlerOptions<TConfig>) {
  const logHooks = options.config.logging?.hooks === true;
  return async function handleBebopRequest(request: Request): Promise<Response> {
    const route = parseRoute(request);
    if (!route) return json({ message: "Unsupported Bebop command route." }, 404);
    const routeCollection = route.collection;
    const routeOperation = route.operation;
    const definition = options.config.collections.find((candidate) => candidate.slug === route.collection);
    if (!definition || definition.writeMode !== "command") return json({ message: "Command collection not found." }, 404);
    const table = options.app[route.collection] as ServerTable | undefined;
    if (!table) return json({ message: "Generated Bebop schema is missing this collection." }, 500);

    let session: BebopCommandSession | null;
    try {
      session = await options.resolveSession(request);
    } catch (error) {
      options.onError?.(error, { request, collection: route.collection, operation: route.operation });
      return json({ message: "Could not resolve the signed-in user." }, 401);
    }
    if (!session?.authorizationDb || !session.writeDb || !session.userId) {
      return json({ message: "Sign in before changing this document." }, 401);
    }
    const actor = session;

    const hooks = definition.hooks as CollectionHooks<Fields> | undefined;
    const authDb = session.authorizationDb;
    const writeDb = session.writeDb;
    let currentDoc: ServerDocument | null = null;
    if (route.id) {
      try {
        currentDoc = await authDb.one(table.where({ id: route.id })) as ServerDocument | null;
      } catch (error) {
        options.onError?.(error, { request, collection: route.collection, operation: route.operation });
        return json({ message: "Jazz could not read this document for the requested command." }, 500);
      }
    }

    if (route.operation !== "create" && !currentDoc) return json({ message: "Document not found or unavailable." }, 404);
    async function checkAuthorization(data?: Record<string, unknown>): Promise<"allowed" | "denied" | "error"> {
      try {
        return await options.authorize({
          request,
          collection: routeCollection,
          operation: routeOperation,
          userId: actor.userId,
          ...(data ? { data: Object.freeze({ ...data }) } : {}),
          ...(currentDoc ? { originalDoc: currentDoc } : {}),
          db: authDb,
        }) === true ? "allowed" : "denied";
      } catch (error) {
        options.onError?.(error, { request, collection: routeCollection, operation: routeOperation });
        return "error";
      }
    }

    if (route.operation === "delete") {
      const permission = await checkAuthorization();
      if (permission === "error") return json({ message: "Could not authorize this delete." }, 500);
      if (permission === "denied") return json({ message: "Your current session cannot delete this document." }, 403);
      try {
        const hookContext = { id: route.id!, doc: currentDoc as CollectionDocument<Fields> };
        if (logHooks) {
          await runMaybeLoggedHook(
            { collection: route.collection, hook: "beforeDelete", operation: "delete", id: route.id },
            hooks?.beforeDelete ? () => hooks.beforeDelete!(hookContext) : undefined,
            logServerHookEvent,
          );
        } else {
          await hooks?.beforeDelete?.(hookContext);
        }
      } catch (error) {
        options.onError?.(error, { request, collection: route.collection, operation: route.operation });
        return json({ message: error instanceof Error ? error.message : "The beforeDelete hook rejected the command." }, 422);
      }
      try {
        const write = writeDb.delete(table, route.id!);
        await write.wait({ tier: "global" });
      } catch (error) {
        options.onError?.(error, { request, collection: route.collection, operation: route.operation });
        return json({ message: "Jazz did not confirm this delete." }, 409);
      }
      try {
        const hookContext = { id: route.id!, doc: currentDoc as CollectionDocument<Fields> };
        if (logHooks) {
          await runMaybeLoggedHook(
            { collection: route.collection, hook: "afterDelete", operation: "delete", id: route.id },
            hooks?.afterDelete ? () => hooks.afterDelete!(hookContext) : undefined,
            logServerHookEvent,
          );
        } else {
          await hooks?.afterDelete?.(hookContext);
        }
      } catch (error) {
        options.onError?.(error, { request, collection: route.collection, operation: route.operation });
        return json({ message: error instanceof Error ? error.message : "The afterDelete hook failed.", writeAccepted: true }, 500);
      }
      return json({ id: route.id, durability: "global" });
    }

    let rawData: unknown;
    try {
      rawData = await request.json();
      if (!isRecord(rawData)) return json({ message: "Command data must be a JSON object." }, 400);
      rawData = reviveDates(definition, rawData as Record<string, unknown>);
      validateWriteFields(definition, rawData as Record<string, unknown>);
    } catch (error) {
      return json({ message: error instanceof Error ? error.message : "Invalid command data." }, 400);
    }

    const receivedInput = rawData as Record<string, unknown>;
    const input = route.operation === "create" ? applyFieldDefaults(definition, receivedInput) : receivedInput;
    const changeContext: CollectionChangeContext<Fields> = {
      operation: route.operation,
      ...(route.id ? { id: route.id } : {}),
      data: { ...input } as CollectionChangeContext<Fields>["data"],
      ...(currentDoc ? { originalDoc: currentDoc as CollectionDocument<Fields> } : {}),
    };
    try {
      await validateCollectionData(definition, input, route.operation, currentDoc ?? undefined);
      const requestedPermission = await checkAuthorization(input);
      if (requestedPermission === "error") return json({ message: "Could not authorize this document." }, 500);
      if (requestedPermission === "denied") return json({ message: "Your current session cannot save this document." }, 403);

      const hookPatch = logHooks
        ? await runMaybeLoggedHook(
            { collection: route.collection, hook: "beforeChange", operation: route.operation, ...(route.id ? { id: route.id } : {}) },
            hooks?.beforeChange ? () => hooks.beforeChange!(changeContext) : undefined,
            logServerHookEvent,
          )
        : await hooks?.beforeChange?.(changeContext);
      const data = { ...changeContext.data, ...hookPatch };
      validateWriteFields(definition, data);
      await validateCollectionData(definition, data, route.operation, currentDoc ?? undefined);
      const finalPermission = await checkAuthorization(data);
      if (finalPermission === "error") return json({ message: "Could not authorize this document." }, 500);
      if (finalPermission === "denied") return json({ message: "Your current session cannot save this document." }, 403);

      if (route.operation === "create") {
        const write = writeDb.insert(table, data);
        await write.wait({ tier: "global" });
        const doc = write.value as ServerDocument;
        try {
          const hookContext = { operation: "create" as const, doc: doc as CollectionDocument<Fields> };
          if (logHooks) {
            await runMaybeLoggedHook(
              { collection: route.collection, hook: "afterChange", operation: "create", id: doc.id },
              hooks?.afterChange ? () => hooks.afterChange!(hookContext) : undefined,
              logServerHookEvent,
            );
          } else {
            await hooks?.afterChange?.(hookContext);
          }
        } catch (error) {
          options.onError?.(error, { request, collection: route.collection, operation: route.operation });
          return json({ message: error instanceof Error ? error.message : "The afterChange hook failed.", writeAccepted: true }, 500);
        }
        return json({ doc, durability: "global" });
      }

      const write = writeDb.update(table, route.id!, data);
      await write.wait({ tier: "global" });
      const doc = await writeDb.one(table.where({ id: route.id! })) as ServerDocument | null;
      if (!doc) return json({ message: "Jazz confirmed the update but the saved document could not be read back." }, 500);
      try {
        const hookContext = { operation: "update" as const, doc: doc as CollectionDocument<Fields>, originalDoc: currentDoc as CollectionDocument<Fields> };
        if (logHooks) {
          await runMaybeLoggedHook(
            { collection: route.collection, hook: "afterChange", operation: "update", id: route.id },
            hooks?.afterChange ? () => hooks.afterChange!(hookContext) : undefined,
            logServerHookEvent,
          );
        } else {
          await hooks?.afterChange?.(hookContext);
        }
      } catch (error) {
        options.onError?.(error, { request, collection: route.collection, operation: route.operation });
        return json({ message: error instanceof Error ? error.message : "The afterChange hook failed.", writeAccepted: true }, 500);
      }
      return json({ doc, durability: "global" });
    } catch (error) {
      options.onError?.(error, { request, collection: route.collection, operation: route.operation });
      if (error instanceof BebopValidationError) return json({ message: error.message, fieldErrors: error.fieldErrors }, 422);
      if (error instanceof TypeError) return json({ message: error.message }, 400);
      return json({ message: error instanceof Error ? error.message : "The command was rejected." }, 409);
    }
  };
}
