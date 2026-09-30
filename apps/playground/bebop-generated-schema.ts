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
      "data": s.bytes()
    },
    {},
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
