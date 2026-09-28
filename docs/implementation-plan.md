# Bebop implementation plan

## Goal

Build a TypeScript headless CMS whose collection configuration compiles to Jazz v2 tables, relations, and permissions. Bebop owns the developer-facing configuration, validation, lifecycle, and typed CRUD API; Jazz owns storage, queries, sync, and the final authorization decision for direct client operations.

The first release is a useful CMS with a first-party admin interface, demonstrated by a small host app. The admin UI lives in `@bebop/admin`; the playground only integrates it.

## Ground rules

1. **One schema source:** `bebop.config.ts` defines collections. Generated `bebop-generated-schema.ts`, `bebop-admin-manifest.ts`, Jazz's `schema.ts` entry point, and `permissions.ts` are outputs, never separately edited sources.
2. **Compilable access:** use a declarative access DSL that can be translated to Jazz policies. Reject unsupported rules during generation. Do not accept arbitrary `({ user }) => boolean` functions as security rules.
3. **Explicit write paths:**
   - `direct` collections use Jazz client writes and can work offline. Jazz schema and permissions are authoritative. Bebop SDK validation improves feedback but must not be presented as a server guarantee.
   - `command` collections send writes through a Bebop backend when authoritative validation or before/after hooks are required. Deny direct client writes in generated Jazz permissions. The backend verifies the user and access rule, validates and transforms data, writes with backend authority and user attribution, then waits for server durability before reporting success. These writes require a connection.
4. **Durable effects:** external `afterChange`/`afterDelete` effects belong only to command collections. Use an idempotent job or outbox record keyed by mutation ID; do not imply exactly-once delivery.
5. **Keep Jazz replaceable at the boundary:** Bebop's config and public types should not expose Jazz internals. The adapter may still be the only database implementation in v1.
6. **Pin the Jazz alpha version:** keep Jazz-specific generation behind the Bebop package boundary and verify generated code against the pinned release before upgrading.

## Proposed public API

```ts
import { defineConfig } from '@bebop/core'

export default defineConfig({
  collections: [
    {
      slug: 'users',
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      slug: 'posts',
      labels: { singular: 'Post', plural: 'Posts' },
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'status', type: 'select', options: ['draft', 'published'] },
        { name: 'author', type: 'relationship', relationTo: 'users', required: true },
      ],
    },
  ],
})
```

Collection slugs and select values retain literal types; `find`, `findById`, `create`, `update`, and `delete` infer their input and result from the config. A relationship is declared with Payload's `relationship` field type while the generated Jazz schema stores its UUID in a `<name>Id` column. Access callbacks and client-side lifecycle hooks are configured on each collection.

## Milestones

| Stage | Deliverable | Exit criteria |
| --- | --- | --- |
| 0. Jazz feasibility spike | Pin one Jazz v2 alpha; build a minimal app with two related tables, row permissions, a local write, a rejected write, a backend request, and a schema change. | Confirm the supported DSL, type inference, durability waits, permission behavior, and migration workflow. Record any Jazz limitation that changes the design. |
| 1. Config and compiler | Define collections and the first fields: text, number, integer, boolean, date, select, JSON, and single relation. Add config checks and deterministic generation of `bebop-generated-schema.ts`, Jazz's `schema.ts` entry point, `permissions.ts`, and a metadata manifest. | Example config generates valid Jazz artifacts; invalid relation targets, field names, or access expressions fail with useful diagnostics; generation is repeatable. |
| 2. Admin UI package | Build `@bebop/admin` with shadcn/ui, a Payload-style dashboard, collection lists, and generated create/edit forms. Generate the admin manifest from config and mount the package at `/admin` in the playground. | Every supported field kind renders and persists; configured list columns/search fields work; the package ships its own CSS; direct `/admin` navigation works. |
| 3. Typed headless API | Implement typed find/findById/create/update/delete, filtering, sort, and pagination over the generated Jazz app. Add direct-mode validation and a clear pending/accepted/rejected mutation result. | Type checks reject wrong collection fields; CRUD and relation queries work; offline direct writes reconcile or report authority rejection. |
| 4. Security and command lifecycle | Compile a small access DSL for public, authenticated, owner, and row-field conditions. Add command-mode endpoint, authoritative validation, `beforeValidate`, `beforeChange`, `beforeDelete`, and durable effect dispatch. | Unauthorized read/write attempts fail in policy and API tests; direct writes to command collections fail; retries do not duplicate external effects. |
| 5. Extensibility and release | Extend the starter `bebop` CLI with migration generation and plugin workflows. Add a minimal plugin contract for deterministic collection/field contributions and named hooks. Publish a runnable example and API documentation. | Two example plugins compose without collisions; a schema change produces a reviewed Jazz migration; a new developer can start and exercise the sample without editing generated files. |

### Stage 0 questions to settle before broad implementation

- Can the pinned Jazz release express every proposed access helper as a server-enforced policy? If not, shrink the DSL.
- Which Jazz durability tier should a successful command response promise? Define this in the API and test it against rejection and disconnect cases.
- How should command mode authenticate callers in the example app? Choose one supported Jazz account/JWT flow and keep provider-specific auth outside the core.
- Can generated TypeScript schema preserve field and relation inference without unacceptable editor latency? Test this on a realistic sample, not only one table.
- What behavior should a client see when a relation target is missing, unreadable, or not yet synced?

## Workspace shape

```text
apps/
  playground/  React app and Bebop config; exercises the workspace package
packages/
  bebop/       config DSL, field definitions, and first Jazz compiler
  admin/       first-party React admin and shadcn/ui components
docs/
  implementation-plan.md
examples/      add standalone examples later
```

Keep the config/compiler and UI in separate packages. The admin package owns its UI and private Jazz adapter; the playground is an integration fixture. Add `examples/` when there are separate examples to maintain.

## Verification

- Compiler golden tests for field mappings, relation names, policy output, and deterministic generation.
- Type-level tests for required/optional fields, select literals, collection keys, relation results, and invalid CRUD inputs.
- Integration tests against the pinned Jazz release for permission filtering, old/new row updates, offline rejection, durability, and migrations.
- End-to-end example: author creates a draft, publishes it, another user reads the published post, and an unauthorized edit fails.

## Outside the first release

Media, rich text, drafts/versioning, localization, webhooks as a generic plugin surface, collaborative editing, and field-level access. These can follow the same generated metadata and runtime contracts once the first admin release is stable.

## Current Jazz references

- [Tables and relations](https://jazz.tools/docs/schemas/defining-tables)
- [Permissions and server enforcement](https://jazz.tools/docs/auth/permissions)
- [Local writes and durability](https://jazz.tools/docs/writing/writing-data)
- [Migrations](https://jazz.tools/docs/schemas/migrations)
- [Column types](https://jazz.tools/docs/schemas/column-types)

These references describe the current Jazz v2 alpha and should be rechecked when Stage 0 begins.
