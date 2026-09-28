# Bebop playground

This app exercises `@bebop/core` and mounts the first-party `@bebop/admin` package. The admin UI is owned by Bebop under `packages/admin`; the playground supplies a Vite host, Jazz provider, and Better Auth setup.

Add `BETTER_AUTH_URL=http://127.0.0.1:5173` and a private `BETTER_AUTH_SECRET` to `.env` (see `.env.example`; generate the secret with `openssl rand -base64 32`). Run `pnpm generate` from the workspace root to generate Better Auth's Jazz schema, `bebop-generated-schema.ts`, `bebop-generated-client.ts`, and `permissions.ts`.

Jazz tooling expects a root `schema.ts`, so Bebop keeps that file as a small re-export entry point for `bebop-generated-schema.ts`.

Start the workspace with `pnpm dev`, then open `http://127.0.0.1:5173/` for the simple tasks playground or `http://127.0.0.1:5173/admin` for Bebop's admin UI. The `bebop` CLI watches `bebop.config.ts`, `auth-options.ts`, and `auth-generate.ts` and regenerates the schema, permissions, and admin manifest on changes. The Jazz Vite plugin starts the local Jazz development server and watches those generated files. The playground signs users up and in with email and password; Jazz's React provider opens their Jazz account automatically.

Create a workspace first, then add tasks. The playground also creates an active admin membership for the signed-in user when it creates a workspace. The admin can edit Workspaces, Workspace Memberships, and Tasks directly. Each task's required `author` field is a relation to a Better Auth user and defaults to the signed-in user in the UI. Its authenticated `/api/bebop/users` endpoint returns only user IDs and names for the user selectors; Better Auth tables remain unreadable to browser Jazz clients. Jazz separately records the actual creator in `$createdBy`.

The current Jazz dependency is pinned to `2.0.0-alpha.57`. The three playground collections use `access: "public"` so the local demo is easy to try; workspace membership records do not yet enforce workspace access. Better Auth tables use generated deny-by-default permissions. The playground and admin use the generated Bebop mutation client so collection hooks run; direct Jazz mutations bypass those hooks. Review all configured access rules before deploying.

The local Jazz server database was reset when this demo changed from Posts to Tasks. The development app ID is now `bebop-tasks-playground`, which separates it from the previous browser cache. Existing Better Auth accounts in the old local server database were deleted; create a new account when you restart the playground. Historical migration files remain in the repository, but the new development app ID starts with an empty database.
