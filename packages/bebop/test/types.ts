import { collection, defineConfig, select, text } from "../src/bebop.ts";
import type { BebopClient } from "../src/client.ts";

const config = defineConfig({
  collections: {
    posts: collection({
      fields: {
        title: text({ required: true }),
        status: select(["draft", "published"]),
      },
    }),
  },
});

declare const client: BebopClient<typeof config>;

if (false) {
  void client.posts.create({ title: "Hello", status: "draft" });
  void client.posts.query({ where: { status: { eq: "published" } }, limit: 10 });

  // @ts-expect-error Required title is missing.
  void client.posts.create({ status: "draft" });
  // @ts-expect-error Select values retain their configured literals.
  void client.posts.create({ title: "Hello", status: "archived" });
  // @ts-expect-error Query predicates use the field's value type.
  void client.posts.query({ where: { title: 42 } });
  // @ts-expect-error Unknown fields cannot be queried.
  void client.posts.query({ where: { missing: "x" } });
  // @ts-expect-error Unknown collections are absent from the client.
  void client.comments.find();
}
