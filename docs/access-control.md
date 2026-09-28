# Access control and server writes

Bebop access rules compile to Jazz permission rules. Jazz is the authority for direct writes and reads. Admin permission checks are guidance for the interface; hiding a button does not secure an operation.

## Access presets and defaults

If `access` is omitted, Jazz denies every operation. An access object grants only the operations it defines. Use a preset when that matches the collection:

```ts
{
  slug: "announcements",
  access: "public", // Anyone may read, create, update, and delete.
  fields: [{ name: "message", type: "text", required: true }],
}

{
  slug: "supportNotes",
  access: "authenticated", // Non-anonymous Jazz sessions may use all CRUD operations.
  fields: [{ name: "body", type: "text", required: true }],
}
```

You can define only the operations the app needs:

```ts
{
  slug: "auditEntries",
  fields: [
    { name: "ownerId", type: "text", required: true },
    { name: "body", type: "text", required: true },
  ],
  access: {
    read: ({ session }) => ({ ownerId: session.user.account }),
  },
}
```

For ordinary row conditions, return a condition object using stored Jazz field names. For more involved policies, use the Jazz helpers supplied in the callback (`session`, `allOf`, `anyOf`, `exists`, and `isCreator`). The exact expression types come from the installed Jazz version.

## Workspace membership rule

This example assumes membership rows store the Jazz account ID in `userAccount`, the workspace relation in `workspaceId`, and active state in `status`. It gives workspace and task reads/edits to active members. The app should separately define which roles can create or delete tasks.

```ts
import { collection, defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [
    collection({
      slug: "workspaces",
      fields: [{ name: "name", type: "text", required: true }],
      access: {
        read: ({ row, session, exists }) => exists("workspaceMemberships", {
          workspaceId: row.id,
          userAccount: session.user.account,
          status: "active",
        }),
        update: ({ row, session, exists }) => exists("workspaceMemberships", {
          workspaceId: row.id,
          userAccount: session.user.account,
          status: "active",
        }),
      },
    }),
    collection({
      slug: "workspaceMemberships",
      fields: [
        { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
        { name: "userAccount", type: "text", required: true },
        { name: "status", type: "select", options: ["active", "pending", "deactivated"] },
      ],
      access: {
        read: ({ row, session }) => ({ userAccount: session.user.account }),
      },
    }),
    collection({
      slug: "tasks",
      fields: [
        { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
        { name: "title", type: "text", required: true },
      ],
      access: {
        read: ({ row, session, exists }) => exists("workspaceMemberships", {
          workspaceId: row.workspaceId,
          userAccount: session.user.account,
          status: "active",
        }),
        update: ({ row, session, exists }) => exists("workspaceMemberships", {
          workspaceId: row.workspaceId,
          userAccount: session.user.account,
          status: "active",
        }),
      },
    }),
  ],
});
```

Use the same identity namespace in the membership record and session comparison. For example, a Better Auth user ID is not automatically a Jazz account ID. The playground keeps Workspaces explicitly public and uses `access: "authenticated"` for Workspace Memberships and Tasks. Membership writes use command mode; Tasks stay direct and local-first. Treat these demo policies as examples, not production defaults.

## Admin entry is a host decision

The host authenticates the person, decides whether they may enter `/admin`, and passes that result through `canAccessAdmin`. A role check for “support staff may use the admin” belongs there. Collection policies still determine which rows that person can read and change.

## Direct collections

Direct collections are local-first and can write while offline. Bebop field constraints and hooks run in the shared client and the admin, but arbitrary app code can bypass them by calling Jazz directly. Keep access control in Jazz policies. Use custom validation and hooks in direct mode for useful feedback and local transformations; do not use them as server-side security or as the only guarantee for external side effects.

```ts
{
  slug: "tasks",
  access: "authenticated",
  writeMode: "direct", // Default.
  fields: [{ name: "title", type: "text", required: true, maxLength: 120 }],
}
```

The client returns after the local write and after hook. Call `waitForGlobal()` when the caller needs the server result. Listen to `client.onMutationError(...)` to report later sync rejections; a successful local return is not a claim that Jazz accepted the write globally.

## Command collections

Use command mode when custom validation or hooks must run at a trusted server boundary. The browser's generated `permissions.ts` denies command collection inserts, updates, and deletes. The CLI also generates `bebop-generated-command-permissions.ts`; use that server-only policy in the Jazz context that creates request-scoped authorization DBs for `can*` checks. Never expose it to the browser or publish it in place of the browser policy.

Mount a Web handler in the host's server/router:

```ts
import { createBebopHandler } from "@bebopdev/core/server";
import { app } from "./bebop-generated-schema.js";
import commandPermissions from "./bebop-generated-command-permissions.js";
import bebopConfig from "./bebop.config.js";

const handleBebop = createBebopHandler({
  app,
  config: bebopConfig,
  async resolveSession(request) {
    // Host code validates auth and CSRF, then creates request-scoped Jazz DBs.
    // authorizationDb uses commandPermissions and the verified actor's session.
    // writeDb is a trusted backend writer attributed to that same actor.
    const actor = await resolveHostActor(request);
    if (!actor) return null;
    return {
      authorizationDb: await actor.createAuthorizationDb(commandPermissions),
      writeDb: await actor.createAttributedWriter(),
      userId: actor.id,
    };
  },
});

export { handleBebop };
```

`resolveHostActor` is host-specific pseudocode: Bebop does not own Better Auth cookies, CSRF rules, or server deployment. The `writeDb` must be created with Jazz backend authority and user attribution to the same verified actor used by `authorizationDb`. Keep it private to this handler. The handler checks access for the requested row/data, runs built-in and custom validation before and after `beforeChange`, writes, waits for Jazz global confirmation, and then runs the after hook. A response with `writeAccepted: true` means Jazz confirmed the mutation but an after hook failed.

The playground provides a concrete Better Auth host integration for `workspaceMemberships`. Its same-origin Vite route verifies the Better Auth cookie and Origin, requests a Better Auth JWT, verifies that token through Jazz's configured JWKS, and creates both the request-scoped authorization DB and the attributed writer from that verified request. The generated command permission bundle is loaded into the server-side Jazz session; the browser still receives `permissions.ts`, which denies direct membership writes. The generated client is configured with `createBebopFetchTransport` to send membership mutations to `/api/bebop/collections/...`.

The generated client's optional `commandTransport` can use the provided same-origin helper:

```ts
import { createBebopFetchTransport } from "@bebopdev/core";

const client = createBebopClient(db, {
  commandTransport: createBebopFetchTransport({ basePath: "/api/bebop" }),
});
```

The host maps that path to the handler. Other auth providers use the same core handler and implement `resolveSession` for their own session model. Command collections cannot enable uploads in this release.
