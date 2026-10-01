# Deployment architecture

This guide explains which parts of the Bebop playground run in development and what must be hosted in production. The short version: Better Auth and Bebop's HTTP handlers belong in the application API; Jazz Core handles sync. Better Auth does not need its own process.

## Development topology

The playground's `pnpm dev` command runs the Bebop CLI, which generates and watches project files, and launches Vite. The Vite Node process serves the frontend on port `5173` and installs the playground's auth middleware.

```text
Browser
  ├── app pages and /api/auth/*, /api/bebop/* ──> Vite Node process (:5173)
  │                                                 ├── frontend dev server
  │                                                 ├── Better Auth request handler
  │                                                 └── Bebop API handlers
  └── Jazz sync ─────────────────────────────────> local Jazz Core (dynamic port)
                                                    started by the Jazz Vite plugin
```

Better Auth is an HTTP handler mounted on Vite's server, not a separate listener. The middleware lazily loads `auth.ts` on the first matching request and caches the resulting handlers for reuse. That module creates the Better Auth instance and a Jazz backend session used by the handlers. See [`vite.config.ts`](../apps/playground/vite.config.ts) and [`auth.ts`](../apps/playground/auth.ts).

With the playground's pinned `jazz-tools@2.0.0-alpha.58`, the Jazz Vite plugin starts a local Jazz Core server when Vite runs in development mode. It binds a separate, dynamically chosen port and uses the configured data directory. The plugin's implementation starts Core through the native `jazz-napi` binding; it does not spawn another Node server process. The `bebop dev` CLI is a process supervisor around Vite, not another application API service. Jazz's [client setup guide](https://jazz.tools/docs/getting-started/client-setup) describes the embedded local server and the hosted/self-hosted alternatives.

### Where writes and hook logs go

`writeMode` selects where Bebop invokes a collection's mutation hooks:

| Mode | Mutation path | Hook execution and log destination |
| --- | --- | --- |
| `direct` (default) | Browser writes to its local Jazz replica; Jazz syncs changes to Core. | Hooks run in the browser. With `logging.hooks: true`, events go to the browser console. Core receiving a synced row does not run Bebop hooks. |
| `command` | Browser sends a request to the app's `/api/bebop/collections/...` route; the host authorizes and writes through a trusted Jazz backend session. | Hooks run in the app API process. With `logging.hooks: true`, Pino writes structured events to that process's stdout/stderr, which a hosting platform can collect. |

Jazz direct writes are local-first: they update the browser replica and then sync upstream. A successful local write is not the same as Core confirming it globally. See [Bebop direct and command writes](./architecture.md#direct-and-command-writes) and [Jazz sync behavior](https://jazz.tools/docs/concepts/how-sync-works).

Hook logging does not change a collection's write mode or forward browser logs to the API. It logs lifecycle stages reached on the execution path. A missing callback is recorded as `outcome: "skipped"` with `callbackConfigured: false`.

In the playground, Workspaces and Workspace Memberships use command mode; other collections default to direct mode unless configured otherwise. Workspace creation has an additional exception: the POST route calls a custom handler that creates the Workspace and its first admin Membership in one exclusive transaction. That path bypasses the generic Bebop command handler, so it must be instrumented separately if it needs Bebop-style hook logs. The custom route is mounted in [`vite.config.ts`](../apps/playground/vite.config.ts) and implemented in [`auth.ts`](../apps/playground/auth.ts).

## Production topology

Vite's `configureServer` middleware is development-only. The current `vite preview` script serves the built frontend; it does not mount the Better Auth or Bebop API routes. A production deployment therefore needs a production-capable host for those routes, such as an existing Node application server or serverless API routes.

For the simplest setup, use Jazz Cloud for Core and operate one application API service:

```text
Browser ── static frontend ──────────────────────> CDN / web host
        ├── /api/auth/* and /api/bebop/* ───────> your application API
        └── Jazz sync ──────────────────────────> Jazz Cloud

Application API ── backend Jazz session ────────> Jazz Cloud
```

The application API can host Better Auth and Bebop routes in the same Node process and on the same origin. It should:

1. Serve Better Auth at `/api/auth/*`, including its JWKS endpoint.
2. Mount `createBebopHandler` for command collections and supply request authentication, authorization, and an attributed backend writer.
3. Preserve any app-specific routes, including the atomic workspace-creation route if that flow is used.
4. Create a server-side Jazz backend session using the production app ID, Jazz server URL, schema, permissions, and backend secret.
5. Keep Better Auth, Jazz backend, and Jazz admin secrets out of the browser bundle. The admin secret is for schema/permission deployment; it is not a runtime browser credential.

The frontend must use the production Jazz app ID and server URL at build/runtime configuration. For Jazz Cloud, the documented sync URL is `https://v2.sync.jazz.tools/`. Publish the schema and permissions to the target Jazz server as part of deployment. See [Jazz Server Setup](https://jazz.tools/docs/getting-started/server-setup) and the [TypeScript backend setup](https://jazz.tools/docs/install/typescript-server).

Jazz Core must be able to reach the Better Auth JWKS endpoint over public HTTPS. Configure the Jazz server with the exact Better Auth JWT issuer and audience as well as the JWKS URL; a local or private-only URL will not work for Jazz Cloud. See [Jazz's auth provider integration guide](https://jazz.tools/docs/recipes/auth/auth-provider-integration).

If you choose to self-host Jazz Core, operate it as an additional service with persistent storage, a public TLS endpoint, and the production JWT/JWKS configuration. Configure both the browser client and the app API's backend session to use that same Jazz server URL. Jazz's server guide lists the self-hosted server options and secrets.

## Production checklist

- Deploy the frontend separately or serve it from the application API host.
- Mount Better Auth and Bebop routes in the production host; do not rely on Vite's development middleware.
- Choose Jazz Cloud or a persistent self-hosted Jazz Core deployment.
- Make the production Better Auth JWKS URL reachable by Jazz and align JWT issuer/audience values.
- Publish the matching schema and permissions to the correct Jazz app/server before serving traffic.
- Set `writeMode: "command"` only for collections whose writes must execute hooks or trusted validation on the API. Direct mode remains browser-executed and local-first.
- Collect stdout/stderr from the API host for Pino command-hook logs. Direct-hook logs remain in the user's browser unless an explicit forwarding endpoint is added.
- Preserve custom multi-collection transactions and add logging to those routes explicitly; the generic command handler handles one collection mutation per request.

The playground pins Jazz to `2.0.0-alpha.58`. The linked Jazz documentation is canonical and may describe newer releases; check the installed package behavior and CLI flags when changing the pin or preparing a deployment.
