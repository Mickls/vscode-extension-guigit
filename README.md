# GUI Git History

[中文说明](./README.zh-CN.md)

The published VS Code extension is **GUI Git History**. It is available from the VS Code Marketplace and can be installed in VS Code by searching for that name.

GUI Git History gives VS Code a visual Git workspace for browsing commit graphs, reviewing changes, comparing commits, managing working tree changes, running common Git operations, and using inline blame from the editor.

## Why This Project Exists

This project started from a very practical itch: JetBrains IDEs have a comfortable visual Git workflow, especially for browsing history, reading commit details, comparing revisions, and acting on commits. After switching to VS Code, the built-in Git experience felt too minimal for that style of work, and richer Git history extensions often placed comparable functionality behind paid tiers.

GUI Git History is the attempt to bring that familiar visual workflow into VS Code: dense, fast to scan, keyboard-and-mouse friendly, and useful without leaving the editor.

## User-Facing Features

- Browse Git history across one or more repositories in the current workspace.
- Switch between all branches, selected branches, local branches, and remote branches.
- Search by commit message or hash, filter by author, and quickly filter to the current Git user.
- View an interactive commit graph with colored lanes, refs, tags, authors, dates, and synchronized selection.
- Inspect commit metadata, commit body, changed files, insertion/deletion counts, and file-level actions.
- Open file diffs, working files, historical snapshots, and file history views.
- Compare exactly two selected commits and open per-file diffs from the comparison view.
- Manage working tree changes: view staged and unstaged files, stage, unstage, discard, inspect stashes, and commit.
- Generate commit messages with a VS Code language model or an OpenAI-compatible provider.
- Run common Git operations from the UI: pull, advanced pull, push, advanced push, fetch, clone, checkout, cherry-pick, revert, reset, squash, create branch from commit, push commits to a selected point, edit the HEAD commit message, and copy hashes.
- Continue or abort interrupted Git operations when manual conflict resolution is required.
- List, add, update, and delete Git remotes.
- Configure Git proxy settings or refresh automatic proxy detection.
- Show inline Git blame annotations with hover actions for opening the commit in history and copying the hash.
- Use localized UI bundles for English, Chinese, Spanish, French, German, Japanese, and Russian.
- Inspect diagnostics in the **GUI Git History** output channel with configurable log level.

The Marketplace/VSIX README files live in `packages/extension`:

- [packages/extension/README.md](packages/extension/README.md)
- [packages/extension/README.zh-CN.md](packages/extension/README.zh-CN.md)

## Repository Map

```text
packages/
  shared/
    src/rpc/contract.ts
      Source of truth for typed RPC requests, responses, notifications, and ViewModels.
  extension/
    package.json
      VS Code extension manifest, commands, settings, views, menus, and packaging scripts.
    src/extension/
      Activation, command registration, Git watcher wiring, and VS Code integration.
    src/backend/
      Git services, repository discovery, branch/history/detail loading, graph layout,
      operations, working tree, stash, AI commit messages, proxy, remotes, i18n, RPC,
      diff, file history, and blame.
    src/backend/rpc/contract.ts
      Generated runtime contract copied from `packages/shared`; do not edit by hand.
    src/views/
      Webview provider shell. It owns HTML creation, script/style wiring, and message routing.
  webview/
    src/app/
      React app shell, UI state, i18n lookup, and typed RPC client.
    src/components/
      Header, commit list, graph, commit details, file changes, working tree panel,
      compare overlay, settings menu, remote manager, notifications, and layout components.
    src/app/rpcContract.generated.d.ts
      Generated declaration copied from `packages/shared`; do not edit by hand.
```

Backend code owns Git, VS Code APIs, configuration, persistence, graph layout, filtering/search, diff, blame, proxy detection, AI commit messages, and operation workflows. The webview renders ViewModels and sends typed user-intent RPC messages only.

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
- Backend behavior tests should cover Git, router, state, VS Code services, and operation boundaries.
- Webview tests should verify UI state and rendering, not Git behavior.

## Packaging Notes

The extension package root is `packages/extension`, not the repository root. Files referenced by `packages/extension/package.json` must exist under `packages/extension`.

Important packaging files:

- `packages/extension/package.json`
- `packages/extension/.vscodeignore`
- `packages/extension/assets/gui-git-history-high-resolution-logo-transparent.png`
- `packages/extension/assets/screenshots`
- `packages/extension/webview-dist`
- `packages/extension/README.md`
- `packages/extension/README.zh-CN.md`

Generated build outputs, VSIX files, and TypeScript build info are ignored by Git.

## Related Docs

- [docs/README.md](docs/README.md)
- [docs/migration-requirements.md](docs/migration-requirements.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)

Read these before changing behavior or extension identity.

## Development Rules

- Use TypeScript for extension and webview business code.
- Use WindCSS/Tailwind-style utilities for webview styling.
- Keep ordinary CSS limited to framework entry/generated output.
- Keep frontend and backend boundaries strict.
- Preserve all `guigit.*` command/config ids and `guigit.historyView`.
- Update [docs/implementation-plan.md](docs/implementation-plan.md) checkboxes when implementation phases are completed.
- Use single-line conventional commits with one of: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
