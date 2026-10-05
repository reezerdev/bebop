# Examples

Each directory in `examples/` is a standalone app with its own `package.json`. Copy one folder or download the repository ZIP and install its published dependencies with pnpm.

## Basic

`basic/` is a small React/Vite app that demonstrates `@bebopdev/core`, the `bebop` CLI, and `@bebopdev/admin` together. It needs Node.js 22.12 or newer and does not require Better Auth credentials.

From a downloaded copy of `examples/basic`:

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5174/` for the playground or `http://127.0.0.1:5174/admin` for Bebop Admin. The app generates its Jazz schema on startup and saves data locally in the browser.

To run the same example from the Bebop repository, use the root shortcut:

```sh
pnpm install
pnpm example
```

`pnpm example:check` type-checks the app against its published dependencies. `pnpm test:packages` checks the example against package tarballs built from the current source.
