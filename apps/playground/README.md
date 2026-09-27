# Bebop playground

This app exercises `@bebop/core` and mounts the first-party `@bebop/admin` package. The admin UI is owned by Bebop under `packages/admin`; the playground supplies a Vite host, Jazz provider, and Better Auth setup.

Add `BETTER_AUTH_URL=http://127.0.0.1:5173` and a private `BETTER_AUTH_SECRET` to `.env` (see `.env.example`; generate the secret with `openssl rand -base64 32`). Run `pnpm generate` from the workspace root to generate Better Auth's Jazz schema, `bebop-generated-schema.ts`, and `permissions.ts`.

Jazz tooling expects a root `schema.ts`, so Bebop keeps that file as a small re-export entry point for `bebop-generated-schema.ts`.

Start the workspace with `pnpm dev`, then open `http://127.0.0.1:5173/admin`. The `bebop` CLI watches `bebop.config.ts`, `auth-options.ts`, and `auth-generate.ts` and regenerates the schema, permissions, and admin manifest on changes. The Jazz Vite plugin starts the local Jazz development server and watches those generated files. The playground signs users up and in with email and password; Jazz's React provider opens their Jazz account automatically.

Each post's required `author` field is a relation to a Better Auth user. The admin selects the signed-in user by default and lets editors choose another registered user. Its authenticated `/api/bebop/users` endpoint returns only user IDs and names for the selector; Better Auth tables remain unreadable to browser Jazz clients. Jazz separately records the actual creator in `$createdBy`.

Posts created before the user relationship are retained under **Legacy posts**, along with their previous text bylines. Jazz migrations cannot infer the correct user ID from a text byline. To make one of those records an authored post, copy its content into **Posts** and select the correct user. The two reviewed migration steps first rename the old table, then create the new posts table with a required user relation.

The current Jazz dependency is pinned to `2.0.0-alpha.57`. Post permissions are open so the local demo is easy to try. Better Auth tables use generated deny-by-default permissions. Review all generated permissions before deploying.
