# Bebop v1 implementation scope

## Product goal

Bebop is an application framework with a simple admin panel that helps developers and support staff edit application data. The host application owns login, hosting, route access, and product-specific authorization decisions. Bebop supplies typed collection config, Jazz schema and permissions, a Local API, and first-party editing screens.

V1 is not a complete content publishing platform. It does not include drafts, revision history, Trash, localization, a rich-text authoring suite, or generic REST/GraphQL APIs. Upload support is a separate feature in progress and is not part of this release foundation plan.

## Release work

### 1. Permissions and host integration

- Expose per-collection Jazz rule builders through `permissions.read`, `insert`, `update`, and `delete` callbacks.
- Deny omitted operations when a collection uses the new `permissions` API; require explicit `rule.always()` grants for public operations and explicit session predicates for authenticated-only access.
- Type the current collection's row reference and expose read-only cross-collection `collections.<slug>.exists.where(...)` helpers.
- Support distinct update checks against the existing row (`whereOld`) and proposed row (`whereNew`).
- Keep the older Payload-like `access` API as deprecated compatibility behavior while new configs migrate to `permissions`.
- Use Jazz `can*` advice to guide admin screens, while keeping Jazz enforcement authoritative.
- Document the separate host decision to allow entry to `/admin`.
- Include a public demo policy, authenticated command writes, and a workspace-membership rule example.

### 2. Direct and trusted writes

- Default collections to `writeMode: "direct"`: local-first writes can run offline and Jazz validates final permissions.
- Treat Bebop custom validators and hooks in direct mode as client-side feedback; direct Jazz calls can bypass them.
- Add `writeMode: "command"` to deny direct browser mutations and route writes through a host-mounted Request/Response handler.
- Require the host to authenticate the request, prevent CSRF where applicable, bind the authorization session to the actor, and provide a trusted writer with attribution to that same user.
- Recheck access and validation on the server, run change hooks, write with Jazz, and report success after global confirmation.
- Keep Better Auth as an example host integration; keep other identity systems host-owned.

### 3. Validation

- Add required checks, text length limits, numeric bounds and integer validation, plus typed custom field validators.
- Run validation in admin forms and the shared client.
- Revalidate command writes at the trusted handler boundary.
- Preserve Jazz schema and access checks for direct writes; clearly state that direct custom callbacks are bypassable.

### 4. Stable typed Local API and search

- Document the generated client as the v1 Local API: query builders, filters, sort, pagination, relationships, joins, uploads, and durability.
- Search configured text fields with Jazz `contains` queries and query unions instead of scanning full document rows in the browser.
- Deduplicate multi-field search matches, sort and paginate results, and bound document rows to the requested page. Exact counts use ID-only queries because the pinned Jazz API does not expose a count aggregate.
- Support interactive lists and search for collections up to 10,000 documents as a target, not as a performance guarantee. Measure larger or unusually large records before adopting.
- Verify each query and permission behavior against `jazz-tools@2.0.0-alpha.57`.

### 5. Schema evolution and release workflow

- Document schema changes against the pinned Jazz release.
- Walk through adding an optional collection field while preserving existing local rows.
- Require a reviewed migration or backfill for incompatible schema changes.
- Never make a reset the default migration path.
- Verify that a clean temporary install can generate, validate, type-check, and run the basic example with pnpm.

## Acceptance

- New `permissions` rules compile to explicit Jazz grants; omitted operations deny, public and authenticated rules are explicit, and the deprecated `access` API remains compatible during migration.
- Admin entry control remains a host decision, independent from collection access.
- Direct writes remain local-first, with later global failures observable; command writes reject direct browser writes and enforce host session, access, validation, hooks, attribution, and global confirmation.
- Built-in and custom validation produce useful field errors in admin/client flows and command writes cannot bypass them.
- Search covers all configured text fields, applies filters before union, deduplicates matches, sorts and paginates, and limits full documents to one page. ID-only exact count behavior is covered at the 10,000-record target.
- The schema walkthrough demonstrates a compatible additive change with existing data preserved under the pinned Jazz version.
- A clean install can generate, validate, run, and type-check the basic example; package checks use pnpm.

The detailed contracts and commands are in [access control](./access-control.md), the [Local API guide](./local-api.md), and the [schema evolution walkthrough](./schema-evolution.md). The example upload field remains outside this v1 foundation plan.
