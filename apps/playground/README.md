# Bebop playground

This app exercises the `@bebop/core` workspace package through its public API.

Run it from the workspace root with `pnpm dev`. The `bebop` CLI generates `schema.ts` and `permissions.ts` from `bebop.config.ts` before starting Vite, then watches the config and regenerates on changes. The Jazz Vite plugin starts the local Jazz development server and watches those generated files.

The current Jazz dependency is pinned to `2.0.0-alpha.57`. Generated permissions are open so the local demo is easy to try. Do not deploy them as-is.
