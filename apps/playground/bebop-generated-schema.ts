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
  "channels": s.table(
    {
      "name": s.string(),
      "workspaceId": s.uuid(),
      "content": s.string().optional(),
      "authorId": s.uuid(),
      "visibility": s.enum("public", "private"),
      "streamId": s.uuid()
    },
    {
      "workspace": s.rel("workspaces", "workspaceId"),
      "author": s.rel("better_auth_user", "authorId"),
      "stream": s.rel("streams", "streamId")
    },
  ),
  "streams": s.table(
    {
      "name": s.string(),
      "workspaceId": s.uuid(),
      "authorId": s.uuid()
    },
    {
      "workspace": s.rel("workspaces", "workspaceId"),
      "author": s.rel("better_auth_user", "authorId"),
      "members": s.reverse("streamMemberships", "stream"),
      "entries": s.reverse("entries", "stream"),
      "channels": s.reverse("channels", "stream")
    },
  ),
  "streamMemberships": s.table(
    {
      "workspaceId": s.uuid(),
      "streamId": s.uuid(),
      "userId": s.uuid(),
      "role": s.enum("admin", "member")
    },
    {
      "workspace": s.rel("workspaces", "workspaceId"),
      "stream": s.rel("streams", "streamId"),
      "user": s.rel("better_auth_user", "userId")
    },
  ),
  "entries": s.table(
    {
      "streamId": s.uuid(),
      "type": s.enum("message", "comment", "update", "system"),
      "content": s.string(),
      "authorId": s.uuid(),
      "authorName": s.string(),
      "parentEntryId": s.uuid().optional()
    },
    {
      "stream": s.rel("streams", "streamId"),
      "author": s.rel("better_auth_user", "authorId"),
      "parentEntry": s.rel("entries", "parentEntryId")
    },
  )
} as const;

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);
