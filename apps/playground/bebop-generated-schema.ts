// Generated in bebop-generated-schema.ts from bebop.config.ts. Edit that file, then run bebop generate.
import { schema as s } from "jazz-tools";
import { schema as betterAuthSchema } from "./schema-better-auth/schema.js";

const schema = {
  ...betterAuthSchema,
  "media": s.table(
    {
      "alt": s.string().optional(),
      "filename": s.string(),
      "mimeType": s.string(),
      "filesize": s.int(),
      "fileId": s.uuid()
    },
    {
      "file": s.rel("bebop_files_media", "fileId")
    },
  ),
  "bebop_files_media": s.table(
    {
      "ownerAccount": s.uuid(),
      "mediaId": s.uuid().optional(),
      "partIds": s.array(s.uuid()),
      "partSizes": s.array(s.int())
    },
    {
      "media": s.rel("media", "mediaId")
    },
  ),
  "bebop_file_parts_media": s.table(
    {
      "data": s.bytes(),
      "ownerAccount": s.uuid(),
      "fileId": s.uuid()
    },
    {
      "file": s.rel("bebop_files_media", "fileId")
    },
  ),
  "workspaces": s.table(
    {
      "name": s.string(),
      "slug": s.string()
    },
    {
      "members": s.reverse("workspaceMemberships", "workspace")
    },
  ),
  "workspaceMemberships": s.table(
    {
      "workspaceId": s.uuid(),
      "userId": s.uuid(),
      "role": s.enum("admin", "manager", "member", "guest"),
      "status": s.enum("active", "pending", "deactivated")
    },
    {
      "workspace": s.rel("workspaces", "workspaceId"),
      "user": s.rel("better_auth_user", "userId")
    },
  ),
  "tasks": s.table(
    {
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
      "archivedAt": s.timestamp().optional()
    },
    {
      "workspace": s.rel("workspaces", "workspaceId"),
      "image": s.rel("media", "imageId"),
      "parentTask": s.rel("tasks", "parentTaskId"),
      "author": s.rel("better_auth_user", "authorId"),
      "assignee": s.rel("better_auth_user", "assigneeId")
    },
  )
} as const;

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);
