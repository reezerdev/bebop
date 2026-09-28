// Generated from bebop.config.ts. Missing collection operations are denied by Jazz.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";
import bebopConfig from "./bebop.config.js";

const appPermissions = s.definePermissions(app, ({ policy, session, allOf, anyOf, isCreator }) => {
  const exists = (collectionName: string, condition: Record<string, unknown>) => {
    const tablePolicy = (policy as unknown as Record<string, { exists: { where(input: Record<string, unknown>): unknown } }>)[collectionName];
    if (!tablePolicy) throw new Error(`Unknown collection in access.exists(): ${collectionName}`);
    return tablePolicy.exists.where(condition) as never;
  };

  const postsAccess = bebopConfig.collections.posts.access;
  if (postsAccess?.read) {
    policy.posts.allowRead.where((row) => postsAccess.read!({ row, session, allOf, anyOf, exists, isCreator }) as never);
  }
  if (postsAccess?.create) {
    policy.posts.allowInsert.where((row) => postsAccess.create!({ row, session, allOf, anyOf, exists, isCreator }) as never);
  }
  if (postsAccess?.update) {
    policy.posts.allowUpdate.where((row) => postsAccess.update!({ row, session, allOf, anyOf, exists, isCreator }) as never);
  }
  if (postsAccess?.delete) {
    policy.posts.allowDelete.where((row) => postsAccess.delete!({ row, session, allOf, anyOf, exists, isCreator }) as never);
  }
});
export default { ...betterAuthPermissions, ...appPermissions };
