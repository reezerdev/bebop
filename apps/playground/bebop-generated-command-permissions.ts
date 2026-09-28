// Generated from bebop.config.ts. Unspecified legacy access defaults to authenticated sessions; omitted Jazz permission operations are denied.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";
import bebopConfig from "./bebop.config.js";

const appPermissions = s.definePermissions(app, ({ policy, session, allOf, anyOf, isCreator, allowedTo }) => {
  const bebopCollections = {
    "media": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.media.exists.where(input as never) } },
    "workspaces": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.workspaces.exists.where(input as never) } },
    "workspaceMemberships": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.workspaceMemberships.exists.where(input as never) } },
    "tasks": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.tasks.exists.where(input as never) } },
    "better_auth_user": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_user.exists.where(input as never) } },
    "better_auth_session": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_session.exists.where(input as never) } },
    "better_auth_account": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_account.exists.where(input as never) } },
    "better_auth_verification": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_verification.exists.where(input as never) } },
    "better_auth_jwks": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_jwks.exists.where(input as never) } }
  };
  const bebopRule = (builder: { where(input: never): unknown; always(): unknown; never(): unknown; whereOld?(input: never): unknown; whereNew?(input: never): unknown }) => ({
    where: (input: unknown) => builder.where(input as never),
    always: () => builder.always(),
    never: () => builder.never(),
    whereOld(input: unknown) { builder.whereOld?.(input as never); return this; },
    whereNew(input: unknown) { builder.whereNew?.(input as never); return this; },
  });

  const mediaReadPermissions = bebopConfig.collections[0].permissions;
  if (mediaReadPermissions?.read) {
    mediaReadPermissions?.read({
      rule: bebopRule(policy.media.allowRead),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowRead.never();
  }
  const mediaInsertPermissions = bebopConfig.collections[0].permissions;
  if (mediaInsertPermissions?.insert) {
    mediaInsertPermissions?.insert({
      rule: bebopRule(policy.media.allowInsert),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowInsert.never();
  }
  const mediaUpdatePermissions = bebopConfig.collections[0].permissions;
  if (mediaUpdatePermissions?.update) {
    mediaUpdatePermissions?.update({
      rule: bebopRule(policy.media.allowUpdate),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowUpdate.never();
  }
  const mediaDeletePermissions = bebopConfig.collections[0].permissions;
  if (mediaDeletePermissions?.delete) {
    mediaDeletePermissions?.delete({
      rule: bebopRule(policy.media.allowDelete),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowDelete.never();
  }
  policy.bebop_files_media.allowInsert.where({ ownerAccount: session.user.account });
  policy.bebop_files_media.allowRead.where(allowedTo.read("media"));
  policy.bebop_files_media.allowUpdate.whereOld({ ownerAccount: session.user.account, mediaId: null }).whereNew({ ownerAccount: session.user.account });
  policy.bebop_files_media.allowDelete.where(anyOf([{ ownerAccount: session.user.account, mediaId: null }, allowedTo.delete("media")]));
  policy.bebop_file_parts_media.allowInsert.where({ ownerAccount: session.user.account });
  policy.bebop_file_parts_media.allowRead.where(allowedTo.read("file"));
  policy.bebop_file_parts_media.allowUpdate.never();
  policy.bebop_file_parts_media.allowDelete.where(allowedTo.delete("file"));
  const workspacesReadPermissions = bebopConfig.collections[1].permissions;
  if (workspacesReadPermissions?.read) {
    workspacesReadPermissions?.read({
      rule: bebopRule(policy.workspaces.allowRead),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowRead.never();
  }
  const workspacesInsertPermissions = bebopConfig.collections[1].permissions;
  if (workspacesInsertPermissions?.insert) {
    workspacesInsertPermissions?.insert({
      rule: bebopRule(policy.workspaces.allowInsert),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowInsert.never();
  }
  const workspacesUpdatePermissions = bebopConfig.collections[1].permissions;
  if (workspacesUpdatePermissions?.update) {
    workspacesUpdatePermissions?.update({
      rule: bebopRule(policy.workspaces.allowUpdate),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowUpdate.never();
  }
  const workspacesDeletePermissions = bebopConfig.collections[1].permissions;
  if (workspacesDeletePermissions?.delete) {
    workspacesDeletePermissions?.delete({
      rule: bebopRule(policy.workspaces.allowDelete),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowDelete.never();
  }
  const workspaceMembershipsReadPermissions = bebopConfig.collections[2].permissions;
  if (workspaceMembershipsReadPermissions?.read) {
    workspaceMembershipsReadPermissions?.read({
      rule: bebopRule(policy.workspaceMemberships.allowRead),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowRead.never();
  }
  const workspaceMembershipsInsertPermissions = bebopConfig.collections[2].permissions;
  if (workspaceMembershipsInsertPermissions?.insert) {
    workspaceMembershipsInsertPermissions?.insert({
      rule: bebopRule(policy.workspaceMemberships.allowInsert),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowInsert.never();
  }
  const workspaceMembershipsUpdatePermissions = bebopConfig.collections[2].permissions;
  if (workspaceMembershipsUpdatePermissions?.update) {
    workspaceMembershipsUpdatePermissions?.update({
      rule: bebopRule(policy.workspaceMemberships.allowUpdate),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowUpdate.never();
  }
  const workspaceMembershipsDeletePermissions = bebopConfig.collections[2].permissions;
  if (workspaceMembershipsDeletePermissions?.delete) {
    workspaceMembershipsDeletePermissions?.delete({
      rule: bebopRule(policy.workspaceMemberships.allowDelete),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowDelete.never();
  }
  const tasksReadPermissions = bebopConfig.collections[3].permissions;
  if (tasksReadPermissions?.read) {
    tasksReadPermissions?.read({
      rule: bebopRule(policy.tasks.allowRead),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowRead.never();
  }
  const tasksInsertPermissions = bebopConfig.collections[3].permissions;
  if (tasksInsertPermissions?.insert) {
    tasksInsertPermissions?.insert({
      rule: bebopRule(policy.tasks.allowInsert),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowInsert.never();
  }
  const tasksUpdatePermissions = bebopConfig.collections[3].permissions;
  if (tasksUpdatePermissions?.update) {
    tasksUpdatePermissions?.update({
      rule: bebopRule(policy.tasks.allowUpdate),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowUpdate.never();
  }
  const tasksDeletePermissions = bebopConfig.collections[3].permissions;
  if (tasksDeletePermissions?.delete) {
    tasksDeletePermissions?.delete({
      rule: bebopRule(policy.tasks.allowDelete),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowDelete.never();
  }
});
export default { ...betterAuthPermissions, ...appPermissions };
