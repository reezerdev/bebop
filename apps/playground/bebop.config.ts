import { collection, defineConfig } from "@bebopdev/core";

export default defineConfig({
  upload: { limits: { fileSize: 20 * 1024 * 1024 } },
  collections: [
    collection({
      slug: "users",
      auth: true,
      access: {
        admin: ({ req: { user, isAdmin } }) =>
          user.role?.split(",").some((role) => role.trim() === "admin") === true || isAdmin,
      },
      labels: { singular: "User", plural: "Users" },
      admin: {
        useAsTitle: "name",
        defaultColumns: ["name", "email", "role", "createdAt"],
        listSearchableFields: ["name", "email"],
      },
      fields: [],
    }),
    collection({
      slug: "media",
      labels: { singular: "Media", plural: "Media" },
      upload: { mimeTypes: ["image/*"] },
      timestamps: true,
      permissions: {
        read: ({ rule }) => rule.always(),
        insert: ({ rule }) => rule.always(),
        update: ({ rule }) => rule.always(),
        delete: ({ rule }) => rule.always(),
      },
      admin: { useAsTitle: "filename", defaultColumns: ["filename", "mimeType", "filesize"] },
      fields: [{ name: "alt", type: "text" }],
    }),
    collection({
      slug: "workspaces",
      labels: { singular: "Workspace", plural: "Workspaces" },
      timestamps: true,
      permissions: {
        read: ({ rule }) => rule.always(),
        insert: ({ rule }) => rule.always(),
        update: ({ rule }) => rule.always(),
        delete: ({ rule }) => rule.always(),
      },
      admin: {
        useAsTitle: "name",
        defaultColumns: ["name", "slug"],
        listSearchableFields: ["name", "slug"],
      },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        {
          name: "members",
          label: "Members",
          type: "join",
          collection: "workspaceMemberships",
          on: "workspace",
          admin: { defaultColumns: ["user", "workspace", "role", "status"] },
        },
      ],
    }),
    collection({
      slug: "workspaceMemberships",
      labels: { singular: "Workspace Membership", plural: "Workspace Memberships" },
      timestamps: true,
      writeMode: "command",
      permissions: {
        read: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
        insert: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
        update: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
        delete: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
      },
      admin: {
        useAsTitle: "user",
        defaultColumns: ["user", "workspace", "role", "status"],
      },
      fields: [
        { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
        { name: "user", type: "relationship", relationTo: "users", required: true },
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
    }),
    collection({
      slug: "tasks",
      labels: { singular: "Task", plural: "Tasks" },
      timestamps: true,
      permissions: {
        read: ({ rule, collections, session }) => rule.where((task) =>
          collections.workspaceMemberships.exists.where({
            workspaceId: task.workspaceId,
            userId: session.claims.sub,
            status: "active",
          }),
        ),
        insert: ({ rule, collections, session, allOf }) => rule.where((task) =>
          allOf([
            { authorId: session.claims.sub },
            collections.workspaceMemberships.exists.where({
              workspaceId: task.workspaceId,
              userId: session.claims.sub,
              status: "active",
            }),
          ]),
        ),
        update: ({ rule, collections, session, allOf, anyOf }) => rule
          .whereOld((task) => allOf([
            anyOf([{ authorId: session.claims.sub }, { assigneeId: session.claims.sub }]),
            collections.workspaceMemberships.exists.where({
              workspaceId: task.workspaceId,
              userId: session.claims.sub,
              status: "active",
            }),
          ]))
          .whereNew((task) => allOf([
            anyOf([{ authorId: session.claims.sub }, { assigneeId: session.claims.sub }]),
            collections.workspaceMemberships.exists.where({
              workspaceId: task.workspaceId,
              userId: session.claims.sub,
              status: "active",
            }),
          ])),
        delete: ({ rule, collections, session, allOf }) => rule.where((task) => allOf([
          { authorId: session.claims.sub },
          collections.workspaceMemberships.exists.where({
            workspaceId: task.workspaceId,
            userId: session.claims.sub,
            status: "active",
          }),
        ])),
      },
      admin: {
        useAsTitle: "name",
        defaultColumns: ["name", "workspace", "status", "assignee", "dueAt"],
        listSearchableFields: ["name", "content"],
      },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "workspace", type: "relationship", relationTo: "workspaces", admin: { position: "sidebar" } },
        { name: "content", type: "text", admin: { input: "textarea" } },
        { name: "image", type: "upload", relationTo: "media" },
        { name: "priority", type: "select", options: [
          { label: "Low", value: "low" },
          { label: "Medium", value: "medium" },
          { label: "High", value: "high" },
          { label: "Urgent", value: "urgent" },
        ], admin: { position: "sidebar" } },
        { name: "parentTask", type: "relationship", relationTo: "tasks", admin: { position: "sidebar" } },
        { name: "author", type: "relationship", relationTo: "users", required: true, admin: { position: "sidebar" } },
        { name: "status", type: "select", options: [
          { label: "Backlog", value: "backlog" },
          { label: "To Do", value: "todo" },
          { label: "In Progress", value: "in-progress" },
          { label: "In Review", value: "in-review" },
          { label: "Done", value: "done" },
        ], admin: { position: "sidebar" } },
        { name: "assignee", type: "relationship", relationTo: "users", admin: { position: "sidebar" } },
        { name: "dueAt", type: "date", admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } } },
        { name: "archivedAt", type: "date", admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } } },
      ],
    }),
  ],
});
