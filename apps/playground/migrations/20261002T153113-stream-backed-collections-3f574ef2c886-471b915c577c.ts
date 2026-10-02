import { schema as s } from "jazz-tools";

export default s.defineMigration({
  dropTables: {
    "tasks": true,
  },
  migrate: {
    "channels": {
      // TODO: No safe migration steps were inferred automatically.
    },

    "streamMemberships": {
      // TODO: Added required column "workspaceId" needs an explicit default.
    },
  },
  fromHash: "3f574ef2c886",
  toHash: "471b915c577c",
  from: {
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
    "role": s.string().optional(),
    "banned": s.boolean().optional(),
    "banReason": s.string().optional(),
    "banExpires": s.timestamp().optional(),
    "username": s.string().optional(),
    "gender": s.string().optional(),
    "mode": s.enum("light", "dark").optional(),
    "language": s.enum("en", "es").optional(),
    "firstName": s.string().optional(),
    "lastName": s.string().optional(),
    "position": s.string().optional(),
    "imageId": s.string().optional(),
  }, {

  }),
  "channels": s.table({
    "name": s.string(),
    "workspaceId": s.uuid(),
    "content": s.string().optional(),
    "authorId": s.uuid(),
    "visibility": s.enum("public", "private"),
    "streamId": s.uuid(),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "author": s.rel("better_auth_user", "authorId"),
    "stream": s.rel("streams", "streamId"),
  }),
  "entries": s.table({
    "streamId": s.uuid(),
    "type": s.enum("message", "comment", "update", "system"),
    "content": s.string(),
    "authorId": s.uuid(),
    "parentEntryId": s.uuid().optional(),
  }, {
    "stream": s.rel("streams", "streamId"),
    "author": s.rel("better_auth_user", "authorId"),
    "parentEntry": s.rel("entries", "parentEntryId"),
  }),
  "media": s.table({
    "alt": s.string().optional(),
    "filename": s.string(),
    "mimeType": s.string(),
    "filesize": s.int(),
    "data": s.bytes(),
  }, {

  }),
  "streamMemberships": s.table({
    "streamId": s.uuid(),
    "userId": s.uuid(),
    "role": s.enum("admin", "member"),
  }, {
    "stream": s.rel("streams", "streamId"),
    "user": s.rel("better_auth_user", "userId"),
  }),
  "streams": s.table({
    "name": s.string(),
    "workspaceId": s.uuid(),
    "authorId": s.uuid(),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "author": s.rel("better_auth_user", "authorId"),
    "members": s.reverse("streamMemberships", "stream"),
    "entries": s.reverse("entries", "stream"),
    "channels": s.reverse("channels", "stream"),
    "tasks": s.reverse("tasks", "stream"),
  }),
  "tasks": s.table({
    "name": s.string(),
    "workspaceId": s.uuid(),
    "content": s.string().optional(),
    "imageId": s.uuid().optional(),
    "priority": s.enum("low", "medium", "high", "urgent").optional(),
    "parentTaskId": s.uuid().optional(),
    "authorId": s.uuid(),
    "status": s.enum("backlog", "todo", "in-progress", "in-review", "done").optional(),
    "assigneeId": s.uuid().optional(),
    "dueAt": s.timestamp().optional(),
    "archivedAt": s.timestamp().optional(),
    "visibility": s.enum("public", "private", "protected"),
    "streamId": s.uuid(),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "image": s.rel("media", "imageId"),
    "parentTask": s.rel("tasks", "parentTaskId"),
    "author": s.rel("better_auth_user", "authorId"),
    "assignee": s.rel("better_auth_user", "assigneeId"),
    "stream": s.rel("streams", "streamId"),
  }),
  "workspaceMemberships": s.table({
    "workspaceId": s.uuid(),
    "userId": s.uuid(),
    "role": s.enum("admin", "manager", "member", "guest"),
    "status": s.enum("active", "pending", "deactivated"),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "user": s.rel("better_auth_user", "userId"),
  }),
  "workspaces": s.table({
    "name": s.string(),
    "slug": s.string(),
  }, {
    "members": s.reverse("workspaceMemberships", "workspace"),
  })
},
  to: {
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
    "role": s.string().optional(),
    "banned": s.boolean().optional(),
    "banReason": s.string().optional(),
    "banExpires": s.timestamp().optional(),
    "username": s.string().optional(),
    "gender": s.string().optional(),
    "mode": s.enum("light", "dark").optional(),
    "language": s.enum("en", "es").optional(),
    "firstName": s.string().optional(),
    "lastName": s.string().optional(),
    "position": s.string().optional(),
    "imageId": s.string().optional(),
  }, {

  }),
  "channels": s.table({
    "name": s.string(),
    "workspaceId": s.uuid(),
    "content": s.string().optional(),
    "authorId": s.uuid(),
    "visibility": s.enum("public", "private").default("public"),
    "streamId": s.uuid(),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "author": s.rel("better_auth_user", "authorId"),
    "stream": s.rel("streams", "streamId"),
  }),
  "entries": s.table({
    "streamId": s.uuid(),
    "type": s.enum("message", "comment", "update", "system"),
    "content": s.string(),
    "authorId": s.uuid(),
    "parentEntryId": s.uuid().optional(),
  }, {
    "stream": s.rel("streams", "streamId"),
    "author": s.rel("better_auth_user", "authorId"),
    "parentEntry": s.rel("entries", "parentEntryId"),
  }),
  "media": s.table({
    "alt": s.string().optional(),
    "filename": s.string(),
    "mimeType": s.string(),
    "filesize": s.int(),
    "data": s.bytes(),
  }, {

  }),
  "streamMemberships": s.table({
    "workspaceId": s.uuid(),
    "streamId": s.uuid(),
    "userId": s.uuid(),
    "role": s.enum("admin", "member"),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "stream": s.rel("streams", "streamId"),
    "user": s.rel("better_auth_user", "userId"),
  }),
  "streams": s.table({
    "name": s.string(),
    "workspaceId": s.uuid(),
    "authorId": s.uuid(),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "author": s.rel("better_auth_user", "authorId"),
    "members": s.reverse("streamMemberships", "stream"),
    "entries": s.reverse("entries", "stream"),
    "channels": s.reverse("channels", "stream"),
  }),
  "workspaceMemberships": s.table({
    "workspaceId": s.uuid(),
    "userId": s.uuid(),
    "role": s.enum("admin", "manager", "member", "guest"),
    "status": s.enum("active", "pending", "deactivated"),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "user": s.rel("better_auth_user", "userId"),
  }),
  "workspaces": s.table({
    "name": s.string(),
    "slug": s.string(),
  }, {
    "members": s.reverse("workspaceMemberships", "workspace"),
  })
},
});
