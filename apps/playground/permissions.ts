// Bebop permission source fingerprint: 4700de040a7c7e6252044292bee9727b9bcfd212069e33fb6d4739fb9116a19f
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
  const bebopAdmin = anyOf([session.where({ "claims.role": "admin" }), session.where({ "claims.bebopAdmin": true })]);
  const bebopRule = (builder: { where(input: never): unknown; always(): unknown; never(): unknown; whereOld?(input: never): unknown; whereNew?(input: never): unknown }, includeAdminOverride = false) => {
    const adminAwareInput = (input: unknown) => typeof input === "function"
      ? (row: never) => anyOf([bebopAdmin, (input as (row: never) => never)(row)])
      : anyOf([bebopAdmin, input as never]);
    return {
    where: (input: unknown) => {
      if (!includeAdminOverride) return builder.where(input as never);
      return builder.where(adminAwareInput(input) as never);
    },
    always: () => builder.always(),
    never: () => includeAdminOverride ? builder.where(bebopAdmin as never) : builder.never(),
    whereOld(input: unknown) { builder.whereOld?.(includeAdminOverride ? adminAwareInput(input) as never : input as never); return this; },
    whereNew(input: unknown) { builder.whereNew?.(includeAdminOverride ? adminAwareInput(input) as never : input as never); return this; },
    };
  };

  const mediaReadPermissions = bebopConfig.collections[1].permissions;
  if (mediaReadPermissions?.read) {
    mediaReadPermissions?.read({
      rule: bebopRule(policy.media.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowRead.where(bebopAdmin);
  }
  const mediaInsertPermissions = bebopConfig.collections[1].permissions;
  if (mediaInsertPermissions?.insert) {
    mediaInsertPermissions?.insert({
      rule: bebopRule(policy.media.allowInsert, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowInsert.where(bebopAdmin);
  }
  const mediaUpdatePermissions = bebopConfig.collections[1].permissions;
  if (mediaUpdatePermissions?.update) {
    mediaUpdatePermissions?.update({
      rule: bebopRule(policy.media.allowUpdate, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowUpdate.where(bebopAdmin);
  }
  const mediaDeletePermissions = bebopConfig.collections[1].permissions;
  if (mediaDeletePermissions?.delete) {
    mediaDeletePermissions?.delete({
      rule: bebopRule(policy.media.allowDelete, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.media.allowDelete.where(bebopAdmin);
  }
  const workspacesReadPermissions = bebopConfig.collections[2].permissions;
  if (workspacesReadPermissions?.read) {
    workspacesReadPermissions?.read({
      rule: bebopRule(policy.workspaces.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaces.allowRead.where(bebopAdmin);
  }
  policy.workspaces.allowInsert.never();
  policy.workspaces.allowUpdate.never();
  policy.workspaces.allowDelete.never();
  const workspaceMembershipsReadPermissions = bebopConfig.collections[3].permissions;
  if (workspaceMembershipsReadPermissions?.read) {
    workspaceMembershipsReadPermissions?.read({
      rule: bebopRule(policy.workspaceMemberships.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.workspaceMemberships.allowRead.where(bebopAdmin);
  }
  policy.workspaceMemberships.allowInsert.never();
  policy.workspaceMemberships.allowUpdate.never();
  policy.workspaceMemberships.allowDelete.never();
  const channelsReadPermissions = bebopConfig.collections[4].permissions;
  if (channelsReadPermissions?.read) {
    channelsReadPermissions?.read({
      rule: bebopRule(policy.channels.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowRead.where(bebopAdmin);
  }
  const channelsInsertPermissions = bebopConfig.collections[4].permissions;
  if (channelsInsertPermissions?.insert) {
    channelsInsertPermissions?.insert({
      rule: bebopRule(policy.channels.allowInsert, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowInsert.where(bebopAdmin);
  }
  const channelsUpdatePermissions = bebopConfig.collections[4].permissions;
  if (channelsUpdatePermissions?.update) {
    channelsUpdatePermissions?.update({
      rule: bebopRule(policy.channels.allowUpdate, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowUpdate.where(bebopAdmin);
  }
  const channelsDeletePermissions = bebopConfig.collections[4].permissions;
  if (channelsDeletePermissions?.delete) {
    channelsDeletePermissions?.delete({
      rule: bebopRule(policy.channels.allowDelete, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.channels.allowDelete.where(bebopAdmin);
  }
  const streamsReadPermissions = bebopConfig.collections[5].permissions;
  if (streamsReadPermissions?.read) {
    streamsReadPermissions?.read({
      rule: bebopRule(policy.streams.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowRead.where(bebopAdmin);
  }
  const streamsInsertPermissions = bebopConfig.collections[5].permissions;
  if (streamsInsertPermissions?.insert) {
    streamsInsertPermissions?.insert({
      rule: bebopRule(policy.streams.allowInsert, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowInsert.where(bebopAdmin);
  }
  const streamsUpdatePermissions = bebopConfig.collections[5].permissions;
  if (streamsUpdatePermissions?.update) {
    streamsUpdatePermissions?.update({
      rule: bebopRule(policy.streams.allowUpdate, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowUpdate.where(bebopAdmin);
  }
  const streamsDeletePermissions = bebopConfig.collections[5].permissions;
  if (streamsDeletePermissions?.delete) {
    streamsDeletePermissions?.delete({
      rule: bebopRule(policy.streams.allowDelete, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streams.allowDelete.where(bebopAdmin);
  }
  const streamMembershipsReadPermissions = bebopConfig.collections[6].permissions;
  if (streamMembershipsReadPermissions?.read) {
    streamMembershipsReadPermissions?.read({
      rule: bebopRule(policy.streamMemberships.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowRead.where(bebopAdmin);
  }
  const streamMembershipsInsertPermissions = bebopConfig.collections[6].permissions;
  if (streamMembershipsInsertPermissions?.insert) {
    streamMembershipsInsertPermissions?.insert({
      rule: bebopRule(policy.streamMemberships.allowInsert, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowInsert.where(bebopAdmin);
  }
  const streamMembershipsUpdatePermissions = bebopConfig.collections[6].permissions;
  if (streamMembershipsUpdatePermissions?.update) {
    streamMembershipsUpdatePermissions?.update({
      rule: bebopRule(policy.streamMemberships.allowUpdate, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowUpdate.where(bebopAdmin);
  }
  const streamMembershipsDeletePermissions = bebopConfig.collections[6].permissions;
  if (streamMembershipsDeletePermissions?.delete) {
    streamMembershipsDeletePermissions?.delete({
      rule: bebopRule(policy.streamMemberships.allowDelete, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.streamMemberships.allowDelete.where(bebopAdmin);
  }
  const entriesReadPermissions = bebopConfig.collections[7].permissions;
  if (entriesReadPermissions?.read) {
    entriesReadPermissions?.read({
      rule: bebopRule(policy.entries.allowRead, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowRead.where(bebopAdmin);
  }
  const entriesInsertPermissions = bebopConfig.collections[7].permissions;
  if (entriesInsertPermissions?.insert) {
    entriesInsertPermissions?.insert({
      rule: bebopRule(policy.entries.allowInsert, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowInsert.where(bebopAdmin);
  }
  const entriesUpdatePermissions = bebopConfig.collections[7].permissions;
  if (entriesUpdatePermissions?.update) {
    entriesUpdatePermissions?.update({
      rule: bebopRule(policy.entries.allowUpdate, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowUpdate.where(bebopAdmin);
  }
  const entriesDeletePermissions = bebopConfig.collections[7].permissions;
  if (entriesDeletePermissions?.delete) {
    entriesDeletePermissions?.delete({
      rule: bebopRule(policy.entries.allowDelete, true),
      collections: bebopCollections,
      session, allOf, anyOf, allowedTo, isCreator,
    });
  } else {
    policy.entries.allowDelete.where(bebopAdmin);
  }
});
export default { ...betterAuthPermissions, ...appPermissions };
