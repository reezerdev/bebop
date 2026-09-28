import { defineConfig } from "@bebop/core";

export default defineConfig({
  collections: [{
    slug: "todos",
    labels: { singular: "Todo", plural: "Todos" },
    access: "public",
    admin: {
      useAsTitle: "title",
      defaultColumns: ["title", "completed", "dueAt"],
      listSearchableFields: ["title", "notes"],
    },
    fields: [
      { name: "title", type: "text", required: true },
      { name: "notes", type: "text", admin: { input: "textarea" } },
      { name: "completed", type: "checkbox", admin: { position: "sidebar" } },
      { name: "dueAt", type: "date", admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } } },
    ],
  }],
});
