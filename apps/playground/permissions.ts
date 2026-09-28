// Generated from bebop.config.ts. Missing collection operations are denied by Jazz.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";

const appPermissions = s.definePermissions(app, ({ policy }) => {
  policy.workspaces.allowRead.always();
  policy.workspaces.allowInsert.always();
  policy.workspaces.allowUpdate.always();
  policy.workspaces.allowDelete.always();
  policy.workspaceMemberships.allowRead.always();
  policy.workspaceMemberships.allowInsert.always();
  policy.workspaceMemberships.allowUpdate.always();
  policy.workspaceMemberships.allowDelete.always();
  policy.tasks.allowRead.always();
  policy.tasks.allowInsert.always();
  policy.tasks.allowUpdate.always();
  policy.tasks.allowDelete.always();
});
export default { ...betterAuthPermissions, ...appPermissions };
