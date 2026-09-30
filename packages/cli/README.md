# @bebopdev/cli

The `bebop` command generates Jazz artifacts from a Bebop config and runs a schema-watching development server.

## Install

```sh
pnpm add -D @bebopdev/cli
pnpm add @bebopdev/core jazz-tools
```

The CLI currently requires Node.js 22.12 or newer and targets `jazz-tools@2.0.0-alpha.57`.

## Commands

```sh
pnpm exec bebop generate
pnpm exec bebop validate
pnpm exec bebop dev -- vite
```

`generate` writes `bebop-generated-schema.ts`, `bebop-admin-manifest.ts`, `bebop-generated-client.ts`, Jazz's `schema.ts` entry point, `permissions.ts`, and `bebop-generated-command-permissions.ts` beside `bebop.config.ts`. The regular permissions file is the deployable policy. The command permissions file is a reference artifact; it cannot override the deployed policy's direct-write denial. Command handlers require a trusted server `authorize` callback. `dev` watches the config and regenerates those files before restarting the supplied server command.

Pass `--config <path>` to select another config or `--out-dir <path>` to choose a generated-file directory. Run `pnpm exec bebop --help` for usage.

See the [repository README](https://github.com/reezerdev/bebop#readme) for a complete setup example.
