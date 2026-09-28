// Generated from bebop.config.ts. Missing collection operations are denied by Jazz.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";

const appPermissions = s.definePermissions(app, ({ policy, session, anyOf, allowedTo }) => {
  policy.media.allowRead.always();
  policy.media.allowInsert.always();
  policy.media.allowUpdate.always();
  policy.media.allowDelete.always();
  policy.bebop_files_media.allowInsert.where({ ownerAccount: session.user.account });
  policy.bebop_files_media.allowRead.where(allowedTo.read("media"));
  policy.bebop_files_media.allowUpdate.whereOld({ ownerAccount: session.user.account, mediaId: null }).whereNew({ ownerAccount: session.user.account });
  policy.bebop_files_media.allowDelete.where(anyOf([{ ownerAccount: session.user.account, mediaId: null }, allowedTo.delete("media")]));
  policy.bebop_file_parts_media.allowInsert.where({ ownerAccount: session.user.account });
  policy.bebop_file_parts_media.allowRead.where(allowedTo.read("file"));
  policy.bebop_file_parts_media.allowUpdate.never();
  policy.bebop_file_parts_media.allowDelete.where(allowedTo.delete("file"));
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
