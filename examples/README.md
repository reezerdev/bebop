# Examples

## Basic

`basic/` is a small consumer app for trying Bebop before publishing packages to npm. It exercises `@bebop/core` configuration and generated client, `@bebop/cli` schema generation, and `@bebop/admin` in a separate React/Vite app.

The example is included in the pnpm workspace and uses `workspace:*`, so it tests the current local package code without requiring an npm account or registry release. It does not yet verify a packed tarball or a published semver install.

From the repository root:

```sh
pnpm install
pnpm --filter @bebop/admin build
pnpm --filter @bebop/example-basic generate
pnpm --filter @bebop/example-basic dev
```

Open `http://127.0.0.1:5174/` for the consumer app or `http://127.0.0.1:5174/admin` for Bebop Admin. Jazz runs locally with its own app ID and database directory. The example starts with a local-first account and needs no Better Auth setup.

`pnpm example` is a root shortcut for starting the app. `pnpm example:check` type-checks the consumer. Once package tarballs are buildable, this app can be used with `pnpm pack` tarballs by replacing the workspace dependency references with local `.tgz` files; after publication, replace them with registry versions.
