export type HookLogEvent = {
  event: "bebop.hook";
  collection: string;
  hook: "beforeChange" | "afterChange" | "beforeDelete" | "afterDelete";
  operation: "create" | "update" | "delete";
  id?: string;
  outcome: "success" | "error";
  durationMs: number;
  err?: unknown;
};

export type HookLogContext = Pick<HookLogEvent, "collection" | "hook" | "operation" | "id">;

/** Logs only callback metadata; hook input and document contents are intentionally omitted. */
export async function runLoggedHook<T>(
  context: HookLogContext,
  invoke: () => T | Promise<T>,
  writeEvent: (event: HookLogEvent) => void,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await invoke();
    safelyWriteEvent(writeEvent, {
      event: "bebop.hook",
      ...context,
      outcome: "success",
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (err) {
    safelyWriteEvent(writeEvent, {
      event: "bebop.hook",
      ...context,
      outcome: "error",
      durationMs: Math.round(performance.now() - startedAt),
      err,
    });
    throw err;
  }
}

function safelyWriteEvent(writeEvent: (event: HookLogEvent) => void, event: HookLogEvent): void {
  try {
    writeEvent(event);
  } catch {
    // Logging must not change whether a hook or its mutation succeeds.
  }
}
