# Collection permissions and server writes

Bebop's `permissions` option is a small, collection-scoped wrapper around Jazz's permission builders. Jazz enforces the generated rules for reads and writes. Permission checks in the admin guide the interface; they do not replace Jazz enforcement.

## Collection permission rules

Declare a callback for every operation the collection should allow. The operation names follow Jazz: `read`, `insert`, `update`, and `delete`. Any omitted operation is denied. An empty `permissions: {}` object denies all four operations.

```ts
import { collection, defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [collection({
    slug: "tasks",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "workspace", type: "relationship", relationTo: "workspaces" },
      { name: "author", type: "relationship", relationTo: "users", required: true },
      { name: "assignee", type: "relationship", relationTo: "users" },
      { name: "status", type: "select", options: ["backlog", "todo", "done"] },
    ],
    permissions: {
      read: ({ rule, collections, session }) => rule.where((task) =>
        collections.workspaceMemberships.exists.where({
          workspaceId: task.workspaceId,
          userId: session.claims.sub,
          status: "active",
        }),
      ),
      insert: ({ rule, collections, session, allOf }) => rule.where((newTask) =>
        allOf([
          { authorId: session.claims.sub },
          collections.workspaceMemberships.exists.where({
            workspaceId: newTask.workspaceId,
            userId: session.claims.sub,
            status: "active",
          }),
        ]),
      ),
      update: ({ rule, collections, session, allOf, anyOf }) => rule
        .whereOld((currentTask) => allOf([
          anyOf([{ authorId: session.claims.sub }, { assigneeId: session.claims.sub }]),
          collections.workspaceMemberships.exists.where({
            workspaceId: currentTask.workspaceId,
            userId: session.claims.sub,
            status: "active",
          }),
        ]))
        .whereNew((updatedTask) => allOf([
          anyOf([{ authorId: session.claims.sub }, { assigneeId: session.claims.sub }]),
          collections.workspaceMemberships.exists.where({
            workspaceId: updatedTask.workspaceId,
            userId: session.claims.sub,
            status: "active",
          }),
        ])),
      delete: ({ rule, collections, session, allOf }) => rule.where((task) => allOf([
        { authorId: session.claims.sub },
        collections.workspaceMemberships.exists.where({
          workspaceId: task.workspaceId,
          userId: session.claims.sub,
          status: "active",
        }),
      ])),
    },
  })],
});
```

`collection(...)` preserves the collection's field types for the current row reference. The row callback receives Jazz's symbolic `RowContext`, not a loaded document:

- `read`: the existing row being considered for the result.
- `insert`: the proposed new row.
- `delete`: the existing row the caller wants to remove.
- `update.whereOld`: the stored row before the change.
- `update.whereNew`: the proposed row after the change.

These callbacks build a declarative policy; they do not run once per document as arbitrary JavaScript. Express comparisons with row conditions and Jazz helpers. For checks against another collection, `collections.<slug>.exists.where(...)` creates a read-only existence predicate; it does not grant permissions on that other collection. `allOf`, `anyOf`, `allowedTo`, `isCreator`, and `session` are the corresponding Jazz helpers. A condition such as `{ authorId: session.claims.sub }` compares the candidate row's stored field with a verified session claim.

The playground's Better Auth integration uses `session.claims.sub` as the Better Auth user ID for its Task rules. An application must compare values from the same identity namespace; a Better Auth user ID is not automatically equal to a Jazz account ID. Use `session.user.account` only when the stored ownership field actually contains that Jazz account ID.

`rule.where(...)` checks one row condition. On update, use both `whereOld` and `whereNew` when access to the original and resulting row differs. For example, requiring an active membership in both checks prevents an update from moving a Task into a Workspace where the actor has no active membership.

## Public and authenticated rules

Use Jazz's `rule.always()` or `rule.never()` to grant or deny an operation unconditionally. Each grant is explicit:

```ts
permissions: {
  read: ({ rule }) => rule.always(),
  insert: ({ rule }) => rule.always(),
  update: ({ rule }) => rule.always(),
  delete: ({ rule }) => rule.always(),
}
```

For authenticated-only behavior, use Jazz's session condition:

```ts
permissions: {
  read: ({ rule, session }) => rule.where(
    session.where({ authMode: { in: ["external", "local-first"] } }),
  ),
  // Add insert, update, and delete callbacks explicitly when those operations are allowed.
}
```

The playground grants public access to its demo Workspaces and Media, gives authenticated sessions access to Workspace Memberships, and scopes Task reads and writes through active Workspace membership. Membership writes use `writeMode: "command"`; the generated browser policy denies direct writes, while the server authorization policy retains the configured rules.

The older `access` option remains supported for compatibility and is deprecated. It retains its authenticated default and legacy callback behavior. Do not set both `access` and `permissions` on one collection.

## Admin entry

With the built-in Better Auth integration, Bebop checks the Better Auth Admin plugin before the admin UI is shown. Only admins can enter by default, including IDs configured with Better Auth's `adminUserIds`. An auth collection can customize this decision in Payload's `access.admin` shape:

```ts
collection({
  slug: "users",
  auth: true,
  fields: [],
  access: {
    admin: ({ req: { user, isAdmin } }) => isAdmin || user.role === "support",
  },
});
```

The callback runs on the server with the verified Better Auth user. `req.isAdmin` comes from the Admin plugin's `user:list` permission check, which includes its default admin role and configured `adminUserIds`. The playground mounts `createBebopAdminAccessHandler` at `/api/bebop/admin-access` and passes its result to `BebopAdmin`. Other auth providers can use the same handler with their own verified `resolveSession`; a host without that handler can supply a `canAccessAdmin` result directly. This controls entry to the UI. Jazz collection permissions still control which rows a user can read or mutate.

## Direct collections

Direct collections are local-first and can write while offline. Bebop field constraints and hooks run in the shared client and the admin, but arbitrary app code can bypass them by calling Jazz directly. Keep authorization in Jazz `permissions`. Use direct-mode validation and hooks for useful feedback and local transformations; do not rely on them as the sole protection for external side effects.

The client returns after the local write and after hook. Call `waitForGlobal()` when the caller needs the server result. Listen to `client.onMutationError(...)` to report later sync rejections; a successful local return does not mean Jazz accepted the write globally.

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

`resolveHostActor` is host-specific pseudocode: Bebop does not own Better Auth cookies, CSRF rules, or server deployment. The `writeDb` must be created with Jazz backend authority and user attribution to the same verified actor used by `authorizationDb`. Keep it private to this handler. The handler checks configured Jazz permissions, validates before and after `beforeChange`, performs the write, waits for global confirmation, then runs the after hook. A response with `writeAccepted: true` means Jazz confirmed the mutation but an after hook failed.

The playground provides a Better Auth host integration for `workspaceMemberships`. Its same-origin Vite route verifies the Better Auth cookie and Origin, requests a Better Auth JWT, verifies it through Jazz's configured JWKS, and creates request-scoped authorization and attributed writer DBs. The generated command permission bundle stays server-side; the browser receives `permissions.ts`, which denies direct Membership writes. The generated client uses `createBebopFetchTransport` to send those mutations to `/api/bebop/collections/...`.

```ts
import { createBebopFetchTransport } from "@bebopdev/core";

const client = createBebopClient(db, {
  commandTransport: createBebopFetchTransport({ basePath: "/api/bebop" }),
});
```

Command collections cannot enable uploads in this release.
