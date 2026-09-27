import { defineConfig, collection, text, select, checkbox } from "@bebop/core";

export default defineConfig({
  collections: {
    posts: collection({
      fields: {
        title: text({ required: true }),
        body: text(),
        slug: text(),
        published: checkbox(),
        category: select(["announcement", "guide", "story"] as const),
      },
    }),
  },
});
