# @bebopdev/admin

The first-party React admin UI for Bebop collections stored in Jazz. The host application owns routing, authentication, and `JazzProvider`; this package renders the collection dashboard and document screens.

## Install

```sh
pnpm add @bebopdev/admin @bebopdev/core jazz-tools react react-dom react-router-dom
```

The current release targets React 19 and `jazz-tools@2.0.0-alpha.57`.

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

For `writeMode: "command"` collections, the admin reads list pages, counts, joins, and document details from Jazz's remote tier. This keeps a globally confirmed server write visible when the browser's local replica has not received it yet. These admin views wait for Core while offline. The generated client remains local-first by default, and direct collections keep local-first admin reads.

Upload-enabled collections have a file picker with drag and drop, replacement, preview, and download. A field pointing at an upload collection can create media or choose an existing document; creating media does not save the parent form. Configure upload collections and fields in Bebop config, then regenerate the schema and manifest before opening the admin.

An `auth: true` Users collection is managed through Better Auth's Admin plugin rather than Jazz CRUD. Pass `authClient` and `canManageUsers` to show its user table and Create User form. The title column opens a user detail page where name and email can be updated. These actions use Better Auth's protected user-management APIs; Better Auth enforces the current administrator's permissions.

See the [repository README](https://github.com/reezerdev/bebop#readme) for full host and authentication wiring.
