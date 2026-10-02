# @bebopdev/core

Payload-style collection configuration, schema compilation, and a typed client for Jazz.

```sh
pnpm add @bebopdev/core jazz-tools
```

Define collections with Payload-compatible field objects, then use `defineConfig` to create the config consumed by `bebop dev`:

```ts
import { defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [
    {
      slug: "posts",
      labels: { singular: "Post", plural: "Posts" },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "publishedAt", type: "date" },
      ],
    },
  ],
});
```

`@bebopdev/cli` reads this config to generate the Jazz schema, admin manifest, typed client, and permission files. The exported `createBebopClient` factory provides typed queries and lifecycle-aware create, update, and delete methods. See the [Local API guide](../../docs/local-api.md) for filters, search, pagination, and durability, and the [access control guide](../../docs/access-control.md) for direct and command writes. Lifecycle hooks in direct mode run in the client; command mode uses the `./server` handler with host-supplied authorization and an attributed writer.

## Defaults and indexes

Set a field's `default` to apply a value when a create omits that field. Defaults are applied before validation and `beforeChange` hooks, and the generated Jazz column also carries the default. A defaulted, required field remains non-nullable in stored documents, while callers may omit it from create data:

```ts
{
  slug: "tasks",
  fields: [
    { name: "title", type: "text", required: true },
    { name: "completed", type: "checkbox", required: true, default: false },
    { name: "status", type: "select", options: ["open", "done"], required: true, default: "open" },
  ],
}
```

The admin create form uses schema defaults too; the host's `createDefaults` can override them. Defaults support text, number, checkbox, date, select, and JSON fields. Null defaults, Better Auth fields, relationships, and uploads are not supported.

Jazz indexes every column by default. Most collections should keep that behavior. Use `indexes.only` when you have a measured reason to reduce index storage or write work; it removes indexes from every column not listed, so queries on omitted fields may scan the table. Include fields used for permissions, relations, filters, sorting, and search. Relationship names map to their stored `...Id` columns.

```ts
{
  slug: "tasks",
  fields: [
    { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
    { name: "title", type: "text", required: true },
    { name: "status", type: "select", options: ["open", "done"], required: true },
    { name: "description", type: "text" },
  ],
  indexes: {
    only: ["workspace", "title", "status"],
    composite: [["workspace", "status"]],
  },
}
```

`indexes.composite` adds a composite index for a common multi-column query. It does not change the default single-column indexes unless `indexes.only` is also set.

## Hook logging

Hook logging is disabled by default. Set `logging.hooks` to `true` to emit one compact event for each lifecycle stage reached by a write, even when that stage has no callback configured:

```ts
export default defineConfig({
  logging: { hooks: true },
  collections: [
    {
      slug: "posts",
      fields: [{ name: "title", type: "text", required: true }],
      hooks: {
        beforeChange({ operation, id }) {
          // Your hook logic
        },
      },
    },
  ],
});
```

Events include the collection, hook, operation, document ID when available, whether a callback is configured, duration, and outcome (`success`, `error`, or `skipped`). A skipped event means the lifecycle stage ran but has no callback; it has a zero duration. Bebop omits document data. Direct-write hooks log through the browser console; command-write hooks log as structured JSON through Pino in the server process. Leave `logging.hooks` unset or `false` for stress tests to skip timing, event formatting, and log output.

Direct, non-upload mutation hooks receive an optional transaction-scoped `client` and the authenticated `userId` when the Jazz session has a `sub` claim. The client's `find`, `findById`, `create`, `update`, and `delete` methods use the same local-first transaction as the outer mutation. Nested writes run their collection validation and hooks; they return staged documents while the outer mutation owns the durability handle. Hook or nested-operation errors roll back the transaction. Read-only fields are omitted from create inputs so a `beforeChange` hook can supply them before final validation. Command hooks and upload writes do not receive this client because they cannot stage nested local-first writes in the same transaction.

## Permissions

Use the collection's `permissions` object to build Jazz rules for reads and direct writes. Every direct operation must be granted explicitly; omitted operations are denied. Command writes require the server handler's `authorize` callback. To give callbacks field-specific row types, define the fields as a readonly tuple and apply `satisfies CollectionDefinition<typeof taskFields>` to the plain collection object. Updates can check the stored row with `whereOld` and the proposed row with `whereNew`; `collections.<slug>.exists.where(...)` expresses a cross-collection check.

```ts
import { defineConfig, type CollectionDefinition } from "@bebopdev/core";

const taskFields = [
  { name: "workspace", type: "relationship", relationTo: "workspaces" },
  { name: "author", type: "relationship", relationTo: "users" },
] as const;

export default defineConfig({
  collections: [{
    slug: "tasks",
    fields: taskFields,
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
  } satisfies CollectionDefinition<typeof taskFields>],
});
```

## Better Auth users

Add one collection with `auth: true` to use Better Auth's built-in user model. The collection's custom scalar fields become Better Auth additional user fields; Bebop supplies `name`, `email`, `role`, and the other built-in user properties. Relationships refer to the configured slug, while the generated Jazz schema maps them to Better Auth's protected user table.

```ts
import { defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [
    {
      slug: "users",
      auth: true,
      labels: { singular: "User", plural: "Users" },
      admin: { useAsTitle: "name", defaultColumns: ["name", "email", "role"] },
      fields: [{ name: "department", type: "text" }],
    },
    {
      slug: "tasks",
      fields: [{ name: "assignee", type: "relationship", relationTo: "users" }],
    },
  ],
});
```

Use `admin.useAsTitle` with an ordered list to combine fields in document titles. The admin joins the displayed values with ` · `; relationship fields use the related collection's title:

```ts
admin: { useAsTitle: ["workspace", "user"] }
```

`bebop generate` creates the Better Auth schema automatically and installs Bebop's JWT and Admin plugins. A custom user field is read-only on public auth endpoints by default; opt into signup input with `auth: { input: true }` only when users may safely set that value themselves. The built-in admin panel is restricted to Better Auth administrators by default, including users listed in `adminUserIds`. To customize entry, define `access.admin` on the auth collection:

```ts
import { defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [{
    slug: "users",
    auth: true,
    fields: [],
    access: {
      admin: ({ req: { user, isAdmin } }) => isAdmin || user.role === "support",
    },
  }],
});
```

The callback runs on the server with the verified Better Auth user; `req.isAdmin` is the Admin plugin's `user:list` permission check, which includes the default admin role and configured `adminUserIds`. Other access operations on the auth collection remain managed by Better Auth. The host must still provide `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and mount the Better Auth handler. The playground mounts Bebop's `/api/bebop/admin-access` handler and passes its result to `BebopAdmin`.

`createBebopBetterAuth` gives the first user the `admin` role when the auth users table is empty; later users receive Better Auth's regular role. This is a server-side rule, so a client cannot promote itself by submitting a role field. `@bebopdev/admin` provides the first-admin setup flow in `BebopAdminLogin`; the host supplies a user availability check and account creation callback implemented on the server. Existing seeded users suppress first-user setup; configure a trusted `adminUserIds` entry or promote an account through trusted server code if the seed does not include an administrator.

Use `createBebopBetterAuth` from `@bebopdev/core/server` with the Jazz backend database in the host server, and `createBebopBetterAuthClient` from `@bebopdev/core/auth-client` in the browser. The demo accepts `BETTER_AUTH_ADMIN_USER_IDS` as a comma-separated list for trusted admin bootstrap. `createBebopAdminAccessHandler` is exported from `@bebopdev/core/server` for verified server-side entry checks.

For a public operation, use `rule.always()`. For authenticated-only behavior, use `session.where({ authMode: { in: ["external", "local-first"] } })`. The deprecated `access` option remains available for existing configs; do not combine it with `permissions`.

## Uploads

Mark a collection as upload-enabled and point an upload field at it:

```ts
import { defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [
    {
      slug: "media",
      upload: { mimeTypes: ["image/*"] },
      fields: [{ name: "alt", type: "text" }],
    },
    {
      slug: "tasks",
      fields: [{ name: "image", type: "upload", relationTo: "media" }],
    },
  ],
});
```

`upload: true` accepts any file type. A collection can restrict types with `mimeTypes`; `config.upload.limits.fileSize` sets the maximum file size in bytes (20 MiB by default). Bebop generates `filename`, `mimeType`, and `filesize` metadata on upload collections. Upload fields store the related media document ID as `<field>Id` and stay optional unless marked `required`.

Use `client.media.create({ file, ...fields })`, `client.media.update(id, { file })` to replace a file, and `client.media.readFile(id)` to obtain a `Blob`. `file` accepts a browser `File` or another `Blob`; a Blob without a name is saved as `upload`. The client streams the file into a hidden `s.bytes()` column on the Media row. Jazz stores large byte values internally as chunked data, without Bebop file or file-part tables. Normal collection queries select metadata and configured fields, not the binary column; `readFile()` requests the bytes in pages. Writes return after the local Jazz write, with `waitForGlobal()` for later server confirmation. The Media collection's Jazz permissions govern both metadata and file bytes.

See the [Bebop repository](https://github.com/reezerdev/bebop) for the CLI, admin package, and examples.
