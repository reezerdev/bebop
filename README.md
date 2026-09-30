# Bebop

Bebop is an application framework with a simple admin panel for editing app data. Developers define collections once; Bebop compiles a typed Local API, Jazz schema and permissions, and first-party admin screens. Bebop includes a Better Auth integration; the host app owns server deployment and its policy for entering `/admin`.

Bebop v1 is for direct editing and support workflows. It is not a full content publishing platform. Drafts, revisions, Trash, localization, and rich-text authoring are outside this release foundation. Upload support is in progress and documented separately.

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
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/` for the simple playground or `/admin` for Bebop's admin. They are separate routes and experiences; the host mounts Bebop's reusable admin package under `/admin`. The `bebop dev` command generates config artifacts and watches source imports while Vite runs.

To run the standalone example within this workspace, use `pnpm example`. `pnpm test:packages` packs the source packages, installs them in a clean temporary example with pnpm, and generates, validates, type-checks, and bundles that consumer. See [`examples/README.md`](./examples/README.md).

To delete the playground's local Jazz server database, stop `pnpm dev` and run `pnpm db:reset`. The command asks you to type `DELETE` and removes only the configured server data directory; browser IndexedDB replicas are left intact.

## Define collections

Edit [`apps/playground/bebop.config.ts`](./apps/playground/bebop.config.ts), then run `pnpm generate` or let `pnpm dev` regenerate the outputs:

```ts
import { collection, defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [collection({
    slug: "tasks",
    labels: { singular: "Task", plural: "Tasks" },
    permissions: {
      read: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
      insert: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
      update: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
      delete: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
    },
    admin: {
      useAsTitle: "name",
      defaultColumns: ["name", "status"],
      listSearchableFields: ["name", "content"],
    },
    fields: [
      { name: "name", type: "text", required: true, maxLength: 120 },
      { name: "content", type: "text", admin: { input: "textarea" } },
      { name: "status", type: "select", options: ["todo", "done"] },
    ],
  })],
});
```

Collection and field configs follow the supported Payload object shape. Supported stored field types include `text`, `number`, `checkbox`, `date`, `json`, `select`, `relationship`, and `upload`; `join` is a virtual reverse relation. Relationship fields store IDs as `<fieldName>Id`. Text fields support `minLength`/`maxLength`; numeric fields support `min`/`max` and `integer`; both support a typed custom `validate` callback. This is a focused subset of Payload's complete API.

Set `labels.singular` and `labels.plural` to control document and collection names. Set `admin.useAsTitle` to the field that names a document. Field `admin.position: "sidebar"` places it in the editor's right column. Other collection admin settings include `defaultColumns` and `listSearchableFields`.

## Access and writes

Use `permissions` for Jazz-style, per-operation rules. Each callback receives a `rule` builder, typed `session`, and read-only `collections.<slug>.exists.where(...)` helpers. Inside `rule.where((row) => ...)`, `row` is a typed policy reference for the candidate row; update rules also expose `whereOld` and `whereNew`. Every operation must be granted explicitly; omitted operations are denied. The playground keeps Workspaces and Media public with explicit `rule.always()` grants, routes Membership writes through the Better Auth command handler, and limits Task access to active Workspace members. The older `access` option remains supported for compatibility and is deprecated.

The Better Auth integration checks admin status before mounting `/admin`. By default, only users accepted by Better Auth's Admin plugin can enter; an auth collection can customize the rule with `access.admin`, which receives the authenticated `req.user` and `req.isAdmin`. Other auth providers can mount `createBebopAdminAccessHandler` with their verified session resolver, or pass their own `canAccessAdmin` result to `BebopAdmin`.

Collections default to `writeMode: "direct"`: shared-client mutations are local-first and work offline. Bebop validation and lifecycle hooks improve feedback but can be bypassed by direct Jazz writes. Jazz permissions remain authoritative, and mutation results expose `waitForGlobal()` plus later sync errors. Choose `writeMode: "command"` when custom validation and hooks must run at a trusted server boundary; the host mounts a `createBebopHandler` endpoint and binds its verified actor to the attributed Jazz writer. See the [access control guide](./docs/access-control.md).

## Generated client and admin

The CLI generates `bebop-generated-schema.ts`, `bebop-admin-manifest.ts`, `bebop-generated-client.ts`, `permissions.ts`, and `bebop-generated-command-permissions.ts`. Keep config as the source and do not edit generated files. Use the generated `createBebopClient(db)` in app code and pass the client and manifest to `BebopAdmin`.

The admin uses Base UI components with shadcn/ui's Sera style, Neutral palette, and square corners. Its compiled styles ship with `@bebopdev/admin`, so a host does not need to configure Tailwind. The host provides its router, `JazzProvider`, authentication screens, user name/email, logout action, and `canAccessAdmin` decision. The playground resolves that decision from the server at `/api/bebop/admin-access`.

The typed client supports filtered/sorted queries, offset/limit pagination, multi-field Jazz query-union search, `find`, `findById`, and CRUD methods. Its v1 list/search target is collections up to 10,000 documents; the admin retrieves one page of documents and uses ID-only query subscriptions for exact counts. Read the [Local API contract](./docs/local-api.md) for query and durability details.

## Better Auth

Declare an auth collection with `auth: true`; its slug becomes the relationship target and admin collection name. Bebop builds the Better Auth schema and installs the JWT and Admin plugins, so apps use `relationTo: "users"` instead of addressing the internal `better_auth_user` table. The host still owns its Better Auth request handler, secret, and public URL; Bebop's server helper evaluates admin entry access. See the [Better Auth users guide](./packages/bebop/README.md#better-auth-users) and the [playground host integration](./apps/playground/README.md).

The playground has email/password sign-in, Jazz's Better Auth adapter, and the protected Users list. Copy [`apps/playground/.env.example`](./apps/playground/.env.example) to `.env`, set `BETTER_AUTH_URL` and a private `BETTER_AUTH_SECRET`, and run `pnpm generate` and `pnpm dev`. At `/admin`, `@bebopdev/admin` offers first-admin setup when the auth users collection is empty; later accounts receive the standard user role. For an already populated database, set `BETTER_AUTH_ADMIN_USER_IDS` to trusted Better Auth user IDs or use an existing administrator. Generate a secret with `openssl rand -base64 32`.

For CLI commands, run `pnpm --filter @bebopdev/playground exec bebop generate` and `pnpm --filter @bebopdev/playground exec bebop validate`. `bebop dev` accepts a custom server command after `--`; without one, it starts Vite on `127.0.0.1`.

## Schema changes

Jazz is pinned to `2.0.0-alpha.57`. Additive optional fields are the compatible example; renames, removals, type changes, and newly required fields need a reviewed migration or backfill. Generation and validation do not reset application data. Follow the [schema evolution walkthrough](./docs/schema-evolution.md) and pinned [Jazz migration docs](https://jazz.tools/docs/schemas/migrations).

See [architecture](./docs/architecture.md) for package boundaries and [v1 implementation scope](./docs/implementation-plan.md) for release acceptance criteria.
