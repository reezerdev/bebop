# Publishing the Bebop packages

The public packages are `@bebopdev/core`, `@bebopdev/admin`, `@bebopdev/cli`, and `@bebopdev/create-bebop-app`. Core, Admin, and CLI `0.1.1` are published on npm's `beta` tag; their `latest` tags remain on the initial `0.1.0-beta.0` release until a stable release is ready. The starter's `0.1.1` beta is available as `npm create @bebopdev/bebop-app@beta my-app`; its `latest` tag remains on the first `0.1.0` release.

For the planned stable release, use the [v1.0.0 release checklist](./v1.0.0-release-checklist.md). Version changes are gated on all listed checks, including the admin performance benchmark; publishing remains a separate step.

## Before publishing

Run the package checks from the repository root:

```sh
pnpm --filter @bebopdev/core test
pnpm --filter @bebopdev/cli test
pnpm --filter @bebopdev/admin check
pnpm --filter @bebopdev/admin test
pnpm --filter @bebopdev/admin build
pnpm --filter @bebopdev/create-bebop-app test
pnpm --filter @bebopdev/example-basic check
pnpm test:packages
```

`pnpm test:packages` builds and packs Core, Admin, and CLI, installs those tarballs into an isolated copy of `examples/basic`, runs the installed CLI to generate and validate the schema, type-checks the example, and builds it with Vite. It uses the local core tarball to satisfy the CLI's internal dependency before the packages have been published.

## First beta release

The `@bebopdev` npm organization must grant publish rights to the logged-in npm account. Then publish the core package first because the CLI depends on it:

```sh
pnpm --filter @bebopdev/core publish --access public --tag beta --dry-run
pnpm --filter @bebopdev/admin publish --access public --tag beta --dry-run
pnpm --filter @bebopdev/cli publish --access public --tag beta --dry-run
pnpm --filter @bebopdev/create-bebop-app publish --access public --tag beta --dry-run
```

Review the dry-run contents and version for each package, then repeat the commands without `--dry-run`. `--access public` is required for the initial publication of scoped npm packages. The package manifests also set public access for later releases.

Users can install the beta with:

```sh
pnpm add @bebopdev/core@beta jazz-tools@2.0.0-alpha.58
pnpm add @bebopdev/admin@beta react react-dom react-router-dom
pnpm add -D @bebopdev/cli@beta
```

## Subsequent releases

Record the change and bump intent for every package whose public API or starter template changes, then review the pending release plan:

```sh
pnpm change --bump patch --summary "Describe the fix" @bebopdev/core
pnpm change status
pnpm version -r --workspace-packages 'apps/*' --workspace-packages 'packages/*'
pnpm install
pnpm test:packages
```

Use `minor` or `major` when appropriate. The workspace override intentionally excludes `examples/basic`, which keeps published semver ranges so it remains installable as a standalone project. `pnpm version -r` applies the pending intents; review the resulting package versions and lockfile before publishing. Publish Core first, then Admin and CLI, and the starter last so its generated project uses the new versions. Use `--tag beta` while releasing prereleases or omitting the tag for stable releases.

See [pnpm publish](https://pnpm.io/cli/publish), [pnpm change](https://pnpm.io/cli/change), and [pnpm version](https://pnpm.io/cli/version) for command details.
