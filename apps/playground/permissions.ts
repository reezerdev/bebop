// Generated for the local playground. Review every grant before syncing or deploying.
import { schema as s } from "jazz-tools";
import { app } from "./schema.js";

export default s.definePermissions(app, ({ policy }) => {
  policy.posts.allowRead.always();
  policy.posts.allowInsert.always();
  policy.posts.allowUpdate.always();
  policy.posts.allowDelete.always();
});
