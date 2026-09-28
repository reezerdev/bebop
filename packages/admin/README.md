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

See the [repository README](https://github.com/reezerdev/bebop#readme) for full host and authentication wiring.
