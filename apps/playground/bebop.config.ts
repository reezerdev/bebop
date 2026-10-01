import { defineConfig, type CollectionDefinition } from "@bebopdev/core";

const channelsFields = [
  { name: "name", type: "text", required: true },
  { name: "workspace", type: "relationship", relationTo: "workspaces", required: true, admin: { position: "sidebar" } },
  { name: "content", type: "text", admin: { input: "textarea" } },
  { name: "author", type: "relationship", relationTo: "users", required: true, admin: { position: "sidebar" } },
  { name: "visibility", type: "select", required: true, options: ["public", "private"] },
  { name: "stream", type: "relationship", relationTo: "streams", required: true, admin: { position: "main", readOnly: true } },
] as const;
const streamsFields = [
  { name: "name", type: "text", required: true },
  { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
  { name: "author", type: "relationship", relationTo: "users", required: true },
  { name: "members", type: "join", collection: "streamMemberships", on: "stream" },
  { name: "entries", type: "join", collection: "entries", on: "stream" },
  { name: "channels", type: "join", collection: "channels", on: "stream" },
] as const;
const streamMembershipsFields = [
  { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
  { name: "stream", type: "relationship", relationTo: "streams", required: true },
  { name: "user", type: "relationship", relationTo: "users", required: true },
  { name: "role", type: "select", required: true, options: ["admin", "member"] },
] as const;
const entriesFields = [
  { name: "stream", type: "relationship", relationTo: "streams", required: true },
  { name: "type", type: "select", required: true, options: ["message", "comment", "update", "system"] },
  { name: "content", type: "text", required: true, admin: { input: "textarea" } },
  { name: "author", type: "relationship", relationTo: "users", required: true },
  { name: "parentEntry", type: "relationship", relationTo: "entries" },
] as const;

export default defineConfig({
  logging: { hooks: true },
  upload: { limits: { fileSize: 20 * 1024 * 1024 } },
  collections: [
    {
      slug: "users" as const,
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
      fields: [
        { name: "username", label: "Username", type: "text" },
        { name: "gender", label: "Gender", type: "text", admin: { input: "select", options: [
          { label: "Male", value: "male" },
          { label: "Female", value: "female" },
          { label: "Not specified", value: "unspecified" },
        ] } },
        { name: "mode", label: "Mode", type: "select", options: [
          { label: "Light", value: "light" },
          { label: "Dark", value: "dark" },
        ] },
        { name: "language", label: "Language", type: "select", options: [
          { label: "English", value: "en" },
          { label: "Spanish", value: "es" },
        ] },
        { name: "firstName", label: "First name", type: "text" },
        { name: "lastName", label: "Last name", type: "text" },
        { name: "position", label: "Position", type: "text" },
        { name: "image", label: "Image", type: "upload", relationTo: "media" },
      ],
    },
    {
      slug: "media" as const,
      labels: { singular: "Media", plural: "Media" },
      upload: { mimeTypes: ["image/*"] },
      timestamps: true,
      permissions: {
        read: ({ rule }) => rule.always(),
        insert: ({ rule, session }) => rule.where(session.where({ authMode: { in: ["external", "local-first"] } })),
        update: ({ rule, isCreator }) => rule.where(isCreator),
        delete: ({ rule, isCreator }) => rule.where(isCreator),
      },
      admin: { useAsTitle: "filename", defaultColumns: ["filename", "mimeType", "filesize"] },
      fields: [{ name: "alt", type: "text" }],
    },
    {
      slug: "workspaces" as const,
      labels: { singular: "Workspace", plural: "Workspaces" },
      timestamps: true,
      writeMode: "command",
      permissions: {
        read: ({ rule, collections, session }) => rule.where((workspace) => collections.workspaceMemberships.exists.where({
          workspaceId: workspace.id,
          userId: session.claims.sub,
          status: "active",
        })),
        insert: ({ rule }) => rule.never(),
        update: ({ rule, collections, session }) => {
          const activeWorkspaceAdmin = (workspaceId: unknown) => collections.workspaceMemberships.exists.where({
            workspaceId,
            userId: session.claims.sub,
            status: "active",
            role: "admin",
          });
          rule.whereOld((workspace) => activeWorkspaceAdmin(workspace.id));
          rule.whereNew((workspace) => activeWorkspaceAdmin(workspace.id));
        },
        delete: ({ rule }) => rule.never(),
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
    },
    {
      slug: "workspaceMemberships" as const,
      labels: { singular: "Workspace Membership", plural: "Workspace Memberships" },
      timestamps: true,
      writeMode: "command",
      permissions: {
        read: ({ rule, collections, session, allOf, anyOf }) => rule.where((membership) => anyOf([
          { userId: session.claims.sub },
          allOf([
            { status: "active" },
            collections.workspaceMemberships.exists.where({
              workspaceId: membership.workspaceId,
              userId: session.claims.sub,
              status: "active",
            }),
          ]),
          session.where({ "claims.role": "admin" }),
          session.where({ "claims.bebopAdmin": true }),
        ])),
      },
      admin: {
        useAsTitle: ["workspace", "user"],
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
    },
    {
      slug: "channels" as const,
      labels: { singular: "Channel", plural: "Channels" },
      timestamps: true,
      permissions: {
        read: ({ rule, collections, session, allOf, anyOf }) => {
          const userId = session.claims.sub;
          const manager = (workspaceId: unknown) => anyOf([
            collections.workspaceMemberships.exists.where({ workspaceId, userId, status: "active", role: "admin" }),
            collections.workspaceMemberships.exists.where({ workspaceId, userId, status: "active", role: "manager" }),
          ]);
          rule.where((channel) => allOf([
            collections.workspaceMemberships.exists.where({ workspaceId: channel.workspaceId, userId, status: "active" }),
            anyOf([
              { visibility: "public" },
              manager(channel.workspaceId),
              collections.streamMemberships.exists.where({ streamId: channel.streamId, userId }),
            ]),
          ]));
        },
        insert: ({ rule, collections, session, allOf }) => {
          const userId = session.claims.sub;
          rule.where((channel) => allOf([
            { authorId: userId },
            collections.workspaceMemberships.exists.where({ workspaceId: channel.workspaceId, userId, status: "active" }),
            collections.streams.exists.where({ id: channel.streamId, workspaceId: channel.workspaceId, authorId: userId }),
            collections.streamMemberships.exists.where({ streamId: channel.streamId, userId, role: "admin" }),
          ]));
        },
        update: ({ rule, collections, session, allOf, anyOf }) => {
          const userId = session.claims.sub;
          const activeMember = (workspaceId: unknown) => collections.workspaceMemberships.exists.where({
            workspaceId,
            userId,
            status: "active",
          });
          const manager = (workspaceId: unknown) => anyOf([
            collections.workspaceMemberships.exists.where({ workspaceId, userId, status: "active", role: "admin" }),
            collections.workspaceMemberships.exists.where({ workspaceId, userId, status: "active", role: "manager" }),
          ]);
          const streamAdmin = (streamId: unknown) => anyOf([
            collections.streamMemberships.exists.where({ streamId, userId, role: "admin" }),
          ]);
          const canEdit = (channel: { id: unknown; workspaceId: unknown; streamId?: unknown }) => allOf([
            activeMember(channel.workspaceId),
            anyOf([manager(channel.workspaceId), streamAdmin(channel.streamId)]),
          ]);
          rule.whereOld(canEdit).whereNew((channel) => allOf([
            canEdit(channel),
            collections.channels.exists.where({ id: channel.id, workspaceId: channel.workspaceId, streamId: channel.streamId }),
          ]));
        },
        delete: ({ rule, collections, session, allOf }) => {
          const userId = session.claims.sub;
          rule.where((channel) => allOf([
            collections.workspaceMemberships.exists.where({ workspaceId: channel.workspaceId, userId, status: "active" }),
            collections.streamMemberships.exists.where({ streamId: channel.streamId, userId, role: "admin" }),
          ]));
        },
      },
      admin: { useAsTitle: "name", defaultColumns: ["name", "workspace", "visibility", "stream"] },
      fields: channelsFields,
    } satisfies CollectionDefinition<typeof channelsFields>,
    {
      slug: "streams" as const,
      labels: { singular: "Stream", plural: "Streams" },
      timestamps: true,
      permissions: {
        read: ({ rule, collections, session, allOf, anyOf }) => {
          const userId = session.claims.sub;
          const activeMember = (workspaceId: unknown) => collections.workspaceMemberships.exists.where({ workspaceId, userId, status: "active" });
          const manager = (workspaceId: unknown) => anyOf([
            collections.workspaceMemberships.exists.where({ workspaceId, userId, status: "active", role: "admin" }),
            collections.workspaceMemberships.exists.where({ workspaceId, userId, status: "active", role: "manager" }),
          ]);
          const streamMember = (streamId: unknown) => collections.streamMemberships.exists.where({ streamId, userId });
          const publicEntity = (streamId: unknown) => collections.channels.exists.where({ streamId, visibility: "public" });
          rule.where((stream) => allOf([
            activeMember(stream.workspaceId),
            anyOf([streamMember(stream.id), manager(stream.workspaceId), publicEntity(stream.id)]),
          ]));
        },
        insert: ({ rule, collections, session, allOf }) => {
          const userId = session.claims.sub;
          rule.where((stream) => allOf([
            { authorId: userId },
            collections.workspaceMemberships.exists.where({ workspaceId: stream.workspaceId, userId, status: "active" }),
          ]));
        },
        update: ({ rule, collections, session, allOf, anyOf }) => {
          const userId = session.claims.sub;
          const activeMember = (workspaceId: unknown) => collections.workspaceMemberships.exists.where({
            workspaceId,
            userId,
            status: "active",
          });
          const admin = (streamId: unknown) => anyOf([
            collections.streamMemberships.exists.where({ streamId, userId, role: "admin" }),
          ]);
          const canEdit = (stream: { id: unknown; workspaceId: unknown }) => allOf([
            activeMember(stream.workspaceId),
            admin(stream.id),
          ]);
          rule.whereOld(canEdit).whereNew((stream) => allOf([
            canEdit(stream),
            collections.streams.exists.where({ id: stream.id, workspaceId: stream.workspaceId, authorId: stream.authorId }),
          ]));
        },
        delete: ({ rule, collections, session, allOf }) => {
          const userId = session.claims.sub;
          rule.where((stream) => allOf([
            collections.workspaceMemberships.exists.where({ workspaceId: stream.workspaceId, userId, status: "active" }),
            collections.streamMemberships.exists.where({ streamId: stream.id, userId, role: "admin" }),
          ]));
        },
      },
      admin: { useAsTitle: "name", defaultColumns: ["name", "workspace", "author"] },
      fields: streamsFields,
    } satisfies CollectionDefinition<typeof streamsFields>,
    {
      slug: "streamMemberships" as const,
      labels: { singular: "Stream Membership", plural: "Stream Memberships" },
      timestamps: true,
      permissions: {
        read: ({ rule, collections, session, anyOf, allowedTo }) => {
          const userId = session.claims.sub;
          rule.where((membership) => anyOf([
            { userId },
            collections.streamMemberships.exists.where({ streamId: membership.streamId, userId, role: "admin" }),
            collections.streams.exists.where({ id: membership.streamId, authorId: userId }),
            allowedTo.read("stream"),
          ]));
        },
        insert: ({ rule, collections, session, allOf, anyOf }) => {
          const userId = session.claims.sub;
          const streamMatchesWorkspace = (membership: { streamId: unknown; workspaceId: unknown }) => collections.streams.exists.where({
            id: membership.streamId,
            workspaceId: membership.workspaceId,
          });
          const canJoinReadableChannel = (membership: { streamId: unknown; workspaceId: unknown }) => allOf([
            { userId, role: "member" },
            streamMatchesWorkspace(membership),
            collections.workspaceMemberships.exists.where({ workspaceId: membership.workspaceId, userId, status: "active" }),
            collections.channels.exists.where({ streamId: membership.streamId, workspaceId: membership.workspaceId }),
            anyOf([
              collections.channels.exists.where({ streamId: membership.streamId, workspaceId: membership.workspaceId, visibility: "public" }),
              collections.workspaceMemberships.exists.where({ workspaceId: membership.workspaceId, userId, status: "active", role: "admin" }),
              collections.workspaceMemberships.exists.where({ workspaceId: membership.workspaceId, userId, status: "active", role: "manager" }),
            ]),
          ]);
          rule.where((membership) => anyOf([
            allOf([
              { userId, role: "admin" },
              collections.streams.exists.where({ id: membership.streamId, workspaceId: membership.workspaceId, authorId: userId }),
            ]),
            allOf([
              streamMatchesWorkspace(membership),
              collections.streamMemberships.exists.where({ streamId: membership.streamId, userId, role: "admin" }),
            ]),
            canJoinReadableChannel(membership),
          ]));
        },
        update: ({ rule, collections, session, allOf, anyOf }) => {
          const userId = session.claims.sub;
          const admin = (streamId: unknown) => anyOf([
            collections.streamMemberships.exists.where({ streamId, userId, role: "admin" }),
          ]);
          const canEdit = (membership: { id: unknown; streamId: unknown }) => admin(membership.streamId);
          rule.whereOld(canEdit).whereNew((membership) => allOf([
            canEdit(membership),
            collections.streamMemberships.exists.where({ id: membership.id, streamId: membership.streamId, workspaceId: membership.workspaceId }),
          ]));
        },
        delete: ({ rule, collections, session, anyOf }) => {
          const userId = session.claims.sub;
          rule.where((membership) => anyOf([
            collections.streamMemberships.exists.where({ streamId: membership.streamId, userId, role: "admin" }),
          ]));
        },
      },
      admin: { useAsTitle: "user", defaultColumns: ["user", "stream", "workspace", "role"] },
      fields: streamMembershipsFields,
    } satisfies CollectionDefinition<typeof streamMembershipsFields>,
    {
      slug: "entries" as const,
      labels: { singular: "Entry", plural: "Entries" },
      timestamps: true,
      permissions: {
        read: ({ rule, allowedTo }) => rule.where(allowedTo.read("stream")),
        insert: ({ rule, collections, session, allOf, anyOf, allowedTo }) => rule.where((entry) => allOf([
          { authorId: session.claims.sub },
          anyOf([
            allowedTo.read("stream"),
            collections.streamMemberships.exists.where({
              streamId: entry.streamId,
              userId: session.claims.sub,
            }),
          ]),
        ])),
        update: ({ rule, collections, session, allOf, anyOf, allowedTo }) => {
          const userId = session.claims.sub;
          const canEdit = (entry: { id: unknown; streamId: unknown; authorId: unknown }) => allOf([
            allowedTo.read("stream"),
            anyOf([
              { authorId: userId },
              collections.streamMemberships.exists.where({ streamId: entry.streamId, userId, role: "admin" }),
            ]),
          ]);
          rule.whereOld(canEdit).whereNew((entry) => allOf([
            canEdit(entry),
            collections.entries.exists.where({ id: entry.id, streamId: entry.streamId, authorId: entry.authorId }),
          ]));
        },
        delete: ({ rule, collections, session, anyOf }) => {
          const userId = session.claims.sub;
          rule.where((entry) => anyOf([
            { authorId: userId },
            collections.streamMemberships.exists.where({ streamId: entry.streamId, userId, role: "admin" }),
          ]));
        },
      },
      admin: { useAsTitle: "content", defaultColumns: ["type", "stream", "author"] },
      fields: entriesFields,
    } satisfies CollectionDefinition<typeof entriesFields>,
  ],
});
