# create-bebop-app

Scaffold a small React/Vite app with Bebop, Jazz, and Bebop Admin.

## Usage

```sh
npm create @bebopdev/bebop-app@beta my-app
cd my-app
npm run dev
```

You can also run `npx @bebopdev/create-bebop-app@beta my-app`. The generator uses npm by default. Pass `--use-pnpm` to install with pnpm, or `--no-install` to create the files without installing dependencies.

The starter includes a sample collection, generated Jazz schema and permissions, the Bebop CLI, a simple playground at `/`, and Bebop Admin at `/admin`. It uses Jazz's local development server, so no database server or environment variables are needed.

## Options

```text
create-bebop-app [directory] [--use-npm | --use-pnpm] [--no-install]
```
