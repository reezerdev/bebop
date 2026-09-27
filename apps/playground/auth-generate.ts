import { betterAuth } from "better-auth";
import { jazzAdapter } from "jazz-tools/better-auth-adapter";
import { schema as s } from "jazz-tools";
import { authOptions } from "./auth-options.ts";

export const auth = betterAuth({
  ...authOptions,
  database: jazzAdapter({
    db: async () => {
      throw new Error("The Better Auth schema generation config cannot query the database.");
    },
    schema: s.defineApp({}).wasmSchema,
  }),
});
