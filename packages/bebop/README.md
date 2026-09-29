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
      { name: "author", type: "relationship", relationTo: "users" },
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

## Better Auth users

Add one collection with `auth: true` to use Better Auth's built-in user model. The collection's custom scalar fields become Better Auth additional user fields; Bebop supplies `name`, `email`, `role`, and the other built-in user properties. Relationships refer to the configured slug, while the generated Jazz schema maps them to Better Auth's protected user table.

```ts
collection({
  slug: "users",
  auth: true,
  labels: { singular: "User", plural: "Users" },
  admin: { useAsTitle: "name", defaultColumns: ["name", "email", "role"] },
  fields: [{ name: "department", type: "text" }],
});

collection({
  slug: "tasks",
  fields: [{ name: "assignee", type: "relationship", relationTo: "users" }],
});
```

`bebop generate` creates the Better Auth schema automatically and installs Bebop's JWT and Admin plugins. A custom user field is read-only on public auth endpoints by default; opt into signup input with `auth: { input: true }` only when users may safely set that value themselves. The built-in admin panel is restricted to Better Auth administrators by default, including users listed in `adminUserIds`. To customize entry, define `access.admin` on the auth collection:

```ts
collection({
  slug: "users",
  auth: true,
  fields: [],
  access: {
    admin: ({ req: { user, isAdmin } }) => isAdmin || user.role === "support",
  },
});
```

The callback runs on the server with the verified Better Auth user; `req.isAdmin` is the Admin plugin's `user:list` permission check, which includes the default admin role and configured `adminUserIds`. Other access operations on the auth collection remain managed by Better Auth. The host must still provide `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and mount the Better Auth handler. The playground mounts Bebop's `/api/bebop/admin-access` handler and passes its result to `BebopAdmin`.

Use `createBebopBetterAuth` from `@bebopdev/core/server` with the Jazz backend database in the host server, and `createBebopBetterAuthClient` from `@bebopdev/core/auth-client` in the browser. The demo accepts `BETTER_AUTH_ADMIN_USER_IDS` as a comma-separated list for trusted admin bootstrap. `createBebopAdminAccessHandler` is exported from `@bebopdev/core/server` for verified server-side entry checks.

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
