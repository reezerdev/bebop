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

The admin package renders every collection and supported field kind from `bebop.config.ts`. Collection admin options include a label, title field, default columns, and searchable text fields. Its shadcn/ui components and compiled CSS are owned by `@bebop/admin`, so consuming apps do not need their own Tailwind setup. The host app provides the router, Jazz provider, authentication flow, signed-in user's name and email, and logout action. `BebopAdmin` also receives the generated Bebop client so admin writes run collection hooks.

Collection `access` rules compile to Jazz row-level permissions. Declare only the operations you intend to grant; omitted operations are denied. For example, an owner-only collection can return `{ ownerId: session.user.account }` from its `read`, `create`, `update`, and `delete` callbacks. Rules can use Jazz's `session`, `allOf`, `anyOf`, `exists`, and `isCreator` helpers. The playground explicitly grants all four operations on posts to keep its local demo open. The admin only displays rows after Jazz confirms read access and hides actions Jazz explicitly denies. Unknown write advice still allows an optimistic local attempt, and Jazz remains the enforcement authority.

Collection `hooks` provide `beforeChange` / `afterChange` for create and update, and `beforeDelete` / `afterDelete` for deletes. A before hook can return a partial data patch or throw to stop the local mutation. After hooks run after the optimistic local write; they do not mean Jazz has accepted the write on the server. Use the generated `createBebopClient(db)` from app code as well as in the admin to run hooks consistently. Direct `db.insert`, `db.update`, and `db.delete` calls bypass Bebop hooks. The client exposes `onMutationError` for later Jazz sync rejections. Use trusted server code for security checks and external side effects that must be authoritative.

The admin uses shadcn/ui's Base UI components and the official Sera style with the Neutral palette, Noto Sans body text, and Playfair Display headings. Sera uses square corners, tracked uppercase headings, and underlined inputs. It follows the system color preference by default and honors `.light` or `.dark` on the document element. Its setup is in [`packages/admin/components.json`](./packages/admin/components.json). To add a component, run `pnpm dlx shadcn@latest add <component> -c packages/admin`; component source stays in `packages/admin/src/components/ui` and is bundled with the admin package.

The playground includes email and password authentication through Better Auth, using Jazz as its database adapter. Add `BETTER_AUTH_URL` and a private `BETTER_AUTH_SECRET` to `apps/playground/.env`; use [`apps/playground/.env.example`](./apps/playground/.env.example) as a template and generate a secret with `openssl rand -base64 32`. Then run `pnpm generate` to generate Better Auth's Jazz tables, and start the app with `pnpm dev`. Sign-up and sign-in open the corresponding Jazz account. Better Auth tables get deny-by-default client permissions; the playground's post permissions remain open for experimentation.

When enabling Better Auth in another Bebop config, install compatible `better-auth` and `auth` CLI packages, add `auth: betterAuth()` to the config, and provide an `auth-generate.ts` using `jazzAdapter` as in [`apps/playground/auth-generate.ts`](./apps/playground/auth-generate.ts). `bebop generate` runs the Better Auth schema generator before compiling the merged Jazz schema and permissions. `bebop dev` also watches `auth-options.ts` and the selected generator config. Runtime route and client wiring depend on the framework; the playground's [`auth.ts`](./apps/playground/auth.ts), [`vite.config.ts`](./apps/playground/vite.config.ts), and [`auth-client.ts`](./apps/playground/auth-client.ts) show the Vite and React setup.

You can also run the CLI commands directly in the playground workspace:

```sh
pnpm --filter @bebop/playground exec bebop generate
pnpm --filter @bebop/playground exec bebop validate
```

`bebop generate` supports `--config <path>` and `--out-dir <path>`. `bebop dev` accepts a custom server command after `--`; without one, it starts Vite on `127.0.0.1`.

The Better Auth CLI requires Node.js 22.12 or newer. The workspace declares that version range.

The playground's posts are deliberately open through explicit access callbacks. Better Auth tables remain denied to client sessions. Review the configured access callbacks before deploying.

See the [implementation plan](./docs/implementation-plan.md) for the roadmap.

The playground production type check and bundle can be run with `pnpm build`.
