# @bebopdev/core

Payload-style collection configuration, schema compilation, and a typed client for Jazz.

```sh
pnpm add @bebopdev/core jazz-tools
```

Define collections with Payload-compatible field objects, then use `defineConfig` to create the config consumed by `bebop dev`:

```ts
import { collection, defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [
    collection({
      slug: "posts",
      labels: { singular: "Post", plural: "Posts" },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "publishedAt", type: "date" },
      ],
    }),
  ],
});
```

`@bebopdev/cli` reads this config to generate the Jazz schema and admin manifest. The exported `createBebopClient` factory provides typed queries and lifecycle-aware create, update, and delete methods. Lifecycle hooks run in the client; use trusted server code for authoritative side effects.

See the [Bebop repository](https://github.com/reezerdev/bebop) for the CLI, admin package, and examples.
