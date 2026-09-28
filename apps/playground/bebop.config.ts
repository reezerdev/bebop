import { defineConfig, betterAuth } from "@bebop/core";

export default defineConfig({
  auth: betterAuth(),
  collections: [
    {
      slug: "workspaces",
      labels: { singular: "Workspace", plural: "Workspaces" },
      timestamps: true,
      access: "public",
      admin: {
        useAsTitle: "name",
        defaultColumns: ["name", "slug"],
        listSearchableFields: ["name", "slug"],
      },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
      ],
    },
    {
      slug: "workspaceMemberships",
      labels: { singular: "Workspace Membership", plural: "Workspace Memberships" },
      timestamps: true,
      access: "public",
      admin: {
        useAsTitle: "user",
        defaultColumns: ["user", "workspace", "role", "status"],
      },
      fields: [
        { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
        { name: "user", type: "relationship", relationTo: "better_auth_user", required: true },
        { name: "role", type: "select", required: true, options: [
          { label: "Admin", value: "admin" },
          { label: "Manager", value: "manager" },
          { label: "Member", value: "member" },
          { label: "Guest", value: "guest" },
        ] },
        { name: "status", type: "select", required: true, options: [
          { label: "Active", value: "active" },
          { label: "Pending", value: "pending" },
          { label: "Deactivated", value: "deactivated" },
        ] },
      ],
    },
    {
      slug: "tasks",
      labels: { singular: "Task", plural: "Tasks" },
      timestamps: true,
      access: "public",
      admin: {
        useAsTitle: "name",
        defaultColumns: ["name", "workspace", "status", "assignee", "dueAt"],
        listSearchableFields: ["name", "content"],
      },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "workspace", type: "relationship", relationTo: "workspaces", admin: { position: "sidebar" } },
        { name: "content", type: "text", admin: { input: "textarea" } },
        { name: "priority", type: "select", options: [
          { label: "Low", value: "low" },
          { label: "Medium", value: "medium" },
          { label: "High", value: "high" },
          { label: "Urgent", value: "urgent" },
        ], admin: { position: "sidebar" } },
        { name: "parentTask", type: "relationship", relationTo: "tasks", admin: { position: "sidebar" } },
        { name: "author", type: "relationship", relationTo: "better_auth_user", required: true, admin: { position: "sidebar" } },
        { name: "status", type: "select", options: [
          { label: "Backlog", value: "backlog" },
          { label: "To Do", value: "todo" },
          { label: "In Progress", value: "in-progress" },
          { label: "In Review", value: "in-review" },
          { label: "Done", value: "done" },
        ], admin: { position: "sidebar" } },
        { name: "assignee", type: "relationship", relationTo: "better_auth_user", admin: { position: "sidebar" } },
        { name: "dueAt", type: "date", admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } } },
        { name: "archivedAt", type: "date", admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
  ],
});
