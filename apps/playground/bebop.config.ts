import { defineConfig, collection, text, select, checkbox, date, betterAuth } from "@bebop/core";

export default defineConfig({
  auth: betterAuth(),
  collections: {
    posts: collection({
      timestamps: true,
      fields: {
        title: text({ required: true }),
        body: text(),
        slug: text(),
        publishedAt: date(),
        published: checkbox(),
        category: select(["announcement", "guide", "story"] as const),
      },
    }),
  },
});
