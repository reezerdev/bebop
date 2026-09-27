import { defineConfig, collection, text, select, checkbox, date, relation, betterAuth } from "@bebop/core";

export default defineConfig({
  auth: betterAuth(),
  collections: {
    posts: collection({
      timestamps: true,
      admin: {
        label: "Posts",
        useAsTitle: "title",
        defaultColumns: ["title", "author", "published", "category"],
        listSearchableFields: ["title", "slug"],
      },
      fields: {
        title: text({ required: true }),
        author: relation("better_auth_user", { required: true }),
        body: text(),
        slug: text(),
        publishedAt: date(),
        published: checkbox(),
        category: select(["announcement", "guide", "story"] as const),
      },
    }),
    legacyPosts: collection({
      timestamps: true,
      admin: {
        label: "Legacy posts",
        useAsTitle: "title",
        defaultColumns: ["title", "author", "published", "category"],
        listSearchableFields: ["title", "slug", "author"],
      },
      fields: {
        title: text({ required: true }),
        author: text({ required: true }),
        body: text(),
        slug: text(),
        publishedAt: date(),
        published: checkbox(),
        category: select(["announcement", "guide", "story"] as const),
      },
    }),
  },
});
