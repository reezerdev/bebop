# Bebop

Bebop is a collection framework and first-party React admin for apps built with Jazz. Define collections once and Bebop generates the Jazz schema and permissions, typed client, and admin manifest. Direct writes are local-first; command writes can run through a trusted host endpoint. The host owns authentication, deployment, and the decision to expose `/admin`.

Bebop v1 covers structured data management: field validation and defaults, relationships and joins, search and pagination, file uploads, Better Auth user management, and lifecycle hooks. Direct hooks can stage related collection writes in one local-first Jazz transaction. Bebop is not a publishing suite; drafts, revision history, Trash, localization, and rich-text authoring are outside v1.

## Workspace

```text
apps/playground/  React host app, Better Auth integration, and Bebop config
packages/bebop/   Config DSL, compiler, validation, and typed Jazz Local API
packages/admin/   First-party React admin UI and packaged shadcn styles
packages/cli/     Schema generation, validation, and dev watcher
examples/basic/   Standalone React/Vite consumer example
docs/             Access, Local API, architecture, and schema evolution guides
```

## Run the playground

```sh
cp apps/playground/.env.example apps/playground/.env
openssl rand -base64 32 # Set the output as BETTER_AUTH_SECRET in .env.
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/` for the Channels playground or `/admin` for Bebop's admin. The homepage includes a signed-out preview and a live workspace experience after sign-in. The `bebop dev` command generates config artifacts and watches source imports while Vite runs.

To run the standalone example within this workspace, use `pnpm example`. `pnpm test:packages` packs the source packages, installs them in a clean temporary example with pnpm, and generates, validates, type-checks, and bundles that consumer. See [`examples/README.md`](./examples/README.md).

To delete the playground's local Jazz server database, stop `pnpm dev` and run `pnpm db:reset`. The command asks you to type `DELETE` and removes only the configured server data directory; browser IndexedDB replicas are left intact.

## Define collections

Edit [`apps/playground/bebop.config.ts`](./apps/playground/bebop.config.ts), then run `pnpm generate` or let `pnpm dev` regenerate the outputs. A collection config combines fields, admin settings, and explicit Jazz permissions:

```ts
import { defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [{
    slug: "announcements",
    labels: { singular: "Announcement", plural: "Announcements" },
    permissions: {
      read: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
      insert: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
      update: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
      delete: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
    },
    admin: {
      useAsTitle: "title",
      defaultColumns: ["title", "status"],
      listSearchableFields: ["title", "content"],
    },
    fields: [
      { name: "title", type: "text", required: true, maxLength: 120 },
      { name: "content", type: "text", admin: { input: "textarea" } },
      { name: "status", type: "select", required: true, default: "open", options: ["open", "closed"] },
    ],
  }],
});
```

Collection and field configs follow the supported Payload object shape. Supported stored field types include `text`, `number`, `checkbox`, `date`, `json`, `select`, `relationship`, and `upload`; `join` is a virtual reverse relation. Relationship fields store IDs as `<fieldName>Id`. Defaults are applied before validation and appear in the admin create form. Text fields support `minLength`/`maxLength`; numeric fields support `min`/`max` and `integer`; both support a typed custom `validate` callback. This is a focused subset of Payload's complete API.

Set `labels.singular` and `labels.plural` to control document and collection names. Set `admin.useAsTitle` to the field that names a document. Field `admin.position: "sidebar"` places it in the editor's right column. Other collection admin settings include `defaultColumns` and `listSearchableFields`.

## Channels in the playground

The playground demonstrates four related collections: Channels, Entries, Streams, and Stream Memberships. Creating a Workspace adds public `general` and `random` Channels. Each Channel owns a Stream and starts with its creator as a Stream admin. Channel create and delete hooks use the regular Bebop client; related Stream, membership, and Entry writes are staged with the Channel mutation. A Channel's Stream and Workspace links stay fixed after creation.

Channels support public and private visibility. Active Workspace members can discover public Channels; a member who has not joined a visible Channel sees a Join channel prompt instead of the message composer. Channel admins manage private Channel membership. Entries belong to a Stream and include an author relationship. The playground also demonstrates Workspace membership, Workspace settings, and live message updates.

## Access and writes

Use `permissions` for Jazz-style, per-operation rules. Each callback receives a `rule` builder, typed `session`, and read-only `collections.<slug>.exists.where(...)` helpers. Inside `rule.where((row) => ...)`, `row` is a typed policy reference for the candidate row; update rules also expose `whereOld` and `whereNew`. For exact field checks inside callbacks, define the fields as a readonly tuple and apply `satisfies CollectionDefinition<typeof fields>` to the collection object. Every operation must be granted explicitly; omitted operations are denied. The playground scopes Workspace and Channel data through active Workspace membership, exposes Media for public reading, and routes Workspace Membership writes through a Better Auth command handler. The older `access` option remains supported for compatibility and is deprecated.

The Better Auth integration checks admin status before mounting `/admin`. By default, only users accepted by Better Auth's Admin plugin can enter; an auth collection can customize the rule with `access.admin`, which receives the authenticated `req.user` and `req.isAdmin`. Other auth providers can mount `createBebopAdminAccessHandler` with their verified session resolver, or pass their own `canAccessAdmin` result to `BebopAdmin`.

Collections default to `writeMode: "direct"`: shared-client mutations are local-first and work offline. Bebop validation and lifecycle hooks improve feedback but can be bypassed by direct Jazz writes. Jazz permissions remain authoritative, and mutation results expose `waitForGlobal()` plus later sync errors. Choose `writeMode: "command"` when custom validation and hooks must run at a trusted server boundary; the host mounts a `createBebopHandler` endpoint and binds its verified actor to the attributed Jazz writer. See the [access control guide](./docs/access-control.md).

## Generated client and admin

The CLI generates `bebop-generated-schema.ts`, `bebop-admin-manifest.ts`, `bebop-generated-client.ts`, `permissions.ts`, and `bebop-generated-command-permissions.ts`. Keep config as the source and do not edit generated files. Use the generated `createBebopClient(db)` in app code and pass the client and manifest to `BebopAdmin`. The playground and admin share this client, so its field validation, defaults, and hooks apply to ordinary UI mutations.

The admin uses Base UI components with shadcn/ui's Sera style, Neutral palette, and square corners. Its compiled styles ship with `@bebopdev/admin`, so a host does not need to configure Tailwind. The host provides its router, `JazzProvider`, authentication screens, user name/email, logout action, and `canAccessAdmin` decision. The playground resolves that decision from the server at `/api/bebop/admin-access`.

The client preserves Jazz's fluent collection query API, including `where`, `select`, `include`, `requireIncludes`, and `orderBy`; use its queries with Jazz React hooks such as `useAll`. Bebop also adds typed `query`, `find`, `findById`, validation, and CRUD methods. Search combines Jazz `contains` queries over configured text fields and paginates the result. For example, a Channels app can subscribe to Entries with included author details:

```ts
const entries = client.entries
  .where({ streamId })
  .orderBy("$createdAt", "asc")
  .include({ author: app.better_auth_user.select("id", "name") });
```

The admin pages document rows and uses ID-only subscriptions for exact counts. The v1 list/search target is collections up to 10,000 documents; this is a target, not a performance guarantee. Read the [Local API contract](./docs/local-api.md) for filters, includes, transaction behavior, and durability.

The admin includes collection list and edit screens, searchable relationship pickers, reverse-join tables, pagination, and file upload, replacement, preview, and download for upload-enabled collections. When another user changes a document during editing, the admin preserves the local draft and pauses saving until the editor reloads the latest version. Auth collections use Better Auth's protected user APIs. The packaged stylesheet means a host does not need Tailwind configuration; the host still supplies routing, `JazzProvider`, sign-in, logout, and its admin-entry decision. The playground's Media collection accepts `image/*` files up to 20 MiB.

## Better Auth

Declare an auth collection with `auth: true`; its slug becomes the relationship target and admin collection name. Bebop builds the Better Auth schema and installs the JWT and Admin plugins, so apps use `relationTo: "users"` instead of addressing the internal `better_auth_user` table. The host still owns its Better Auth request handler, secret, and public URL; Bebop's server helper evaluates admin entry access. See the [Better Auth users guide](./packages/bebop/README.md#better-auth-users) and the [playground host integration](./apps/playground/README.md).

The playground has email/password sign-in, Jazz's Better Auth adapter, and the protected Users list. At `/admin`, `@bebopdev/admin` offers first-admin setup when the auth users collection is empty; later accounts receive the standard user role. For an already populated database, set `BETTER_AUTH_ADMIN_USER_IDS` to trusted Better Auth user IDs or use an existing administrator. The host owns the Better Auth request handler, secret, and public URL; the `/api/bebop/admin-access` route checks admin entry on the server.

For CLI commands, run `pnpm --filter @bebopdev/playground exec bebop generate` and `pnpm --filter @bebopdev/playground exec bebop validate`. `bebop dev` accepts a custom server command after `--`; without one, it starts Vite on `127.0.0.1`.

## Schema changes

Jazz is pinned to `2.0.0-alpha.58`. Additive optional fields are the compatible example; renames, removals, type changes, and newly required fields need a reviewed migration or backfill. Generation and validation do not reset application data. Follow the [schema evolution walkthrough](./docs/schema-evolution.md) and pinned [Jazz migration docs](https://jazz.tools/docs/schemas/migrations).

See [architecture](./docs/architecture.md) for package boundaries and the [v1.0.0 release checklist](./docs/v1.0.0-release-checklist.md) for the verification gates before a stable release.
