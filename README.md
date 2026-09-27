# Bebop

Bebop is a schema-driven CMS prototype compiled onto Jazz. This pnpm workspace separates the app used for experimentation from the package that defines the Bebop API.

## Structure

```text
apps/
  playground/     React app and Bebop config
packages/
  bebop/          Config DSL and Jazz schema compiler
docs/             Product and architecture notes
examples/         Reserved for standalone examples
```

## Start the playground

```sh
pnpm install
pnpm dev
```

The root scripts use Turborepo to run workspace tasks. Vite starts a local Jazz development server and deploys the generated schema and permissions there. The app uses a local-first account, so you can create posts without credentials or a Jazz Cloud connection.

Edit [`apps/playground/bebop.config.ts`](./apps/playground/bebop.config.ts) to change the collection. `pnpm dev` generates the schema before starting Vite and watches the config file, so edits regenerate the Jazz schema and permissions automatically. The Jazz Vite plugin starts the local Jazz server and picks up those generated files.

You can also run the CLI commands directly in the playground workspace:

```sh
pnpm --filter @bebop/playground exec bebop generate
pnpm --filter @bebop/playground exec bebop validate
```

`bebop generate` supports `--config <path>` and `--out-dir <path>`. `bebop dev` accepts a custom server command after `--`; without one, it starts Vite on `127.0.0.1`.

Run the app's production type check and bundle with `pnpm build`.

The generated permissions allow every operation for this local playground. Review and replace those grants before adding a sync server or deploying.

See the [implementation plan](./docs/implementation-plan.md) for the roadmap.
