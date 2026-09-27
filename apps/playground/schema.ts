// Generated from bebop.config.ts. Edit that file, then run bebop generate.
import { schema as s } from "jazz-tools";

const schema = {
  "posts": s.table(
    {
      "title": s.string(),
      "body": s.string().optional(),
      "slug": s.string().optional(),
      "published": s.boolean().optional(),
      "category": s.enum("announcement", "guide", "story").optional()
    },
    {},
  )
} as const;

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);
