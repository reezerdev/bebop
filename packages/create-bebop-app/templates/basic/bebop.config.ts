import { defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [{
    slug: "todos",
    labels: { singular: "Todo", plural: "Todos" },
    permissions: {
      read: ({ rule }) => rule.always(),
      insert: ({ rule }) => rule.always(),
      update: ({ rule }) => rule.always(),
      delete: ({ rule }) => rule.always(),
    },
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
