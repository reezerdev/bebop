# @bebopdev/admin

The first-party React admin UI for Bebop collections stored in Jazz. The host application owns routing, authentication, and `JazzProvider`; this package renders the collection dashboard and document screens.

## Install

```sh
pnpm add @bebopdev/admin @bebopdev/core jazz-tools react react-dom react-router-dom
```

The current release targets React 19 and `jazz-tools@2.0.0-alpha.58`.

## Mount the admin

Import the packaged stylesheet once, then mount `BebopAdmin` beneath the host router and Jazz provider at `/admin/*`:

```tsx
import { BebopAdmin } from "@bebopdev/admin";
import "@bebopdev/admin/styles.css";

<Routes>
  <Route
    path="/admin/*"
    element={
      <BebopAdmin
        app={app}
        client={bebopClient}
        manifest={bebopAdminManifest}
        canAccessAdmin={isSignedIn}
      />
    }
  />
</Routes>
```

`app`, `bebopAdminManifest`, and the typed client are generated from `bebop.config.ts` by `@bebopdev/cli`. The host can pass the current user's name, email, and logout action through the admin props.

Relationship fields use a searchable picker and load Jazz-backed options in pages of 25. For protected or external collections, provide a loader keyed by collection slug. It receives `{ search, limit, offset }` while the picker is open, or `{ ids, limit, offset }` to resolve labels for selected values and visible relation cells:

```tsx
<BebopAdmin
  {...props}
  relationOptionLoaders={{
    users: async ({ search, ids, limit, offset }) => {
      if (ids?.length) return { options: await lookupUserLabels(ids), hasMore: false };
      const result = await searchUsers({ search, limit, offset });
      return { options: result.users, hasMore: result.hasMore };
    },
  }}
/>
```

The loader should enforce the host's access rules and return only the requested page. The admin keeps selected labels cached while the user searches and pages through results.

## Admin sign-in screen

The host still owns authentication and routing. For an admin-specific sign-in screen, render `BebopAdminLogin` from the host's signed-out branch for `/admin`; it uses the admin theme and delegates credential handling to the host. This keeps each app's own sign-in page independent. If the host supports first-user setup, pass `firstUserSetup`: the package checks availability and owns the first-admin prompt and form, while the host supplies the server status check and account creation handler.

```tsx
import { BebopAdminLogin } from "@bebopdev/admin";

<BebopAdminLogin
  onSubmit={async ({ email, password }) => {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) throw new Error(result.error.message ?? "Could not log in.");
  }}
  firstUserSetup={{
    checkAvailability: async () => {
      const response = await fetch("/api/admin-setup", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not check admin setup.");
      const result = await response.json() as { available?: boolean };
      return result.available === true;
    },
    onCreateFirstAdmin: async ({ name, email, password }) => {
      const result = await authClient.signUp.email({ name, email, password });
      if (result.error) throw new Error(result.error.message ?? "Could not create first admin.");
    },
  }}
/>
```

The setup status endpoint should report whether the auth system has any users. The auth server must enforce that first-user creation is allowed only while the user store is empty and grants that account admin access.

For `writeMode: "command"` collections, the admin reads list pages, counts, joins, and document details from Jazz's remote tier. This keeps a globally confirmed server write visible when the browser's local replica has not received it yet. These admin views wait for Core while offline. The generated client remains local-first by default, and direct collections keep local-first admin reads.

Upload-enabled collections have a file picker with drag and drop, replacement, preview, and download. A field pointing at an upload collection can create media or choose an existing document; creating media does not save the parent form. Configure upload collections and fields in Bebop config, then regenerate the schema and manifest before opening the admin.

An `auth: true` Users collection is managed through Better Auth's Admin plugin rather than Jazz CRUD. Pass `authClient` and `canManageUsers` to show its user table and Create User form. The title column opens a user detail page where name and email can be updated. These actions use Better Auth's protected user-management APIs; Better Auth enforces the current administrator's permissions.

See the [repository README](https://github.com/reezerdev/bebop#readme) for full host and authentication wiring.
