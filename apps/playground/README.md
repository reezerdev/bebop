# Bebop playground

This app exercises the `@bebop/core` workspace package through its public API.

Add `BETTER_AUTH_URL=http://127.0.0.1:5173` and a private `BETTER_AUTH_SECRET` to `.env` (see `.env.example`; generate the secret with `openssl rand -base64 32`). Run `pnpm generate` from the workspace root to generate Better Auth's Jazz schema, `bebop-generated-schema.ts`, and `permissions.ts`.

Jazz tooling expects a root `schema.ts`, so Bebop keeps that file as a small re-export entry point for `bebop-generated-schema.ts`.

Start the playground with `pnpm dev`. The `bebop` CLI watches `bebop.config.ts`, `auth-options.ts`, and `auth-generate.ts` and regenerates on changes. The Jazz Vite plugin starts the local Jazz development server and watches those generated files. The playground signs users up and in with email and password; Jazz's React provider opens their Jazz account automatically.

The current Jazz dependency is pinned to `2.0.0-alpha.57`. Post permissions are open so the local demo is easy to try. Better Auth tables use generated deny-by-default permissions. Review all generated permissions before deploying.
