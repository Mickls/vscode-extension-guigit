# GUI Git History Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new TypeScript + WindCSS VS Code extension that replaces the existing Marketplace extension while preserving feature behavior, UI identity, command IDs, setting keys, and GitHub repository continuity.

**Architecture:** The extension host owns all Git, VS Code, configuration, cache, state, and operation flows. The Webview is a typed TypeScript UI that renders backend ViewModels and sends user-intent RPC requests. The project is built with pnpm and split into focused modules to prevent the old `GitHistoryViewProvider` and `media/main.js` monolith pattern from returning.

**Tech Stack:** pnpm, TypeScript, VS Code Extension API, simple-git, Vite, React, WindCSS/Tailwind-style utilities, Vitest, ESLint, Prettier, vsce.

---

## File Structure Target

```text
gui-git-history/
  docs/
    README.md
    migration-requirements.md
    implementation-plan.md
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.mjs
  prettier.config.mjs
  assets/
    gui-git-history-high-resolution-logo-transparent.png
  packages/
    extension/
      package.json
      tsconfig.json
      src/
        extension/
          activate.ts
          commands.ts
          contributions.ts
          watchers.ts
        backend/
          rpc/
            contract.ts
            router.ts
            errors.ts
          git/
            GitService.ts
            RepositoryService.ts
            CommitService.ts
            BranchService.ts
            RemoteService.ts
            FileService.ts
            GraphService.ts
            SafetyService.ts
            ProxyService.ts
          vscode/
            DialogService.ts
            DiffService.ts
            FileHistoryPanel.ts
            BlameController.ts
            VirtualDocumentService.ts
          state/
            SettingsService.ts
            WorkspaceStateService.ts
            CacheService.ts
          i18n/
            LanguageService.ts
            locales/
              en.json
              zh.json
              es.json
              fr.json
              de.json
              ja.json
              ru.json
        views/
          GitHistoryViewProvider.ts
      test/
        unit/
        integration/
    webview/
      package.json
      tsconfig.json
      vite.config.ts
      wind.config.ts
      src/
        main.tsx
        app/
          App.tsx
          rpcClient.ts
          viewState.ts
        components/
          Header/
          BranchSwitcher/
          CommitList/
          GitGraph/
          CommitDetails/
          FileChanges/
          ContextMenu/
          SettingsMenu/
          RemoteManager/
          CompareOverlay/
        styles/
          globals.wind.css
        test/
```

## Phase 0: Project Identity And Scaffold

### Task 0.1: Create workspace shell

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `.gitignore`

- [x] Create a pnpm workspace with `packages/extension` and `packages/webview`.
- [x] Root `package.json` uses scripts: `typecheck`, `lint`, `test`, `build`, `package`.
- [x] Root project directory remains `gui-git-history`.
- [x] Do not set Marketplace identity in the root package; Marketplace identity belongs to `packages/extension/package.json`.
- [x] Run `pnpm install`.
- [x] Commit with `chore: scaffold pnpm workspace`.

### Task 0.2: Create extension package identity

**Files:**

- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`
- Create: `packages/extension/src/extension/activate.ts`

- [ ] Set `publisher` to `Mickls`.
- [ ] Set `name` to `vscode-extension-guigit`.
- [ ] Set `displayName` to `GUI Git History`.
- [ ] Preserve command IDs, configuration keys, view container ID, and Webview view ID from `migration-requirements.md`.
- [ ] Use `vscode.git` as an extension dependency.
- [ ] Add a minimal activate function that registers no-op disposable lifecycle cleanly.
- [ ] Run `pnpm typecheck`.
- [ ] Commit with `chore: preserve extension identity`.

### Task 0.3: Create webview package shell

**Files:**

- Create: `packages/webview/package.json`
- Create: `packages/webview/tsconfig.json`
- Create: `packages/webview/vite.config.ts`
- Create: `packages/webview/wind.config.ts`
- Create: `packages/webview/src/main.tsx`
- Create: `packages/webview/src/app/App.tsx`
- Create: `packages/webview/src/styles/globals.wind.css`

- [ ] Build a minimal Webview bundle that renders `GUI Git History`.
- [ ] Use TypeScript files only.
- [ ] Keep CSS limited to WindCSS/Tailwind entry and generated output; do not hand-write ordinary CSS modules.
- [ ] Run `pnpm build`.
- [ ] Commit with `feat: add webview shell`.

## Phase 1: Typed RPC Boundary

### Task 1.1: Define request and response contracts

**Files:**

- Create: `packages/extension/src/backend/rpc/contract.ts`
- Create: `packages/webview/src/app/rpcClient.ts`

- [ ] Define discriminated union request types for history, branches, commits, files, graph, remotes, settings, and Git operations.
- [ ] Define discriminated union response types for ViewModels, operation results, errors, and backend notifications.
- [ ] Share equivalent type definitions through a local package or generated declaration file.
- [ ] Add tests that fail if a request type has no backend handler.
- [ ] Commit with `feat: define typed webview rpc contract`.

### Task 1.2: Implement backend router

**Files:**

- Create: `packages/extension/src/backend/rpc/router.ts`
- Create: `packages/extension/src/backend/rpc/errors.ts`
- Modify: `packages/extension/src/views/GitHistoryViewProvider.ts`

- [ ] `GitHistoryViewProvider` only creates Webview HTML, wires scripts, and delegates messages to the router.
- [ ] Router maps request type to backend service method.
- [ ] Router returns typed success/error responses.
- [ ] Add unit tests for successful dispatch and unknown request errors.
- [ ] Commit with `feat: route webview requests through backend rpc`.

## Phase 2: UI Shell Fidelity

### Task 2.1: Recreate main layout

**Files:**

- Create: `packages/webview/src/components/Header/Header.tsx`
- Create: `packages/webview/src/components/CommitList/CommitList.tsx`
- Create: `packages/webview/src/components/GitGraph/GitGraph.tsx`
- Create: `packages/webview/src/components/CommitDetails/CommitDetails.tsx`
- Create: `packages/webview/src/components/Layout/SplitPanels.tsx`

- [ ] Recreate top toolbar, left panel, graph strip, commit list, resizer, and right details panel.
- [ ] Preserve current density, row height, panel collapse behavior, and VS Code theme variable usage.
- [ ] Implement resizer and collapse as UI-only state.
- [ ] Add component tests for collapsed and expanded panel states.
- [ ] Commit with `feat: recreate git history layout`.

### Task 2.2: Recreate menus and modals

**Files:**

- Create: `packages/webview/src/components/ContextMenu/ContextMenu.tsx`
- Create: `packages/webview/src/components/SettingsMenu/SettingsMenu.tsx`
- Create: `packages/webview/src/components/RemoteManager/RemoteManager.tsx`
- Create: `packages/webview/src/components/CompareOverlay/CompareOverlay.tsx`

- [ ] Context menu contains all old actions in the same order.
- [ ] Settings menu contains reset stash, proxy, remote manager, and language actions.
- [ ] Remote manager keeps the current table-style modal.
- [ ] Compare overlay keeps the current full-panel behavior.
- [ ] Commit with `feat: recreate menus and overlays`.

## Phase 3: Read-Only Git Data

### Task 3.1: Repository and branch services

**Files:**

- Create: `packages/extension/src/backend/git/RepositoryService.ts`
- Create: `packages/extension/src/backend/git/BranchService.ts`
- Create: `packages/extension/src/state/WorkspaceStateService.ts`

- [ ] Discover Git repositories in all workspace folders.
- [ ] Include parent repository discovery for nested workspaces.
- [ ] Sort repositories by workspace proximity.
- [ ] Switch current repository when the active editor belongs to another repository.
- [ ] Return local branches and remote branches grouped by remote.
- [ ] Commit with `feat: add repository and branch services`.

### Task 3.2: Commit history and search

**Files:**

- Create: `packages/extension/src/backend/git/CommitService.ts`
- Create: `packages/extension/src/state/CacheService.ts`

- [ ] Load paged commit history with refs and parents.
- [ ] Support all branches, selected branch, remote branch, tags, and author filters.
- [ ] Support message search and hash-prefix search.
- [ ] Return `canEditMessage` from backend.
- [ ] Cache commit details and total counts.
- [ ] Commit with `feat: add commit history service`.

### Task 3.3: Commit details and file changes

**Files:**

- Create: `packages/extension/src/backend/git/FileService.ts`
- Create: `packages/webview/src/components/FileChanges/FileChanges.tsx`

- [ ] Return commit metadata and file change list.
- [ ] Support list and tree file view models.
- [ ] Preserve file status, insertions, deletions, and binary indicators.
- [ ] Store file view mode under `guigit.fileViewMode`.
- [ ] Commit with `feat: add commit details and file changes`.

### Task 3.4: Git graph layout

**Files:**

- Create: `packages/extension/src/backend/git/GraphService.ts`
- Modify: `packages/webview/src/components/GitGraph/GitGraph.tsx`

- [ ] Compute graph layout in backend.
- [ ] Frontend only draws nodes and edges from backend ViewModel.
- [ ] Preserve current graph toggle, hover, click, and scroll sync behavior.
- [ ] Commit with `feat: add backend git graph layout`.

## Phase 4: VS Code Integrations

### Task 4.1: Commands and watchers

**Files:**

- Create: `packages/extension/src/extension/commands.ts`
- Create: `packages/extension/src/extension/watchers.ts`
- Modify: `packages/extension/src/extension/activate.ts`

- [ ] Register all `guigit.*` commands.
- [ ] Register Git state listeners.
- [ ] Watch `.git/HEAD` and `.git/refs/heads/**`.
- [ ] Debounce refresh.
- [ ] Preserve `showCommitDetails` jump behavior.
- [ ] Commit with `feat: wire vscode commands and git watchers`.

### Task 4.2: Diff and virtual documents

**Files:**

- Create: `packages/extension/src/backend/vscode/DiffService.ts`
- Create: `packages/extension/src/backend/vscode/VirtualDocumentService.ts`

- [ ] Support initial commit diff.
- [ ] Support normal commit diff.
- [ ] Support compare file diff.
- [ ] Support added, deleted, unchanged, and modified file scenarios.
- [ ] Dispose virtual document providers after a bounded lifetime.
- [ ] Commit with `feat: add vscode diff integration`.

### Task 4.3: File history panel

**Files:**

- Create: `packages/extension/src/backend/vscode/FileHistoryPanel.ts`

- [ ] Open file history from explorer, editor, and commit details.
- [ ] Resolve file path relative to current repository.
- [ ] Clicking a commit jumps the main view to that commit.
- [ ] Keep panel HTML small and generated from backend data only.
- [ ] Commit with `feat: add file history panel`.

## Phase 5: Git Write Operations

### Task 5.1: Safety and auto stash

**Files:**

- Create: `packages/extension/src/backend/git/SafetyService.ts`
- Create: `packages/extension/src/state/SettingsService.ts`

- [ ] Implement uncommitted change detection.
- [ ] Implement `ask | always | never` auto-stash preference.
- [ ] Implement stash push with untracked files.
- [ ] Implement safe stash pop after pull/rebase.
- [ ] Implement reset preference action.
- [ ] Commit with `feat: add safe git operation handling`.

### Task 5.2: Pull, push, fetch, clone, checkout

**Files:**

- Create: `packages/extension/src/backend/git/GitService.ts`
- Modify: `packages/extension/src/backend/rpc/router.ts`

- [ ] Basic pull, push, fetch, clone, checkout work through backend RPC.
- [ ] Advanced pull uses backend QuickPick flow for merge/rebase and target remote branch.
- [ ] Advanced push uses backend QuickPick flow for target remote branch and force confirmation.
- [ ] Push to non-main branch prompts PR creation.
- [ ] Commit with `feat: add primary git operations`.

### Task 5.3: Context menu operations

**Files:**

- Modify: `packages/extension/src/backend/git/GitService.ts`
- Modify: `packages/webview/src/components/ContextMenu/ContextMenu.tsx`

- [ ] Implement copy hash, cherry-pick, revert, reset soft/mixed/hard.
- [ ] Implement compare selected commits.
- [ ] Implement squash commits.
- [ ] Implement create branch from commit.
- [ ] Implement push all commits to here.
- [ ] Implement edit commit message.
- [ ] Commit with `feat: add commit context operations`.

## Phase 6: Remote, Proxy, Blame, i18n

### Task 6.1: Remote manager

**Files:**

- Create: `packages/extension/src/backend/git/RemoteService.ts`
- Modify: `packages/webview/src/components/RemoteManager/RemoteManager.tsx`

- [ ] Load remote details.
- [ ] Add remote.
- [ ] Update remote.
- [ ] Remove remote with VS Code modal confirmation.
- [ ] Return status messages to Webview.
- [ ] Commit with `feat: add remote manager`.

### Task 6.2: Proxy service

**Files:**

- Create: `packages/extension/src/backend/git/ProxyService.ts`

- [ ] Support custom proxy settings.
- [ ] Support VS Code proxy settings.
- [ ] Support environment proxy variables.
- [ ] Support system proxy detection on macOS, Windows, and Linux.
- [ ] Support common local proxy app port detection.
- [ ] Apply proxy to simple-git config.
- [ ] Commit with `feat: add git proxy service`.

### Task 6.3: Blame controller

**Files:**

- Create: `packages/extension/src/backend/vscode/BlameController.ts`

- [ ] Implement blame provider and editor decoration.
- [ ] Support `guigit.blame.enabled`.
- [ ] Support `guigit.blame.showOnlyCurrentLine`.
- [ ] Support `guigit.blame.format`.
- [ ] Hover includes commit details.
- [ ] Command jump to commit remains compatible.
- [ ] Commit with `feat: add git blame integration`.

### Task 6.4: i18n

**Files:**

- Create: `packages/extension/src/backend/i18n/LanguageService.ts`
- Create: `packages/extension/src/backend/i18n/locales/*.json`

- [ ] Migrate existing locale files.
- [ ] Use one translation service for Extension Host and Webview bootstrap data.
- [ ] Implement language selector and Webview refresh.
- [ ] Restore current view state after language change.
- [ ] Commit with `feat: add internationalization`.

## Phase 7: Packaging And Replacement

### Task 7.1: Package VSIX

**Files:**

- Modify: `packages/extension/package.json`
- Modify: root `package.json`

- [ ] Add `pnpm package` command.
- [ ] Ensure bundled Webview assets are copied into extension package output.
- [ ] Ensure extension icon is included.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm package`.
- [ ] Confirm VSIX extension id is `Mickls.vscode-extension-guigit`.
- [ ] Commit with `chore: package replacement extension`.

### Task 7.2: Old repository replacement

**Files:**

- Target old repo: `/Users/jiangcheng/code/owner/vscode-extension-guigit`

- [ ] Create branch `codex/rewrite-gui-git-history` in the old repo.
- [ ] Preserve `.git`.
- [ ] Replace old source tree with new project source.
- [ ] Keep `package.json.name` as `vscode-extension-guigit`.
- [ ] Remove `package-lock.json`.
- [ ] Add `pnpm-lock.yaml`.
- [ ] Run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm package`.
- [ ] Commit with `feat: rewrite gui git history extension`.

## Verification Checklist

- [ ] Existing commands still appear in Command Palette.
- [ ] Bottom panel view still appears as `Git History / Commit History`.
- [ ] Existing user settings are read without migration prompts.
- [ ] Main UI visually matches old project screenshots.
- [ ] Multi-repository switching works.
- [ ] Commit history infinite scroll works.
- [ ] Branch switching and recent branches work.
- [ ] Search and author filter work.
- [ ] Commit details and file changes work.
- [ ] Diff opens in VS Code editor.
- [ ] File history panel can jump back to main view.
- [ ] Pull, push, fetch, clone, checkout work.
- [ ] Advanced pull and push work.
- [ ] Context menu operations work.
- [ ] Remote manager works.
- [ ] Proxy settings work.
- [ ] Blame works.
- [ ] Language switching works.
- [ ] VSIX installs over the old extension identity.
