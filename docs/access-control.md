# Collection permissions and server writes

Bebop's `permissions` option is a small, collection-scoped wrapper around Jazz's permission builders. Jazz enforces the generated rules for reads and direct writes. Command writes use the server authorization callback described below. Permission checks in the admin guide the interface; they do not replace enforcement.

## Collection permission rules

Declare a callback for every operation the collection should allow. The operation names follow Jazz: `read`, `insert`, `update`, and `delete`. Any omitted operation is denied. An empty `permissions: {}` object denies all four operations.

```ts
import { defineConfig, type CollectionDefinition } from "@bebopdev/core";

const taskFields = [
  { name: "name", type: "text", required: true },
  { name: "workspace", type: "relationship", relationTo: "workspaces" },
  { name: "author", type: "relationship", relationTo: "users", required: true },
  { name: "assignee", type: "relationship", relationTo: "users" },
  { name: "status", type: "select", options: ["backlog", "todo", "done"] },
] as const;

export default defineConfig({
  collections: [{
    slug: "tasks",
    fields: taskFields,
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
  } satisfies CollectionDefinition<typeof taskFields>],
});
```

`CollectionDefinition<typeof taskFields>` gives callbacks the configured fields while keeping the collection a plain object. The row callback receives Jazz's symbolic `RowContext`, not a loaded document. TypeScript cannot infer a sibling inline `fields` property into callback parameters, so use this `satisfies` annotation when callbacks need field-specific checks:

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

The playground grants public access to its demo Workspaces and Media, gives authenticated sessions read access to Workspace Memberships, and scopes Task reads and writes through active Workspace membership. Membership writes use `writeMode: "command"`; the deployed Jazz policy denies direct writes.

The older `access` option remains supported for compatibility and is deprecated. It retains its authenticated default and legacy callback behavior. Do not set both `access` and `permissions` on one collection.

## Admin entry

With the built-in Better Auth integration, Bebop checks the Better Auth Admin plugin before the admin UI is shown. Only admins can enter by default, including IDs configured with Better Auth's `adminUserIds`. An auth collection can customize this decision in Payload's `access.admin` shape:

```ts
import { defineConfig } from "@bebopdev/core";

export default defineConfig({
  collections: [{
    slug: "users",
    auth: true,
    fields: [],
    access: {
      admin: ({ req: { user, isAdmin } }) => isAdmin || user.role === "support",
    },
  }],
});
```

The callback runs on the server with the verified Better Auth user. `req.isAdmin` comes from the Admin plugin's `user:list` permission check, which includes its default admin role and configured `adminUserIds`. The playground mounts `createBebopAdminAccessHandler` at `/api/bebop/admin-access` and passes its result to `BebopAdmin`. Other auth providers can use the same handler with their own verified `resolveSession`; a host without that handler can supply a `canAccessAdmin` result directly. This controls entry to the UI. Jazz enforces collection reads and writes for app sessions, with the built-in admin read override described below.

The Better Auth integration also gives the verified `admin` role read access across every generated application collection. Generated Jazz read rules combine the admin role claim with each collection's configured read rule, so an admin can inspect rows across Workspaces even when the regular rule is workspace-scoped. When a collection omits its read callback, the admin role still grants read access. The auth collection continues to use Better Auth's admin API. This is a read-only override: create, update, and delete continue to follow the collection's normal Jazz rules, and command writes continue to require the host's server-side `authorize` check. For another auth provider, include the trusted `role: "admin"` claim in the Jazz session or adapt the generated permissions to that provider's verified admin claim.

## Direct collections

Direct collections are local-first and can write while offline. Bebop field constraints and hooks run in the shared client and the admin, but arbitrary app code can bypass them by calling Jazz directly. Keep authorization in Jazz `permissions`. Use direct-mode validation and hooks for useful feedback and local transformations; do not rely on them as the sole protection for external side effects.

The client returns after the local write and after hook. Call `waitForGlobal()` when the caller needs the server result. Listen to `client.onMutationError(...)` to report later sync rejections; a successful local return does not mean Jazz accepted the write globally.

## Command collections

Use command mode when custom validation or hooks must run at a trusted server boundary. The generated `permissions.ts` denies command collection inserts, updates, and deletes for all ordinary Jazz sessions. A trusted backend writer can still write with user attribution. The handler therefore requires a server-side `authorize` callback for each command collection. It runs before and after `beforeChange` so a hook cannot change a permitted request into an unreviewed write. Return `false` to deny the command.

Jazz's `canInsert`, `canUpdate`, and `canDelete` methods advise on the **deployed** Jazz policy. They cannot authorize a command write when that policy intentionally denies direct writes, even if the server imports the generated `bebop-generated-command-permissions.ts` bundle. That bundle does not replace the deployed policy. In command mode, the host callback is the write authority; it must check the acting user and any relevant current or proposed row. Jazz confirms the attributed backend write globally, and Jazz's deployed read policy still controls request-scoped reads.

The generated Jazz `permissions.insert`, `update`, and `delete` callbacks do not authorize command writes. Put command write rules in the handler's `authorize` callback; keep Jazz `permissions.read` for request-scoped reads.

Mount a Web handler in the host's server/router:

```ts
import { createBebopHandler } from "@bebopdev/core/server";
import { app } from "./bebop-generated-schema.js";
import permissions from "./permissions.js";
import bebopConfig from "./bebop.config.js";

const handleBebop = createBebopHandler({
  app,
  config: bebopConfig,
  async authorize({ collection, operation, userId, data, originalDoc, db }) {
    // Apply your server-side command policy here. Use db for scoped reads.
    return collection === "workspaceMemberships" &&
      await canManageMembership({ operation, userId, data, originalDoc, db });
  },
  async resolveSession(request) {
    // Host code validates auth and CSRF, then creates request-scoped Jazz DBs.
    // authorizationDb reads as the verified actor.
    // writeDb has backend authority and is attributed to that actor.
    const actor = await resolveHostActor(request);
    if (!actor) return null;
    return {
      authorizationDb: await actor.createAuthorizationDb(permissions),
      writeDb: await actor.createAttributedWriter(),
      userId: actor.id,
    };
  },
});

export { handleBebop };
```

`resolveHostActor` and `canManageMembership` are host-specific pseudocode: Bebop does not own Better Auth cookies, CSRF rules, or server deployment. The `writeDb` must have Jazz backend authority and user attribution to the same verified actor used by `authorizationDb`. Keep it private to this handler. The handler validates, calls `authorize` on the proposed input and again after `beforeChange`, performs the write, waits for global confirmation, then runs the after hook. A response with `writeAccepted: true` means Jazz confirmed the mutation but an after hook failed. Without an `authorize` callback, the handler rejects command writes.

The playground provides a Better Auth host integration for `workspaceMemberships`. Its same-origin Vite route verifies the Better Auth cookie and Origin, requests a Better Auth JWT, verifies it through Jazz's configured JWKS, and creates request-scoped reader and attributed writer DBs. Its command authorizer permits authenticated users, matching this demo's permissive Membership rule. A production app should narrow that callback to the roles and Workspaces that may manage members. The browser receives `permissions.ts`, which denies direct Membership writes. The generated client uses `createBebopFetchTransport` to send those mutations to `/api/bebop/collections/...`.

```ts
import { createBebopFetchTransport } from "@bebopdev/core";

const client = createBebopClient(db, {
  commandTransport: createBebopFetchTransport({ basePath: "/api/bebop" }),
});
```

Command collections cannot enable uploads in this release.
