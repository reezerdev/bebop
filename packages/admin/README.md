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

Upload-enabled collections have a file picker with drag and drop, replacement, preview, and download. A field pointing at an upload collection can create media or choose an existing document; creating media does not save the parent form. Configure upload collections and fields in Bebop config, then regenerate the schema and manifest before opening the admin.

See the [repository README](https://github.com/reezerdev/bebop#readme) for full host and authentication wiring.
