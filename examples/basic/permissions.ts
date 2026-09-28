// Generated from bebop.config.ts. Missing collection operations are denied by Jazz.
import { schema as s } from "jazz-tools";
import { app } from "./bebop-generated-schema.js";

const appPermissions = s.definePermissions(app, ({ policy }) => {
  policy.todos.allowRead.always();
  policy.todos.allowInsert.always();
  policy.todos.allowUpdate.always();
  policy.todos.allowDelete.always();
});
export default appPermissions;
