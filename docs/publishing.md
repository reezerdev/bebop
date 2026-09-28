# Publishing the Bebop packages

The public packages are `@bebopdev/core`, `@bebopdev/admin`, and `@bebopdev/cli`. Their first release is `0.1.0-beta.0`, published on npm's `beta` tag. This lets early users install `@bebopdev/core@beta` while the stable `latest` tag remains reserved for a later release.

## Before publishing

Run the package checks from the repository root:

```sh
pnpm --filter @bebopdev/core test
pnpm --filter @bebopdev/cli test
pnpm --filter @bebopdev/admin check
pnpm --filter @bebopdev/admin build
pnpm --filter @bebopdev/example-basic check
pnpm test:packages
```

`pnpm test:packages` builds and packs all three packages, installs those tarballs into an isolated copy of `examples/basic`, runs the installed CLI to generate and validate the schema, type-checks the example, and builds it with Vite. It uses the local core tarball to satisfy the CLI's internal dependency before the packages have been published.

## First beta release

The `@bebopdev` npm organization must grant publish rights to the logged-in npm account. Then publish the core package first because the CLI depends on it:

```sh
pnpm --filter @bebopdev/core publish --access public --tag beta --dry-run
pnpm --filter @bebopdev/admin publish --access public --tag beta --dry-run
pnpm --filter @bebopdev/cli publish --access public --tag beta --dry-run
```

Review the dry-run contents and version for each package, then repeat the commands without `--dry-run`. `--access public` is required for the initial publication of scoped npm packages. The package manifests also set public access for later releases.

Users can install the beta with:

```sh
pnpm add @bebopdev/core@beta jazz-tools@2.0.0-alpha.57
pnpm add @bebopdev/admin@beta react react-dom react-router-dom
pnpm add -D @bebopdev/cli@beta
```

## Subsequent releases

Record the change and bump intent for every package whose public API changes, then review the pending release plan:

```sh
pnpm change --bump patch --summary "Describe the fix" @bebopdev/core
pnpm change status
pnpm version -r
pnpm install
pnpm test:packages
```

Use `minor` or `major` when appropriate. `pnpm version -r` applies the pending intents; review the resulting package versions and lockfile before publishing. Publish changed packages in dependency order, using `--tag beta` while releasing prereleases or omitting the tag for stable releases.

See [pnpm publish](https://pnpm.io/cli/publish), [pnpm change](https://pnpm.io/cli/change), and [pnpm version](https://pnpm.io/cli/version) for command details.
