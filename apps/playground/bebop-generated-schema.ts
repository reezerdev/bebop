// Generated in bebop-generated-schema.ts from bebop.config.ts. Edit that file, then run bebop generate.
import { schema as s } from "jazz-tools";
import { schema as betterAuthSchema } from "./schema-better-auth/schema.js";

const schema = {
  ...betterAuthSchema,
  "posts": s.table(
    {
      "title": s.string(),
      "authorId": s.uuid(),
      "body": s.string().optional(),
      "slug": s.string().optional(),
      "publishedAt": s.timestamp().optional(),
      "published": s.boolean().optional(),
      "category": s.enum("announcement", "guide", "story").optional()
    },
    {
      "author": s.rel("better_auth_user", "authorId")
    },
  )
} as const;

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);
