# Bebop playground

This app exercises `@bebop/core` and mounts the first-party `@bebop/admin` package. The admin UI is owned by Bebop under `packages/admin`; the playground supplies a Vite host, Jazz provider, and Better Auth setup.

Add `BETTER_AUTH_URL=http://127.0.0.1:5173` and a private `BETTER_AUTH_SECRET` to `.env` (see `.env.example`; generate the secret with `openssl rand -base64 32`). Run `pnpm generate` from the workspace root to generate Better Auth's Jazz schema, `bebop-generated-schema.ts`, `bebop-generated-client.ts`, and `permissions.ts`.

Jazz tooling expects a root `schema.ts`, so Bebop keeps that file as a small re-export entry point for `bebop-generated-schema.ts`.

Start the workspace with `pnpm dev`, then open `http://127.0.0.1:5173/` for the simple posts playground or `http://127.0.0.1:5173/admin` for Bebop's admin UI. The `bebop` CLI watches `bebop.config.ts`, `auth-options.ts`, and `auth-generate.ts` and regenerates the schema, permissions, and admin manifest on changes. The Jazz Vite plugin starts the local Jazz development server and watches those generated files. The playground signs users up and in with email and password; Jazz's React provider opens their Jazz account automatically.

Each post's required `author` field is a relation to a Better Auth user. The admin selects the signed-in user by default and lets editors choose another registered user. Its authenticated `/api/bebop/users` endpoint returns only user IDs and names for the selector; Better Auth tables remain unreadable to browser Jazz clients. Jazz separately records the actual creator in `$createdBy`.

The current Jazz dependency is pinned to `2.0.0-alpha.57`. Posts use `access: "public"` so the local demo is easy to try. Better Auth tables use generated deny-by-default permissions. The playground and admin use the generated Bebop mutation client so collection hooks run; direct Jazz mutations bypass those hooks. Review all configured access rules before deploying.
