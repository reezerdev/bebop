# Schema evolution with local data

This walkthrough uses `examples/basic` and the pinned `jazz-tools@2.0.0-alpha.57`. It demonstrates an additive optional field while keeping the same application ID and browser profile, so existing browser-local Jazz records remain available.

The example commits an initial Jazz schema snapshot at `examples/basic/migrations/snapshots/20260928T173729-1f10b274c23c.json`. That snapshot gives Jazz a version to compare against when the schema changes. Keep snapshots and any reviewed migration files in source control.

## 1. Generate and validate the starting schema

From the repository root:

```sh
pnpm install
pnpm --filter @bebopdev/example-basic generate
pnpm --filter @bebopdev/example-basic validate:schema
pnpm --filter @bebopdev/example-basic check
```

`bebop validate` runs Jazz's local schema and permissions validation against the generated `schema.ts` and `permissions.ts`. It checks that those files compile to valid Jazz schema and permission structures. It does not inspect browser IndexedDB, compare records, or prove that a schema change preserves a particular user's data.

Start the example with `pnpm --filter @bebopdev/example-basic dev`, open `/admin`, and create a few Todos. Close the dev server after confirming the records are visible. Keep the same browser profile and `appId` for the schema change below.

## 2. Add an optional field and record the schema version

In `examples/basic/bebop.config.ts`, add this optional field to the `todos` collection:

```ts
{ name: "priority", type: "select", options: ["low", "normal", "high"] },
```

Then regenerate and validate the generated schema, and ask the pinned Jazz CLI to compare it with the committed snapshot:

```sh
pnpm --filter @bebopdev/example-basic generate
pnpm --filter @bebopdev/example-basic validate:schema
pnpm --filter @bebopdev/example-basic check
pnpm --filter @bebopdev/example-basic exec jazz-tools migrations create --name add-todo-priority
```

Review the new diff in `bebop-generated-schema.ts`, the generated migration stub, and the new snapshot. For this optional enum column, alpha.57 infers `s.add.enum("low", "normal", "high", { default: null })`, so rows written with the old schema receive an unset value when read through the new schema. Confirm that default is right for the app, then keep the reviewed migration and snapshot in source control. The command records a schema transition; it does not inspect or reset local data. Other changes may need a custom migration, and some compatible transitions may not need a reviewed row transform.

Restart the example with the same `appId` and browser profile, open `/admin`, and confirm that the Todos created before the change still appear. The new `priority` field should be unset on old rows. Set it on one row, refresh, and verify both old and edited records remain.

## 3. Review incompatible changes explicitly

Renaming or removing a field, changing its stored type, changing relationship targets, or making an existing optional field required can make old rows incompatible. Before applying one of these changes:

1. Decide how every existing value maps to the new schema.
2. Use `jazz-tools migrations create` against the prior committed snapshot and review the generated migration stub.
3. Complete and test any row transformation against representative data.
4. Keep an export or backup appropriate to the host's storage model.
5. Validate the new schema and permissions, publish the schema and required migration through the host's Jazz setup, then verify existing records and access.

Do not treat `bebop validate` as a migration check: it validates the generated schema and permissions, while Jazz's migration catalogue tracks structural schema versions. Never use a database reset as the routine migration path. Bebop generation and validation do not clear application records or recreate the app ID.

## 4. Package acceptance check

From the repository root, run:

```sh
pnpm test:packages
```

This packs the workspace packages, installs them in a clean temporary basic example with pnpm, generates and validates its schema, type-checks it, and builds the consumer app. It removes the temporary checkout after a successful run. On failure, it keeps that checkout and prints its path for inspection.

For Jazz schema semantics, use the official [Jazz migrations documentation](https://jazz.tools/docs/schemas/migrations) for the pinned release alongside Bebop's generated-schema diff. Check the [Jazz server validation docs](https://jazz.tools/docs/install/typescript-server) for exactly what local validation covers. Recheck the docs and installed types whenever the `jazz-tools` pin changes.
