import { schema as s } from "jazz-tools";

export default s.defineMigration({
  createTables: {
    "bebop_file_parts_media": true,
    "bebop_files_media": true,
    "media": true,
  },
  migrate: {
    "tasks": {
      "imageId": s.add.ref("media", { default: null }),
    },
  },
  fromHash: "e54829e4a2db",
  toHash: "09e429309371",
  from: {
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
  }, {

  }),
  "tasks": s.table({
    "name": s.string(),
    "workspaceId": s.uuid().optional(),
    "content": s.string().optional(),
    "priority": s.enum("low", "medium", "high", "urgent").optional(),
    "parentTaskId": s.uuid().optional(),
    "authorId": s.uuid(),
    "status": s.enum("backlog", "todo", "in-progress", "in-review", "done").optional(),
    "assigneeId": s.uuid().optional(),
    "dueAt": s.timestamp().optional(),
    "archivedAt": s.timestamp().optional(),
  }, {
    "workspaceIdRelation": s.rel("workspaces", "workspaceId"),
    "parentTaskIdRelation": s.rel("tasks", "parentTaskId"),
    "authorIdRelation": s.rel("better_auth_user", "authorId"),
    "assigneeIdRelation": s.rel("better_auth_user", "assigneeId"),
  }),
  "workspaceMemberships": s.table({
    "workspaceId": s.uuid(),
    "userId": s.uuid(),
    "role": s.enum("admin", "manager", "member", "guest"),
    "status": s.enum("active", "pending", "deactivated"),
  }, {
    "workspaceIdRelation": s.rel("workspaces", "workspaceId"),
    "userIdRelation": s.rel("better_auth_user", "userId"),
  }),
  "workspaces": s.table({
    "name": s.string(),
    "slug": s.string(),
  }, {

  })
},
  to: {
  "bebop_file_parts_media": s.table({
    "data": s.bytes(),
    "ownerAccount": s.uuid(),
    "fileId": s.uuid(),
  }, {
    "file": s.rel("bebop_files_media", "fileId"),
  }),
  "bebop_files_media": s.table({
    "ownerAccount": s.uuid(),
    "mediaId": s.uuid().optional(),
    "partIds": s.array(s.uuid()),
    "partSizes": s.array(s.int()),
  }, {
    "media": s.rel("media", "mediaId"),
  }),
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
  }, {

  }),
  "media": s.table({
    "alt": s.string().optional(),
    "filename": s.string(),
    "mimeType": s.string(),
    "filesize": s.int(),
    "fileId": s.uuid(),
  }, {
    "file": s.rel("bebop_files_media", "fileId"),
  }),
  "tasks": s.table({
    "name": s.string(),
    "workspaceId": s.uuid().optional(),
    "content": s.string().optional(),
    "imageId": s.uuid().optional(),
    "priority": s.enum("low", "medium", "high", "urgent").optional(),
    "parentTaskId": s.uuid().optional(),
    "authorId": s.uuid(),
    "status": s.enum("backlog", "todo", "in-progress", "in-review", "done").optional(),
    "assigneeId": s.uuid().optional(),
    "dueAt": s.timestamp().optional(),
    "archivedAt": s.timestamp().optional(),
  }, {
    "workspace": s.rel("workspaces", "workspaceId"),
    "image": s.rel("media", "imageId"),
    "parentTask": s.rel("tasks", "parentTaskId"),
    "author": s.rel("better_auth_user", "authorId"),
    "assignee": s.rel("better_auth_user", "assigneeId"),
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
