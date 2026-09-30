// Reference only. Do not deploy this policy or use it to authorize backend commands; use createBebopHandler.authorize.
// Generated from bebop.config.ts. Unspecified access defaults to authenticated sessions; omitted Jazz permission operations are denied.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";
import bebopConfig from "./bebop.config.js";

const appPermissions = s.definePermissions(app, ({ policy, session, allOf, anyOf, isCreator, allowedTo }) => {
  const bebopCollections = {
    "users": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_user.exists.where(input as never) } },
    "media": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.media.exists.where(input as never) } },
    "workspaces": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.workspaces.exists.where(input as never) } },
    "workspaceMemberships": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.workspaceMemberships.exists.where(input as never) } },
    "tasks": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.tasks.exists.where(input as never) } },
    "channels": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.channels.exists.where(input as never) } },
    "streams": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.streams.exists.where(input as never) } },
    "streamMemberships": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.streamMemberships.exists.where(input as never) } },
    "entries": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.entries.exists.where(input as never) } },
    "better_auth_user": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_user.exists.where(input as never) } },
    "better_auth_session": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_session.exists.where(input as never) } },
    "better_auth_account": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_account.exists.where(input as never) } },
    "better_auth_verification": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_verification.exists.where(input as never) } },
    "better_auth_jwks": { exists: { where: (input: Record<string, unknown> | import("jazz-tools/permissions").PermissionExpressionInput) => policy.better_auth_jwks.exists.where(input as never) } }
  };
  const adminRead = session.where({ "claims.role": "admin" });
  const bebopRule = (builder: { where(input: never): unknown; always(): unknown; never(): unknown; whereOld?(input: never): unknown; whereNew?(input: never): unknown }, includeAdminRead = false) => ({
    where: (input: unknown) => {
      if (!includeAdminRead) return builder.where(input as never);
      const adminAwareRule = typeof input === "function"
        ? (row: never) => anyOf([adminRead, (input as (row: never) => never)(row)])
        : anyOf([adminRead, input as never]);
      return builder.where(adminAwareRule as never);
    },
    always: () => builder.always(),
    never: () => includeAdminRead ? builder.where(adminRead as never) : builder.never(),
    whereOld(input: unknown) { builder.whereOld?.(input as never); return this; },
    whereNew(input: unknown) { builder.whereNew?.(input as never); return this; },
  });

  const mediaReadPermissions = bebopConfig.collections[1].permissions;
  if (mediaReadPermissions?.read) {
    mediaReadPermissions?.read({
      rule: bebopRule(policy.media.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const mediaInsertPermissions = bebopConfig.collections[1].permissions;
  if (mediaInsertPermissions?.insert) {
    mediaInsertPermissions?.insert({
      rule: bebopRule(policy.media.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowInsert.never();
  }
  const mediaUpdatePermissions = bebopConfig.collections[1].permissions;
  if (mediaUpdatePermissions?.update) {
    mediaUpdatePermissions?.update({
      rule: bebopRule(policy.media.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowUpdate.never();
  }
  const mediaDeletePermissions = bebopConfig.collections[1].permissions;
  if (mediaDeletePermissions?.delete) {
    mediaDeletePermissions?.delete({
      rule: bebopRule(policy.media.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowDelete.never();
  }
  const workspacesReadPermissions = bebopConfig.collections[2].permissions;
  if (workspacesReadPermissions?.read) {
    workspacesReadPermissions?.read({
      rule: bebopRule(policy.workspaces.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const workspacesInsertPermissions = bebopConfig.collections[2].permissions;
  if (workspacesInsertPermissions?.insert) {
    workspacesInsertPermissions?.insert({
      rule: bebopRule(policy.workspaces.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowInsert.never();
  }
  const workspacesUpdatePermissions = bebopConfig.collections[2].permissions;
  if (workspacesUpdatePermissions?.update) {
    workspacesUpdatePermissions?.update({
      rule: bebopRule(policy.workspaces.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowUpdate.never();
  }
  const workspacesDeletePermissions = bebopConfig.collections[2].permissions;
  if (workspacesDeletePermissions?.delete) {
    workspacesDeletePermissions?.delete({
      rule: bebopRule(policy.workspaces.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowDelete.never();
  }
  const workspaceMembershipsReadPermissions = bebopConfig.collections[3].permissions;
  if (workspaceMembershipsReadPermissions?.read) {
    workspaceMembershipsReadPermissions?.read({
      rule: bebopRule(policy.workspaceMemberships.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const workspaceMembershipsInsertPermissions = bebopConfig.collections[3].permissions;
  if (workspaceMembershipsInsertPermissions?.insert) {
    workspaceMembershipsInsertPermissions?.insert({
      rule: bebopRule(policy.workspaceMemberships.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowInsert.never();
  }
  const workspaceMembershipsUpdatePermissions = bebopConfig.collections[3].permissions;
  if (workspaceMembershipsUpdatePermissions?.update) {
    workspaceMembershipsUpdatePermissions?.update({
      rule: bebopRule(policy.workspaceMemberships.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowUpdate.never();
  }
  const workspaceMembershipsDeletePermissions = bebopConfig.collections[3].permissions;
  if (workspaceMembershipsDeletePermissions?.delete) {
    workspaceMembershipsDeletePermissions?.delete({
      rule: bebopRule(policy.workspaceMemberships.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowDelete.never();
  }
  const tasksReadPermissions = bebopConfig.collections[4].permissions;
  if (tasksReadPermissions?.read) {
    tasksReadPermissions?.read({
      rule: bebopRule(policy.tasks.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const tasksInsertPermissions = bebopConfig.collections[4].permissions;
  if (tasksInsertPermissions?.insert) {
    tasksInsertPermissions?.insert({
      rule: bebopRule(policy.tasks.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowInsert.never();
  }
  const tasksUpdatePermissions = bebopConfig.collections[4].permissions;
  if (tasksUpdatePermissions?.update) {
    tasksUpdatePermissions?.update({
      rule: bebopRule(policy.tasks.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowUpdate.never();
  }
  const tasksDeletePermissions = bebopConfig.collections[4].permissions;
  if (tasksDeletePermissions?.delete) {
    tasksDeletePermissions?.delete({
      rule: bebopRule(policy.tasks.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.tasks.allowDelete.never();
  }
  const channelsReadPermissions = bebopConfig.collections[5].permissions;
  if (channelsReadPermissions?.read) {
    channelsReadPermissions?.read({
      rule: bebopRule(policy.channels.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const channelsInsertPermissions = bebopConfig.collections[5].permissions;
  if (channelsInsertPermissions?.insert) {
    channelsInsertPermissions?.insert({
      rule: bebopRule(policy.channels.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowInsert.never();
  }
  const channelsUpdatePermissions = bebopConfig.collections[5].permissions;
  if (channelsUpdatePermissions?.update) {
    channelsUpdatePermissions?.update({
      rule: bebopRule(policy.channels.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowUpdate.never();
  }
  const channelsDeletePermissions = bebopConfig.collections[5].permissions;
  if (channelsDeletePermissions?.delete) {
    channelsDeletePermissions?.delete({
      rule: bebopRule(policy.channels.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowDelete.never();
  }
  const streamsReadPermissions = bebopConfig.collections[6].permissions;
  if (streamsReadPermissions?.read) {
    streamsReadPermissions?.read({
      rule: bebopRule(policy.streams.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const streamsInsertPermissions = bebopConfig.collections[6].permissions;
  if (streamsInsertPermissions?.insert) {
    streamsInsertPermissions?.insert({
      rule: bebopRule(policy.streams.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowInsert.never();
  }
  const streamsUpdatePermissions = bebopConfig.collections[6].permissions;
  if (streamsUpdatePermissions?.update) {
    streamsUpdatePermissions?.update({
      rule: bebopRule(policy.streams.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowUpdate.never();
  }
  const streamsDeletePermissions = bebopConfig.collections[6].permissions;
  if (streamsDeletePermissions?.delete) {
    streamsDeletePermissions?.delete({
      rule: bebopRule(policy.streams.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowDelete.never();
  }
  const streamMembershipsReadPermissions = bebopConfig.collections[7].permissions;
  if (streamMembershipsReadPermissions?.read) {
    streamMembershipsReadPermissions?.read({
      rule: bebopRule(policy.streamMemberships.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const streamMembershipsInsertPermissions = bebopConfig.collections[7].permissions;
  if (streamMembershipsInsertPermissions?.insert) {
    streamMembershipsInsertPermissions?.insert({
      rule: bebopRule(policy.streamMemberships.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowInsert.never();
  }
  const streamMembershipsUpdatePermissions = bebopConfig.collections[7].permissions;
  if (streamMembershipsUpdatePermissions?.update) {
    streamMembershipsUpdatePermissions?.update({
      rule: bebopRule(policy.streamMemberships.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowUpdate.never();
  }
  const streamMembershipsDeletePermissions = bebopConfig.collections[7].permissions;
  if (streamMembershipsDeletePermissions?.delete) {
    streamMembershipsDeletePermissions?.delete({
      rule: bebopRule(policy.streamMemberships.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowDelete.never();
  }
  const entriesReadPermissions = bebopConfig.collections[8].permissions;
  if (entriesReadPermissions?.read) {
    entriesReadPermissions?.read({
      rule: bebopRule(policy.entries.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowRead.where(session.where({ "claims.role": "admin" }));
  }
  const entriesInsertPermissions = bebopConfig.collections[8].permissions;
  if (entriesInsertPermissions?.insert) {
    entriesInsertPermissions?.insert({
      rule: bebopRule(policy.entries.allowInsert, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowInsert.never();
  }
  const entriesUpdatePermissions = bebopConfig.collections[8].permissions;
  if (entriesUpdatePermissions?.update) {
    entriesUpdatePermissions?.update({
      rule: bebopRule(policy.entries.allowUpdate, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowUpdate.never();
  }
  const entriesDeletePermissions = bebopConfig.collections[8].permissions;
  if (entriesDeletePermissions?.delete) {
    entriesDeletePermissions?.delete({
      rule: bebopRule(policy.entries.allowDelete, false),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowDelete.never();
  }
});
export default { ...betterAuthPermissions, ...appPermissions };
