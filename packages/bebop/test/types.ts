import { collection, defineConfig } from "../src/bebop.ts";
import type { BebopClient } from "../src/client.ts";

const config = defineConfig({
  collections: [{
    slug: "posts",
    fields: [
      { name: "title", type: "text", required: true },
      { name: "status", type: "select", options: ["draft", "published"] },
      { name: "stage", type: "select", options: [{ label: "Ready", value: "ready" }, "blocked"] },
      { name: "author", type: "relationship", relationTo: "users" },
    ],
  }],
});

declare const client: BebopClient<typeof config>;

const ownedConfig = defineConfig({
  collections: [collection({
    slug: "ownedPosts",
    fields: [{ name: "ownerId", type: "text", required: true }],
    access: {
      read: ({ row }) => {
        return { ownerId: row.ownerId };
      },
    },
    hooks: {
      beforeChange: ({ data }) => {
        const ownerId: string | undefined = data.ownerId;
        // @ts-expect-error Hook data only contains configured fields.
        void data.missing;
        return { ownerId };
      },
    },
  })],
});

declare const ownedClient: BebopClient<typeof ownedConfig>;
if (false) {
  void ownedClient.ownedPosts.create({ ownerId: "user-1" });
  // @ts-expect-error Required ownerId is missing.
  void ownedClient.ownedPosts.create({});
}

if (false) {
  void client.posts.create({ title: "Hello", status: "draft" });
  void client.posts.query({ where: { status: { eq: "published" } }, limit: 10 });
  void client.posts.query({ where: { authorId: "user-1" } });
  void client.posts.create({ title: "Hello", stage: "ready" });

  // @ts-expect-error Required title is missing.
  void client.posts.create({ status: "draft" });
  // @ts-expect-error Select values retain their configured literals.
  void client.posts.create({ title: "Hello", status: "archived" });
  // @ts-expect-error Object select options retain their configured values.
  void client.posts.create({ title: "Hello", stage: "unknown" });
  // @ts-expect-error Query predicates use the field's value type.
  void client.posts.query({ where: { title: 42 } });
  // @ts-expect-error Unknown fields cannot be queried.
  void client.posts.query({ where: { missing: "x" } });
  // @ts-expect-error Relationship storage is exposed as authorId, not author.
  void client.posts.query({ where: { author: "user-1" } });
  // @ts-expect-error Unknown collections are absent from the client.
  void client.comments.find();
}
