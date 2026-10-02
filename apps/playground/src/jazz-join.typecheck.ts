import { app } from "../bebop-generated-schema.js";
import { createBebopClient } from "../bebop-generated-client.js";

/** Compile-time example of reading the generated reverse relation with Jazz includes. */
export function workspaceMembersQuery() {
  return app.workspaces.include({ members: true });
}

export function entriesWithAuthorsQuery(client: ReturnType<typeof createBebopClient>) {
  return client.entries.query({ where: { type: "message" } })
    .where({ streamId: "stream-id" })
    .orderBy("$createdAt", "asc")
    .limit(20)
    .include({
      author: app.better_auth_user.select("id", "name"),
      parentEntry: app.entries.select("id", "content"),
    })
    .requireIncludes();
}
