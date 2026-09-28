import { defineConfig, betterAuth } from "@bebop/core";

export default defineConfig({
  auth: betterAuth(),
  collections: [{
    slug: "posts",
    labels: { singular: "Post", plural: "Posts" },
    timestamps: true,
    access: "public",
    admin: {
      useAsTitle: "title",
      defaultColumns: ["title", "author", "published", "category"],
      listSearchableFields: ["title", "slug"],
    },
    fields: [
      { name: "title", type: "text", required: true },
      { name: "author", type: "relationship", relationTo: "better_auth_user", required: true, admin: { position: "sidebar" } },
      { name: "body", type: "text" },
      { name: "slug", type: "text" },
      { name: "publishedAt", type: "date", admin: { position: "sidebar" } },
      { name: "published", type: "checkbox", admin: { position: "sidebar" } },
      { name: "category", type: "select", options: ["announcement", "guide", "story"], admin: { position: "sidebar" } },
    ],
  }],
});
