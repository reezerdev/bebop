// Generated from bebop.config.ts. Missing collection operations are explicitly denied.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";

const appPermissions = s.definePermissions(app, ({ policy, session, anyOf, allowedTo }) => {
  const authenticatedSession = session.where({ authMode: { in: ["external", "local-first"] } });

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
  policy.workspaceMemberships.allowRead.where(authenticatedSession);
  policy.workspaceMemberships.allowInsert.where(authenticatedSession);
  policy.workspaceMemberships.allowUpdate.where(authenticatedSession);
  policy.workspaceMemberships.allowDelete.where(authenticatedSession);
  policy.tasks.allowRead.where(authenticatedSession);
  policy.tasks.allowInsert.where(authenticatedSession);
  policy.tasks.allowUpdate.where(authenticatedSession);
  policy.tasks.allowDelete.where(authenticatedSession);
});
export default { ...betterAuthPermissions, ...appPermissions };
