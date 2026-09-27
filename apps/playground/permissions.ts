// Generated for the local playground. Review every grant before syncing or deploying.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";
import { permissions as betterAuthPermissions } from "./schema-better-auth/schema.js";

const appPermissions = s.definePermissions(app, ({ policy }) => {
  policy.posts.allowRead.always();
  policy.posts.allowInsert.always();
  policy.posts.allowUpdate.always();
  policy.posts.allowDelete.always();
  policy.legacyPosts.allowRead.always();
  policy.legacyPosts.allowInsert.always();
  policy.legacyPosts.allowUpdate.always();
  policy.legacyPosts.allowDelete.always();
});
export default { ...betterAuthPermissions, ...appPermissions };
