# Bebop

Bebop is a schema-driven CMS prototype compiled onto Jazz. This pnpm workspace separates the app used for experimentation from the package that defines the Bebop API.

## Structure

```text
apps/
  playground/     React host app and Bebop config
packages/
  bebop/          Config DSL and Jazz schema compiler
  admin/          First-party React admin UI and shadcn components
docs/             Product and architecture notes
examples/         Reserved for standalone examples
```

## Start the playground

```sh
pnpm install
pnpm dev
```

The root scripts use pnpm and Turborepo to run workspace tasks. The playground app is at `http://127.0.0.1:5173/`; Bebop's first-party admin package is mounted separately at `http://127.0.0.1:5173/admin`. The playground is an integration host, while the admin UI lives in `packages/admin`.

Edit [`apps/playground/bebop.config.ts`](./apps/playground/bebop.config.ts) to change collections, access rules, hooks, and admin list settings. `pnpm dev` builds and watches the admin package, generates the Jazz schema, admin manifest, and typed mutation client, then starts Vite. The Jazz Vite plugin starts the local Jazz server and picks up the generated schema and permissions.

Collection and field definitions use Payload's object shape. Field types are string values, so adding a field requires no field helper import:

```ts
import { defineConfig } from "@bebop/core";

export default defineConfig({
  collections: [{
    slug: "tasks",
    labels: { singular: "Task", plural: "Tasks" },
    admin: { useAsTitle: "name" },
    fields: [
      { name: "name", type: "text", required: true },
      { name: "content", type: "text", admin: { input: "textarea" } },
      { name: "status", type: "select", options: ["todo", "done"] },
    ],
  }],
});
```

The current supported types are `text`, `number` (with optional `integer: true`), `checkbox`, `date`, `json`, `select`, and single `relationship` (with `relationTo`). A relationship named `author` stores its ID in an `authorId` column. Text fields can set `admin.input: "textarea"`; date fields can set `admin.date.pickerAppearance: "dayAndTime"`. Bebop stores task content as plain text, not Payload rich text. This is the supported subset of Payload's field config, not its complete field API.

If a collection defines access or lifecycle callbacks and you want their field data inferred inside those callbacks, wrap that collection object with `collection({...})` from `@bebop/core`. The fields inside it remain plain `{ name, type }` objects. Plain collection objects still work for configurations that do not need that callback inference.

The admin package renders every collection and supported field kind from `bebop.config.ts`. Top-level `labels.singular` names one document in create and empty states; `labels.plural` names the collection in navigation and lists. Bebop derives missing labels from the collection slug, and `admin.label` remains a deprecated alias for the plural label. Set collection `admin.useAsTitle` to the field that names each document; the admin uses it in list links, the editor heading, and the document breadcrumb. Set `admin: { position: "sidebar" }` in a field's options to place that field on the right of the editor; `"main"` is the default. Other collection admin options include default columns and searchable text fields. Its shadcn/ui components and compiled CSS are owned by `@bebop/admin`, so consuming apps do not need their own Tailwind setup. The host app provides the router, Jazz provider, authentication flow, signed-in user's name and email, and logout action. `BebopAdmin` also receives the generated Bebop client so admin writes run collection hooks.

The host passes `canAccessAdmin` after making its own admin entry decision. The playground grants entry to any signed-in demo user; a production host should supply its own role or membership check.

Collection `access` rules compile to Jazz row-level permissions. Omitted access denies all operations, and omitted operations inside an access object are denied. Use `access: "public"` when every session may read, create, update, and delete; the playground uses this for its open demo. For a restricted collection, provide callbacks such as `{ read: ({ session }) => ({ ownerId: session.user.account }) }`. Rules can use Jazz's `session`, `allOf`, `anyOf`, `exists`, and `isCreator` helpers. The admin displays rows returned by Jazz unless read advice explicitly denies them, and it hides write actions Jazz explicitly denies. Unknown advice does not deny local data or optimistic writes; Jazz remains the enforcement authority.

Collection `hooks` provide `beforeChange` / `afterChange` for create and update, and `beforeDelete` / `afterDelete` for deletes. A before hook can return a partial data patch or throw to stop the local mutation. After hooks run after the optimistic local write; they do not mean Jazz has accepted the write on the server. Use the generated `createBebopClient(db)` from app code as well as in the admin to run hooks consistently. Direct `db.insert`, `db.update`, and `db.delete` calls bypass Bebop hooks. The client exposes `onMutationError` for later Jazz sync rejections. Use trusted server code for security checks and external side effects that must be authoritative.

The client exposes `query`, `queryIds`, `find`, and `findById` for reads. List queries support filters, ordering, limits, and offsets. Mutation results say `durability: "local"` and provide `waitForGlobal()` when the caller needs confirmation. Admin list pages load bounded row windows from Jazz, plus document IDs for the total count. Text search currently scans the filtered collection in the client because the first version supports searching across multiple configured fields. Plan a dedicated indexed search/count adapter before using very large collections.

The admin uses shadcn/ui's Base UI components and the official Sera style with the Neutral palette and square corners. Its collection screens use compact Noto Sans text and headings. It follows the system color preference by default and honors `.light` or `.dark` on the document element. Its setup is in [`packages/admin/components.json`](./packages/admin/components.json). To add a component, run `pnpm dlx shadcn@latest add <component> -c packages/admin`; component source stays in `packages/admin/src/components/ui` and is bundled with the admin package.

The playground includes email and password authentication through Better Auth, using Jazz as its database adapter. Add `BETTER_AUTH_URL` and a private `BETTER_AUTH_SECRET` to `apps/playground/.env`; use [`apps/playground/.env.example`](./apps/playground/.env.example) as a template and generate a secret with `openssl rand -base64 32`. Then run `pnpm generate` to generate Better Auth's Jazz tables, and start the app with `pnpm dev`. Sign-up and sign-in open the corresponding Jazz account. Better Auth tables get deny-by-default client permissions; the playground's Workspaces, Workspace Memberships, and Tasks permissions remain open for experimentation.

When enabling Better Auth in another Bebop config, install compatible `better-auth` and `auth` CLI packages, add `auth: betterAuth()` to the config, and provide an `auth-generate.ts` using `jazzAdapter` as in [`apps/playground/auth-generate.ts`](./apps/playground/auth-generate.ts). `bebop generate` runs the Better Auth schema generator before compiling the merged Jazz schema and permissions. `bebop dev` also watches `auth-options.ts` and the selected generator config. Runtime route and client wiring depend on the framework; the playground's [`auth.ts`](./apps/playground/auth.ts), [`vite.config.ts`](./apps/playground/vite.config.ts), and [`auth-client.ts`](./apps/playground/auth-client.ts) show the Vite and React setup.

You can also run the CLI commands directly in the playground workspace:

```sh
pnpm --filter @bebop/playground exec bebop generate
pnpm --filter @bebop/playground exec bebop validate
```

`bebop generate` supports `--config <path>` and `--out-dir <path>`. `bebop dev` accepts a custom server command after `--`; without one, it starts Vite on `127.0.0.1`.

`bebop dev` follows local config imports and checks them for changes twice a second, then regenerates in a fresh process so imported collection modules reload.

The Better Auth CLI requires Node.js 22.12 or newer. The workspace declares that version range.

The playground's three collections are deliberately open through `access: "public"`. The task author defaults to the signed-in user in the host UI, but the open demo policy does not prevent direct clients from supplying another author ID. Workspace membership records do not yet grant or restrict Jazz access. Better Auth tables remain denied to client sessions. Review collection access settings before deploying.

See the [implementation plan](./docs/implementation-plan.md) for the roadmap.
See [architecture notes](./docs/architecture.md) for the current package boundaries, write semantics, and the next security milestone.

The playground production type check and bundle can be run with `pnpm build`.
