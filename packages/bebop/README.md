# @bebopdev/core

Payload-style collection configuration, schema compilation, and a typed client for Jazz.

```sh
pnpm add @bebopdev/core jazz-tools
```

Define collections with Payload-compatible field objects, then use `defineConfig` to create the config consumed by `bebop dev`:

```ts
import { collection, defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [
    collection({
      slug: "posts",
      labels: { singular: "Post", plural: "Posts" },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "publishedAt", type: "date" },
      ],
    }),
  ],
});
```

`@bebopdev/cli` reads this config to generate the Jazz schema, admin manifest, typed client, and direct/command permissions. The exported `createBebopClient` factory provides typed queries and lifecycle-aware create, update, and delete methods. See the [Local API guide](../../docs/local-api.md) for filters, search, pagination, and durability, and the [access control guide](../../docs/access-control.md) for direct and command writes. Lifecycle hooks in direct mode run in the client; use the `./server` handler and a host-supplied attributed writer for authoritative validation and hooks.

## Permissions

Use the collection's `permissions` object to build Jazz rules. Every operation must be granted explicitly; omitted operations are denied. `collection(...)` types the current row reference from the collection's fields. Updates can check the stored row with `whereOld` and the proposed row with `whereNew`; `collections.<slug>.exists.where(...)` expresses a cross-collection check.

```ts
collection({
  slug: "tasks",
  fields: [
    { name: "workspace", type: "relationship", relationTo: "workspaces" },
    { name: "author", type: "relationship", relationTo: "better_auth_user" },
  ],
  permissions: {
    read: ({ rule, collections, session }) => rule.where((task) =>
      collections.workspaceMemberships.exists.where({
        workspaceId: task.workspaceId,
        userId: session.claims.sub,
        status: "active",
      }),
    ),
    insert: ({ rule }) => rule.never(),
  },
});
```

For a public operation, use `rule.always()`. For authenticated-only behavior, use `session.where({ authMode: { in: ["external", "local-first"] } })`. The deprecated `access` option remains available for existing configs; do not combine it with `permissions`.

## Uploads

Mark a collection as upload-enabled and point an upload field at it:

```ts
collection({
  slug: "media",
  upload: { mimeTypes: ["image/*"] },
  fields: [{ name: "alt", type: "text" }],
});

collection({
  slug: "tasks",
  fields: [{ name: "image", type: "upload", relationTo: "media" }],
});
```

`upload: true` accepts any file type. A collection can restrict types with `mimeTypes`; `config.upload.limits.fileSize` sets the maximum file size in bytes (20 MiB by default). Bebop generates `filename`, `mimeType`, and `filesize` metadata on upload collections. Upload fields store the related media document ID as `<field>Id` and stay optional unless marked `required`.

Use `client.media.create({ file, ...fields })`, `client.media.update(id, { file })` to replace a file, and `client.media.readFile(id)` to obtain a `Blob`. `file` accepts a browser `File` or another `Blob`; a Blob without a name is saved as `upload`. The client returns after a local Jazz write, with `waitForGlobal()` for later server confirmation. On the pinned Jazz alpha, Bebop stores file bytes in bounded Jazz byte rows and keeps those rows out of normal collection queries. Treat Jazz permissions as the authority for file access.

See the [Bebop repository](https://github.com/reezerdev/bebop) for the CLI, admin package, and examples.
