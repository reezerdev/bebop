# Agent guidance

- Use pnpm for installs, scripts, and workspace commands.
- Do not run `npm run build` unless the user explicitly asks for it.

## Jazz

- For Jazz-specific work, start with the [Jazz documentation index for LLMs](https://jazz.tools/llms.txt) and follow its links to the relevant topic page. Keep the documentation content canonical online instead of copying the index into this repository.
- The playground currently pins `jazz-tools` to `2.0.0-alpha.57` in `apps/playground/package.json`. Check the installed package types and implementation when online docs describe newer behavior, and recheck the docs when upgrading the pin.
