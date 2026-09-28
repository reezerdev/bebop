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

## Uploads

Mark a collection as upload-enabled and point an upload field at it:

```ts
collection({
  slug: "media",
  upload: { mimeTypes: ["image/*"] },
  fields: [{ name: "alt", type: "text" }],
});

collection({
  slug: "tasks",
  fields: [{ name: "image", type: "upload", relationTo: "media" }],
});
```

`upload: true` accepts any file type. A collection can restrict types with `mimeTypes`; `config.upload.limits.fileSize` sets the maximum file size in bytes (20 MiB by default). Bebop generates `filename`, `mimeType`, and `filesize` metadata on upload collections. Upload fields store the related media document ID as `<field>Id` and stay optional unless marked `required`.

Use `client.media.create({ file, ...fields })`, `client.media.update(id, { file })` to replace a file, and `client.media.readFile(id)` to obtain a `Blob`. `file` accepts a browser `File` or another `Blob`; a Blob without a name is saved as `upload`. The client returns after a local Jazz write, with `waitForGlobal()` for later server confirmation. On the pinned Jazz alpha, Bebop stores file bytes in bounded Jazz byte rows and keeps those rows out of normal collection queries. Treat Jazz permissions as the authority for file access.

See the [Bebop repository](https://github.com/reezerdev/bebop) for the CLI, admin package, and examples.
