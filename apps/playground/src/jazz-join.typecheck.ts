import { app } from "../bebop-generated-schema.js";

/** Compile-time example of reading the generated reverse relation with Jazz includes. */
export function workspaceMembersQuery() {
  return app.workspaces.include({ members: true });
}
