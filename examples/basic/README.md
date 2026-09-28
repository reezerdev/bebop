# Bebop Basic Example

A standalone React/Vite app showing a Bebop collection, the generated Jazz client, and Bebop Admin.

## Run it

Requirements: Node.js 22.12 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Open <http://127.0.0.1:5174/> for the playground and <http://127.0.0.1:5174/admin> for the admin UI. The `bebop dev` command generates the schema files from `bebop.config.ts` before starting Vite. Data is stored locally by Jazz; no database server, account, or environment variables are required.

To change the example collection, edit `bebop.config.ts`. The admin uses its `labels`, `admin.useAsTitle`, and field settings to build the collection list and editor. Use `pnpm exec bebop generate` and `pnpm exec bebop validate` to generate and validate without starting the server.
