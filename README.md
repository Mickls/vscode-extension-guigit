# GUI Git History

TypeScript rewrite of the Marketplace extension `Mickls.vscode-extension-guigit`.

This repository directory is named `gui-git-history`, but the published VS Code extension identity must remain compatible with the existing extension:

- publisher: `Mickls`
- package name: `vscode-extension-guigit`
- extension id: `Mickls.vscode-extension-guigit`
- commands/config/view ids: `guigit.*`, `guigit.historyView`

Read these documents before changing behavior:

- [docs/README.md](docs/README.md)
- [docs/migration-requirements.md](docs/migration-requirements.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)

## Requirements

- Node.js 24.x
- pnpm 11.x
- VS Code extension toolchain installed through workspace dependencies

Use pnpm only. Do not add `package-lock.json` or npm scripts that require npm.

## Install

```sh
pnpm install
```

In non-interactive or sandboxed shells, make sure the shell can find the same pnpm and Node.js versions you use locally. On this machine that usually means:

```sh
PATH=/Users/jiangcheng/.nvm/versions/node/v24.3.0/bin:/opt/homebrew/bin:$PATH pnpm install
```

## Project Structure

```text
packages/
  shared/
    src/rpc/contract.ts
      Single source of truth for typed RPC request, response, notification, and ViewModel shapes.
  extension/
    package.json
      Marketplace identity, VS Code contributions, commands, configuration, views, menus, and packaging.
    src/extension/
      VS Code activation and lifecycle wiring.
    src/backend/
      Git, VS Code, state, i18n, RPC, proxy, diff, blame, and operation logic.
    src/backend/rpc/contract.ts
      Generated runtime contract copied from `packages/shared`; do not edit by hand.
    src/views/
      Webview provider shell only. It creates HTML, wires scripts, and delegates messages.
  webview/
    src/app/
      React UI shell, UI-only state, and typed RPC client.
    src/app/rpcContract.generated.d.ts
      Generated declaration copied from `packages/shared`; do not edit by hand.
```

Backend owns Git, VS Code, configuration, persistence, graph layout, filtering, search, diff, blame, proxy, and operation workflows. Webview owns rendering and sends typed user-intent messages only.

## Common Commands

```sh
pnpm install
pnpm rpc:generate
pnpm rpc:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm package
```

`pnpm package` creates the VSIX from `packages/extension` and must keep the extension id as `Mickls.vscode-extension-guigit`.

## RPC Contract Maintenance

The RPC contract has one source file:

```text
packages/shared/src/rpc/contract.ts
```

When changing request types, response payloads, backend notifications, or shared ViewModels:

1. Edit `packages/shared/src/rpc/contract.ts`.
2. Run `pnpm rpc:generate`.
3. Commit the updated generated files:

```text
packages/extension/src/backend/rpc/contract.ts
packages/webview/src/app/rpcContract.generated.d.ts
```

4. Run `pnpm rpc:check` before committing. It fails if the generated declaration is stale.

Do not import extension backend source files from the webview package. The webview may import only generated contract declarations and UI code. Do not hand-edit generated RPC files; edit `packages/shared/src/rpc/contract.ts` and regenerate.

## Testing And Verification

Run these before claiming a phase or task is complete:

```sh
pnpm install
pnpm rpc:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm package
```

Current test policy:

- Unit tests live under `packages/*/test`.
- Contract coverage tests must prove every request type has a backend handler marker.
- Router and backend behavior tests should be written before implementation.
- Webview tests should verify UI state and rendering, not Git behavior.

## Packaging Notes

The extension package root is `packages/extension`, not the repository root. Files referenced by `packages/extension/package.json` must exist under `packages/extension`.

Important packaging files:

- `packages/extension/package.json`
- `packages/extension/.vscodeignore`
- `packages/extension/assets/gui-git-history-high-resolution-logo-transparent.png`

VSIX output is written to:

```text
packages/extension/vscode-extension-guigit-<version>.vsix
```

Generated build outputs, VSIX files, and TypeScript build info are ignored by Git.

## Development Rules

- Use TypeScript only for extension and webview business code.
- Use WindCSS/Tailwind-style utilities for webview styling.
- Keep ordinary CSS limited to framework entry/generated output.
- Keep frontend and backend boundaries strict.
- Preserve all `guigit.*` command/config ids and `guigit.historyView`.
- Update [docs/implementation-plan.md](docs/implementation-plan.md) checkboxes as tasks are completed.
- Use single-line conventional commits with one of: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
