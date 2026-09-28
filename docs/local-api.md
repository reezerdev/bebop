# Bebop Local API

`bebop-generated-client.ts` exports a typed `createBebopClient(db, options?)` factory. This is Bebop's v1 Local API: an app-level interface over the current Jazz replica, with generated collection names, stored fields, select values, required create fields, filters, sorting, pagination, relationships, and mutation durability represented in TypeScript.

The API follows the pinned `jazz-tools@2.0.0-alpha.57` query and write behavior. Keep Jazz-specific upgrades behind the Bebop compiler/client boundary and verify the contract again when changing the pin.

## Reading documents

Each collection exposes:

```ts
client.tasks.query({
  where: { status: { in: ["todo", "in-progress"] }, dueAt: { lte: new Date() } },
  orderBy: { field: "$updatedAt", direction: "desc" },
  limit: 20,
  offset: 0,
  includeTimestamps: true,
});

const page = await client.tasks.find({
  where: { workspaceId: "workspace-id" },
  orderBy: { field: "name", direction: "asc" },
  limit: 20,
  offset: 40,
});

const task = await client.tasks.findById("task-id");
```

`query()` returns a Jazz `QueryBuilder`, suitable for Jazz React's `useAll` subscription. `find()` executes it through the supplied `Db`. `findById()` returns the local document or `null`. Use limits for interactive lists; `find()` without a limit reads every matching document.

Filters accept exact values or operator objects:

| Field type | Operators |
| --- | --- |
| Any stored field | `eq`, `ne`, `in`, `notIn` |
| Text | `contains` |
| Number and date | `gt`, `gte`, `lt`, `lte` |

An `id` filter is also supported. Sort fields include configured stored fields, `id`, `$createdAt`, and `$updatedAt`. `limit` and `offset` must be non-negative safe integers. Relations use their stored ID field in filters and sort options: `author` is queried as `authorId`.

## Search and pagination

Set `admin.listSearchableFields` to text fields. The client exposes `search()` and `searchIds()`:

```ts
const results = await db.all(client.tasks.search({
  search: "release",
  fields: ["name", "content"],
  where: { status: "todo" },
  orderBy: { field: "$updatedAt", direction: "desc" },
  limit: 20,
  offset: 0,
}));
```

`search()` creates one Jazz `contains` query per field, applies common filters inside each arm, combines the arms with Jazz `union()`, then orders and paginates the combined result. `searchIds()` returns ID-only queries for callers that need an exact count across multiple fields; merge/deduplicate those IDs. The admin uses the union query for the requested page of full documents and ID-only subscriptions for counts. It does not fetch every matching document to search in JavaScript.

The v1 supported target is up to 10,000 documents per collection for admin lists and configured text search. That target assumes bounded document pages; the exact-count path observes matching IDs. It is not a performance guarantee for arbitrary filters, slow networks, or very large document bodies. If you expect larger collections, add application-specific indexes/query boundaries and measure with representative data before choosing Bebop.

Jazz query subscriptions are evaluated upstream and synchronized to the local replica. A local replica can display cached query results immediately and continue serving them offline. A subscription may update as more data becomes available or a write synchronizes.

## Relationships and joins

A `relationship` field stores the target document ID in `<fieldName>Id`. Relationship fields do not automatically populate the target document; query the target collection or use Jazz includes as supported by the installed Jazz API.

A `join` field is virtual reverse metadata. It generates no stored column and cannot be sent in create/update data. Jazz reverse relations can be read with its `include()` query API. The admin uses the generated join metadata to render a related table. See the [Join Field guide](./architecture.md) and the playground's Workspaces config.

## Mutations and durability

The collection client exposes `create`, `update`, and `delete`. Direct mode returns after the local optimistic mutation and reports `durability: "local"`:

```ts
const result = await client.tasks.create({ name: "Review release" });
// Local replica is updated here.
await result.waitForGlobal(); // Rejects if Jazz does not confirm global durability.
```

The client runs field validation and `beforeChange` before a direct write, then `afterChange` after the local write. An after-hook exception means the local mutation already happened; `BebopHookError` carries the write handle. `client.onMutationError(listener)` reports later Jazz mutation rejections. These callbacks are client-side behavior and can be bypassed by direct Jazz writes.

Command-mode mutations use `commandTransport`, run on the host through `createBebopHandler`, and are returned only after the handler confirms Jazz global durability. They report `durability: "global"`. See [access control and server writes](./access-control.md#command-collections).

Uploads are still in progress. The current client offers `create({ file })`, `update(id, { file })`, and `readFile(id)` for upload-enabled collections. It stores bounded file byte rows in Jazz and returns local-first mutation results. Command mode currently rejects upload-enabled collections. Treat these upload method details as provisional until that feature is complete.

## Stable behavior for v1

The v1 contract covers typed query construction, `find`/`findById`, filter operators above, sort fields, offset/limit pagination, relationship ID storage, virtual joins, create/update/delete, and direct versus command durability. It does not promise REST or GraphQL, server pagination for arbitrary host queries, full-text ranking, drafts or revisions, transactional side effects, or a generic plugin API.
