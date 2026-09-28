# Bebop architecture

## Current boundaries

```text
bebop.config.ts ──> @bebopdev/core compiler ──> Jazz schema and permissions
                                      ├────> admin manifest
                                      └────> typed client factory

host app ──> auth, router, JazzProvider ──> @bebopdev/admin
                                     └────> shared Bebop client ──> Jazz
```

The config is the only collection definition. The CLI normalizes and validates it once per generation and emits the schema, permissions, admin manifest, and client factory. `@bebopdev/core` owns that compiler and the collection client. `@bebopdev/admin` owns its screens, components, and scoped CSS. The playground is an integration host and keeps `/` separate from `/admin`.

This follows Payload's useful separation between collection config, generated metadata, and a first-party admin, while keeping Jazz's sync and permission model explicit. The package boundary matters more than splitting the current small codebase into more packages.

## Reads and writes

The generated client exposes `query`, `queryIds`, `find`, `findById`, `create`, `update`, and `delete` per collection. The playground and admin use it for collection reads and mutations. The admin still uses Jazz `can*` advice for interface guidance; Jazz policies make the final access decision. `canAccessAdmin` is an independent host decision about entering the panel.

The mutation path is `before hook → local Jazz write → after hook`. Successful method returns mean the write and after hook completed locally. The returned `durability: "local"` makes that state explicit. Call `waitForGlobal()` to await global persistence; a rejection may arrive through that promise or `onMutationError`. An `afterChange` or `afterDelete` failure throws `BebopHookError`, which carries the write handle because the local write already happened. Direct Jazz writes bypass Bebop hooks.

Collection lists query only the current row page, but read IDs for the total count. Configured text search currently loads the filtered collection and searches it in the browser. This is an intentional first-version limit; an indexed search/count adapter is needed for large datasets.

## Next security milestone

Current hooks run in the browser and can run offline. They are suitable for local transformations and interface behavior. They cannot be trusted for authoritative validation or external side effects. A future command collection mode should deny direct client writes in Jazz, verify the caller at a backend boundary, run validation and hooks there, await global acceptance, and dispatch external effects through an idempotent outbox. The project should implement and test that whole path together rather than expose a command setting before it is secure.

Jazz is pinned to `2.0.0-alpha.57`. For a schema change, regenerate artifacts, run `pnpm --filter @bebopdev/playground exec bebop validate`, and review the Jazz migration before merging. Keep generated files in sync with their source config.
