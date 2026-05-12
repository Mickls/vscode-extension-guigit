# GUI Git History

TypeScript rewrite and maintenance workspace for the VS Code extension published as **GUI Git History**.

This repository is named `gui-git-history`, but the packaged extension must stay compatible with the existing Marketplace identity:

- publisher: `Mickls`
- package name: `vscode-extension-guigit`
- extension id: `Mickls.vscode-extension-guigit`
- command, configuration, and view ids: `guigit.*`, `guigit.historyView`

The extension itself is a visual Git history tool for VS Code. It provides an interactive commit graph, multi-repository history browsing, commit details, file diffs, commit comparison, common Git operations, remote and proxy management, inline blame annotations, and localized webview UI.

## Extension Capabilities

- Browse discovered Git repositories in the current workspace and switch between them from the header.
- Filter history by branch, multiple selected branches, commit message/hash search, and author.
- Load commit history incrementally and keep graph, list, and details selection in sync.
- View an interactive Git graph with colored lanes, edges, hover states, and selectable commits.
- Inspect commit metadata, refs/tags, author details, commit body, changed files, and insertion/deletion counts.
- Switch file changes between tree and list view, open file diffs, open working files or commit snapshots, and open per-file history panels.
- Compare exactly two selected commits in a full-screen compare view and open file-level diffs from the comparison.
- Run Git operations from the UI: pull, advanced pull, push, advanced push, fetch, clone, checkout, cherry-pick, revert, reset, squash, create branch from commit, push commits to a selected point, edit the HEAD commit message, and copy commit hashes.
- Handle pull/squash safety with configurable auto-stash preference and conflict continue/abort actions.
- Manage remotes: list, add, update, and delete remote URLs with VS Code confirmation for destructive changes.
- Configure or refresh Git proxy settings. Proxy discovery checks custom settings, VS Code proxy, environment variables, system proxy, and common local proxy ports.
- Show inline Git blame annotations with hover actions for opening a commit in the history view and copying its hash.
- Support localized UI bundles for English, Chinese, Spanish, French, German, Japanese, and Russian, with an automatic VS Code language mode.
- Log diagnostics to the **GUI Git History** output channel with configurable verbosity.

## Repository Map

```text
packages/
  shared/
    src/rpc/contract.ts
      Source of truth for typed RPC requests, responses, notifications, and ViewModels.
  extension/
    package.json
      VS Code extension manifest, Marketplace identity, commands, settings, views, menus, and packaging scripts.
    src/extension/
      Activation, command registration, and Git watcher wiring.
    src/backend/
      Git services, repository discovery, branch/history/detail loading, graph layout, operations,
      safety handling, proxy, remotes, i18n, RPC handlers, diff, file history, and blame.
    src/backend/rpc/contract.ts
      Generated runtime contract copied from `packages/shared`; do not edit by hand.
    src/views/
      Webview provider shell. It owns HTML creation, script/style wiring, and message delegation.
  webview/
    src/app/
      React app shell, UI-only state, i18n lookup, and typed RPC client.
    src/components/
      Commit list, graph, details, file changes, compare overlay, settings menu,
      remote manager, notifications, and layout components.
    src/app/rpcContract.generated.d.ts
      Generated declaration copied from `packages/shared`; do not edit by hand.
```

Backend code owns Git, VS Code APIs, configuration, persistence, graph layout, filtering/search, diff, blame, proxy detection, and operation workflows. The webview renders ViewModels and sends typed user-intent RPC messages only.

## Requirements

- Node.js 24.x
- pnpm 11.x
- VS Code extension toolchain installed through workspace dependencies

Use pnpm only. Do not add `package-lock.json` or npm-only workflows.

## Install

```sh
pnpm install
```

In non-interactive or sandboxed shells, make sure the shell can find the expected pnpm and Node.js versions. On this machine that usually means:

```sh
PATH=/Users/jiangcheng/.nvm/versions/node/v24.3.0/bin:/opt/homebrew/bin:$PATH pnpm install
```

## Development

Start the normal extension development loop:

```sh
pnpm dev
```

This runs the shared RPC generator, extension TypeScript watcher, and webview Vite build watcher in parallel:

- `pnpm dev:shared`: watches `packages/shared/src/rpc` and regenerates RPC files.
- `pnpm dev:extension`: writes extension host output to `packages/extension/out`.
- `pnpm dev:webview`: writes webview assets to `packages/extension/webview-dist`.

Focused commands are available when changing one package:

```sh
pnpm dev:shared
pnpm dev:extension
pnpm dev:webview
```

For browser-only webview work, run the Vite development server:

```sh
pnpm --filter @gui-git-history/webview serve
```

The VS Code extension still consumes built assets from `packages/extension/webview-dist`.

## Debugging In VS Code

The repository includes `.vscode/launch.json` and `.vscode/tasks.json`.

- Use **Run Extension** to build first and open an Extension Development Host.
- Use **Run Extension (watch output)** when `pnpm dev` is already running.

Diagnostics are written to the **GUI Git History** output channel. Increase verbosity while debugging integration issues:

```json
"guigit.logLevel": "debug"
```

## RPC Contract Maintenance

The RPC contract has one source file:

```text
packages/shared/src/rpc/contract.ts
```

When changing request types, response payloads, backend notifications, or shared ViewModels:

1. Edit `packages/shared/src/rpc/contract.ts`.
2. Run `pnpm rpc:generate`.
3. Commit the generated files:

```text
packages/extension/src/backend/rpc/contract.ts
packages/webview/src/app/rpcContract.generated.d.ts
```

4. Run `pnpm rpc:check`.

Do not import extension backend code from the webview package. Do not hand-edit generated RPC files.

## Commands

```sh
pnpm install
pnpm dev
pnpm dev:extension
pnpm dev:webview
pnpm dev:shared
pnpm rpc:generate
pnpm rpc:check
pnpm typecheck
pnpm eslint
pnpm test
pnpm build
pnpm package
```

`pnpm package` builds all packages and creates a VSIX from `packages/extension`. The VSIX path is:

```text
packages/extension/vscode-extension-guigit-<version>.vsix
```

The packaged extension id must remain `Mickls.vscode-extension-guigit`.

## Verification

Run these before claiming implementation work is complete:

```sh
pnpm install
pnpm rpc:check
pnpm typecheck
pnpm eslint
pnpm test
pnpm build
pnpm package
```

Current test policy:

- Unit tests live under `packages/*/test` or alongside package source as `*.test.ts(x)`.
- RPC contract tests must prove every request type has a backend handler marker.
- Backend behavior tests should cover Git, router, state, and VS Code service boundaries.
- Webview tests should verify UI state and rendering, not Git behavior.

## Packaging Notes

The extension package root is `packages/extension`, not the repository root. Files referenced by `packages/extension/package.json` must exist under `packages/extension`.

Important packaging files:

- `packages/extension/package.json`
- `packages/extension/.vscodeignore`
- `packages/extension/assets/gui-git-history-high-resolution-logo-transparent.png`
- `packages/extension/webview-dist`
- `packages/extension/README.md`
- `packages/extension/README.zh-CN.md`

Generated build outputs, VSIX files, and TypeScript build info are ignored by Git.

## Related Docs

- [docs/README.md](docs/README.md)
- [docs/migration-requirements.md](docs/migration-requirements.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)

Read these before changing behavior or release identity.

## Development Rules

- Use TypeScript for extension and webview business code.
- Use WindCSS/Tailwind-style utilities for webview styling.
- Keep ordinary CSS limited to framework entry/generated output.
- Keep frontend and backend boundaries strict.
- Preserve all `guigit.*` command/config ids and `guigit.historyView`.
- Update [docs/implementation-plan.md](docs/implementation-plan.md) checkboxes when implementation phases are completed.
- Use single-line conventional commits with one of: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
