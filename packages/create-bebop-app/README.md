# create-bebop-app

Scaffold a pnpm and Turborepo monorepo with a TanStack Start web app and an Expo React Native app.

## Usage

Install pnpm 12.6.0 or newer, then run:

```sh
npm create @bebopdev/bebop-app@beta my-app
cd my-app
pnpm dev
```

You can also use npx @bebopdev/create-bebop-app@beta my-app. The generator installs dependencies with pnpm; pass --no-install to create the files without installing them.

The starter puts the Bebop config, generated Jazz schema, typed client, and admin manifest in apps/web. It serves the simple playground at / and Bebop Admin at /admin. apps/mobile is an Expo native app using the same schema and client. The apps run from a single pnpm workspace and are orchestrated with Turborepo.

Jazz uses its native module on iOS and Android, so Expo Go is not supported. Use pnpm ios or pnpm android to create and launch a development build.

## Options

```text
create-bebop-app [directory] [--no-install]
```
