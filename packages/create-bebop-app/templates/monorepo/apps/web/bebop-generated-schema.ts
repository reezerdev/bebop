// Generated in bebop-generated-schema.ts from bebop.config.ts. Edit that file, then run bebop generate.
import { schema as s } from "jazz-tools";

const schema = {
  "todos": s.table(
    {
      "title": s.string(),
      "notes": s.string().optional(),
      "completed": s.boolean().optional(),
      "dueAt": s.timestamp().optional()
    },
    {},
  )
} as const;

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);
