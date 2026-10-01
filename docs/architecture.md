# Bebop architecture

Bebop is an application framework with a small, first-party admin for direct editing of app data. The host application owns authentication, server deployment, and the decision to expose `/admin`; Bebop owns collection configuration, generated metadata, validation, the typed local API, and the admin screens. It is not intended to grow into a publishing suite.

```text
bebop.config.ts ──> @bebopdev/core compiler ──> Jazz schema and permissions
                                      ├────> admin manifest
                                      ├────> typed Local API factory
                                      └────> command authorization policy

host app ──> auth + route + JazzProvider ──> @bebopdev/admin
        └──> mounted command handler ──> Jazz backend
```

The CLI compiles one config into `bebop-generated-schema.ts`, `bebop-admin-manifest.ts`, `bebop-generated-client.ts`, `permissions.ts`, and `bebop-generated-command-permissions.ts`. `schema.ts` is Jazz's conventional re-export entry point. Generated files are outputs; edit the config and regenerate them.

## Access and host authentication

Jazz permissions enforce collection and row access. The primary `permissions` API exposes a Jazz rule builder for each collection operation: `read`, `insert`, `update`, and `delete`. Every operation needs an explicit grant; omitted operations are denied. Typed row callbacks expose the row candidate, and updates can inspect both old and new values. `collections.<slug>.exists.where(...)` supports cross-collection predicates without granting access to that collection. The old `access` API remains available for compatibility and is deprecated. The admin uses Jazz `can*` results to guide buttons and screens, while Jazz decides whether a write is accepted.

The host makes a separate decision about entering the admin and passes it as `canAccessAdmin`. That is not a collection permission and does not replace Jazz policies. See [access control and server writes](./access-control.md) for the direct and command modes and a workspace membership rule.

## Direct and command writes

`writeMode` defaults to `"direct"`. The generated client validates locally, runs `beforeChange`, applies the optimistic Jazz write, then runs `afterChange`. A returned mutation has `durability: "local"` and `waitForGlobal()` for confirmation. Later Jazz rejection is delivered by `waitForGlobal()` and the client's `onMutationError` listener. Direct mode is local-first and works offline; Bebop validators and hooks are convenience and can be bypassed by calling Jazz directly. Jazz's schema and policy remain authoritative.

`writeMode: "command"` makes the generated browser policy deny insert, update, and delete. The host mounts `createBebopHandler` from `@bebopdev/core/server` and supplies request authentication, request-scoped authorization and a trusted attributed writer. The handler checks configured Jazz access, validates before and after `beforeChange`, performs the write, waits for global confirmation, and then runs the after hook. Command writes need a connection. The host must bind the attributed writer to the same verified actor, protect the route against CSRF where relevant, and keep privileged backend objects on the server. See [command host setup](./access-control.md#command-collections).

Command mode does not support upload-enabled collections yet. Upload's local-first client behavior remains documented separately in the core package README while that feature settles.

## Queries and scale

The generated collection client exposes `query`, `queryIds`, `search`, `searchIds`, `find`, and `findById`, plus create/update/delete. Queries use Jazz filters, sorting, and offset/limit pagination. Search runs `contains` filters through a Jazz query union instead of downloading document rows for browser-side text scanning. The admin requests a page of matching documents; it also subscribes to ID-only matches to compute an exact count and deduplicate count results across searchable fields. Jazz evaluates query subscriptions and synchronizes their results to local replicas.

The supported v1 list/search target is collections up to 10,000 documents. That is a product target, not a Jazz hard limit or a benchmark guarantee. Avoid `find()` on an unbounded collection in an interactive screen; use paginated `query()` or `search()`. Search fields must be configured text fields. The implementation and query operators are pinned to `jazz-tools@2.0.0-alpha.58`; see the [Local API contract](./local-api.md).

## Schema evolution

The playground pins `jazz-tools@2.0.0-alpha.58`. For every config change, regenerate artifacts, run `bebop validate`, inspect the generated schema diff and follow the pinned Jazz migration behavior. Compatible additions such as optional fields should preserve existing rows. Renames, removals, required-field additions, and type changes need a reviewed migration or backfill. Bebop never resets local data as a schema migration strategy. The [schema evolution walkthrough](./schema-evolution.md) exercises an additive change against existing data.
