import { defineConfig, collection, text, select, checkbox, date, relation, betterAuth } from "@bebop/core";

export default defineConfig({
  auth: betterAuth(),
  collections: {
    posts: collection({
      timestamps: true,
      access: {
        read: () => ({}),
        create: () => ({}),
        update: () => ({}),
        delete: () => ({}),
      },
      admin: {
        label: "Posts",
        useAsTitle: "title",
        defaultColumns: ["title", "author", "published", "category"],
        listSearchableFields: ["title", "slug"],
      },
      fields: {
        title: text({ required: true }),
        author: relation("better_auth_user", { required: true, admin: { position: "sidebar" } }),
        body: text(),
        slug: text(),
        publishedAt: date({ admin: { position: "sidebar" } }),
        published: checkbox({ admin: { position: "sidebar" } }),
        category: select(["announcement", "guide", "story"] as const, { admin: { position: "sidebar" } }),
      },
    }),
  },
});
