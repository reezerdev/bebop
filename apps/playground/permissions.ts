// Generated from bebop.config.ts. Missing collection operations are denied by Jazz.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";

const appPermissions = s.definePermissions(app, ({ policy }) => {
  policy.posts.allowRead.always();
  policy.posts.allowInsert.always();
  policy.posts.allowUpdate.always();
  policy.posts.allowDelete.always();
});
export default { ...betterAuthPermissions, ...appPermissions };
