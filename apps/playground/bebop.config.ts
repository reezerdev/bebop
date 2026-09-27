import { checkbox, collection, defineConfig, select, text } from "@bebop/core";

export default defineConfig({
  collections: {
    posts: collection({
      fields: {
        title: text({ required: true }),
        body: text(),
        published: checkbox(),
        category: select(["announcement", "guide", "story"] as const),
      },
    }),
  },
});
