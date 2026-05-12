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

- [x] Set `publisher` to `Mickls`.
- [x] Set `name` to `vscode-extension-guigit`.
- [x] Set `displayName` to `GUI Git History`.
- [x] Preserve command IDs, configuration keys, view container ID, and Webview view ID from `migration-requirements.md`.
- [x] Use `vscode.git` as an extension dependency.
- [x] Add a minimal activate function that registers no-op disposable lifecycle cleanly.
- [x] Run `pnpm typecheck`.
- [x] Commit with `chore: preserve extension identity`.

### Task 0.3: Create webview package shell

**Files:**

- Create: `packages/webview/package.json`
- Create: `packages/webview/tsconfig.json`
- Create: `packages/webview/vite.config.ts`
- Create: `packages/webview/wind.config.ts`
- Create: `packages/webview/src/main.tsx`
- Create: `packages/webview/src/app/App.tsx`
- Create: `packages/webview/src/styles/globals.wind.css`

- [x] Build a minimal Webview bundle that renders `GUI Git History`.
- [x] Use TypeScript files only.
- [x] Keep CSS limited to WindCSS/Tailwind entry and generated output; do not hand-write ordinary CSS modules.
- [x] Run `pnpm build`.
- [x] Commit with `feat: add webview shell`.

## Phase 1: Typed RPC Boundary

### Task 1.1: Define request and response contracts

**Files:**

- Create: `packages/extension/src/backend/rpc/contract.ts`
- Create: `packages/webview/src/app/rpcClient.ts`

- [x] Define discriminated union request types for history, branches, commits, files, graph, remotes, settings, and Git operations.
- [x] Define discriminated union response types for ViewModels, operation results, errors, and backend notifications.
- [x] Share equivalent type definitions through a local package or generated declaration file.
- [x] Add tests that fail if a request type has no backend handler.
- [x] Commit with `feat: define typed webview rpc contract`.

### Task 1.2: Implement backend router

**Files:**

- Create: `packages/extension/src/backend/rpc/router.ts`
- Create: `packages/extension/src/backend/rpc/errors.ts`
- Modify: `packages/extension/src/views/GitHistoryViewProvider.ts`

- [x] `GitHistoryViewProvider` only creates Webview HTML, wires scripts, and delegates messages to the router.
- [x] Router maps request type to backend service method.
- [x] Router returns typed success/error responses.
- [x] Add unit tests for successful dispatch and unknown request errors.
- [x] Commit with `feat: route webview requests through backend rpc`.

## Phase 2: UI Shell Fidelity

### Task 2.1: Recreate main layout

**Files:**

- Create: `packages/webview/src/components/Header/Header.tsx`
- Create: `packages/webview/src/components/CommitList/CommitList.tsx`
- Create: `packages/webview/src/components/GitGraph/GitGraph.tsx`
- Create: `packages/webview/src/components/CommitDetails/CommitDetails.tsx`
- Create: `packages/webview/src/components/Layout/SplitPanels.tsx`

- [x] Recreate top toolbar, left panel, graph strip, commit list, resizer, and right details panel.
- [x] Preserve current density, row height, panel collapse behavior, and VS Code theme variable usage.
- [x] Implement resizer and collapse as UI-only state.
- [x] Add component tests for collapsed and expanded panel states.
- [x] Commit with `feat: recreate git history layout`.

### Task 2.2: Recreate menus and modals

**Files:**

- Create: `packages/webview/src/components/ContextMenu/ContextMenu.tsx`
- Create: `packages/webview/src/components/SettingsMenu/SettingsMenu.tsx`
- Create: `packages/webview/src/components/RemoteManager/RemoteManager.tsx`
- Create: `packages/webview/src/components/CompareOverlay/CompareOverlay.tsx`

- [x] Context menu contains all old actions in the same order.
- [x] Settings menu contains reset stash, proxy, remote manager, and language actions.
- [x] Remote manager keeps the current table-style modal.
- [x] Compare overlay keeps the current full-panel behavior.
- [x] Commit with `feat: recreate menus and overlays`.

## Phase 3: Read-Only Git Data

### Task 3.1: Repository and branch services

**Files:**

- Create: `packages/extension/src/backend/git/RepositoryService.ts`
- Create: `packages/extension/src/backend/git/BranchService.ts`
- Create: `packages/extension/src/state/WorkspaceStateService.ts`

- [x] Discover Git repositories in all workspace folders.
- [x] Include parent repository discovery for nested workspaces.
- [x] Sort repositories by workspace proximity.
- [x] Switch current repository when the active editor belongs to another repository.
- [x] Return local branches and remote branches grouped by remote.
- [x] Commit with `feat: add repository and branch services`.

### Task 3.2: Commit history and search

**Files:**

- Create: `packages/extension/src/backend/git/CommitService.ts`
- Create: `packages/extension/src/state/CacheService.ts`

- [x] Load paged commit history with refs and parents.
- [x] Support all branches, selected branch, remote branch, tags, and author filters.
- [x] Support message search and hash-prefix search.
- [x] Return `canEditMessage` from backend.
- [x] Cache commit details and total counts.
- [x] Commit with `feat: add commit history service`.

### Task 3.3: Commit details and file changes

**Files:**

- Create: `packages/extension/src/backend/git/FileService.ts`
- Create: `packages/webview/src/components/FileChanges/FileChanges.tsx`

- [x] Return commit metadata and file change list.
- [x] Support list and tree file view models.
- [x] Preserve file status, insertions, deletions, and binary indicators.
- [x] Store file view mode under `guigit.fileViewMode`.
- [x] Commit with `feat: add commit details and file changes`.

### Task 3.4: Git graph layout

**Files:**

- Create: `packages/extension/src/backend/git/GraphService.ts`
- Modify: `packages/webview/src/components/GitGraph/GitGraph.tsx`

- [x] Compute graph layout in backend.
- [x] Frontend only draws nodes and edges from backend ViewModel.
- [x] Preserve current graph toggle, hover, click, and scroll sync behavior.
- [x] Commit with `feat: add backend git graph layout`.

## Phase 4: VS Code Integrations

### Task 4.1: Commands and watchers

**Files:**

- Create: `packages/extension/src/extension/commands.ts`
- Create: `packages/extension/src/extension/watchers.ts`
- Modify: `packages/extension/src/extension/activate.ts`

- [x] Register all `guigit.*` commands.
- [x] Register repository open listener and narrow Git state refresh to HEAD commit changes.
- [x] Watch `.git/HEAD`, local refs, tag refs, remote refs, and packed refs.
- [x] Debounce refresh.
- [x] Preserve `showCommitDetails` jump behavior.
- [x] Commit with `feat: wire vscode commands and git watchers`.

### Task 4.2: Diff and virtual documents

**Files:**

- Create: `packages/extension/src/backend/vscode/DiffService.ts`
- Create: `packages/extension/src/backend/vscode/VirtualDocumentService.ts`

- [x] Support initial commit diff.
- [x] Support normal commit diff.
- [x] Support compare file diff.
- [x] Support added, deleted, unchanged, and modified file scenarios.
- [x] Dispose virtual document providers after a bounded lifetime.
- [x] Commit with `feat: add vscode diff integration`.

### Task 4.3: File history panel

**Files:**

- Create: `packages/extension/src/backend/vscode/FileHistoryPanel.ts`

- [x] Open file history from explorer, editor, and commit details.
- [x] Resolve file path relative to current repository.
- [x] Clicking a commit jumps the main view to that commit.
- [x] Keep panel HTML small and generated from backend data only.
- [x] Commit with `feat: add file history panel`.

## Phase 5: Git Write Operations

### Task 5.1: Safety and auto stash

**Files:**

- Create: `packages/extension/src/backend/git/SafetyService.ts`
- Create: `packages/extension/src/state/SettingsService.ts`

- [x] Implement uncommitted change detection.
- [x] Implement `ask | always | never` auto-stash preference.
- [x] Implement stash push with untracked files.
- [x] Implement safe stash pop after pull/rebase.
- [x] Handle pull/rebase conflicts before restoring auto-stashed changes.
- [x] Implement reset preference action.
- [x] Commit with `feat: add safe git operation handling`.

### Task 5.2: Pull, push, fetch, clone, checkout

**Files:**

- Create: `packages/extension/src/backend/git/GitService.ts`
- Modify: `packages/extension/src/backend/rpc/router.ts`

- [x] Basic pull, push, fetch, clone, checkout work through backend RPC.
- [x] Advanced pull uses backend QuickPick flow for merge/rebase and target remote branch.
- [x] Advanced push uses backend QuickPick flow for target remote branch and force confirmation.
- [x] Push to non-main branch prompts PR creation.
- [x] Commit with `feat: add primary git operations`.

### Task 5.3: Context menu operations

**Files:**

- Modify: `packages/extension/src/backend/git/GitService.ts`
- Modify: `packages/webview/src/components/ContextMenu/ContextMenu.tsx`

- [x] Implement copy hash, cherry-pick, revert, reset soft/mixed/hard.
- [x] Implement compare selected commits.
- [x] Implement squash commits.
- [x] Implement create branch from commit.
- [x] Implement push all commits to here.
- [x] Implement edit commit message.
- [x] Commit with `feat: add commit context operations`.

## Phase 6: Remote, Proxy, Blame, i18n

### Task 6.1: Remote manager

**Files:**

- Create: `packages/extension/src/backend/git/RemoteService.ts`
- Modify: `packages/webview/src/components/RemoteManager/RemoteManager.tsx`

- [x] Load remote details.
- [x] Add remote.
- [x] Update remote.
- [x] Remove remote with VS Code modal confirmation.
- [x] Return status messages to Webview.
- [x] Commit with `feat: add remote manager`.

### Task 6.2: Proxy service

**Files:**

- Create: `packages/extension/src/backend/git/ProxyService.ts`

- [x] Support custom proxy settings.
- [x] Support VS Code proxy settings.
- [x] Support environment proxy variables.
- [x] Support system proxy detection on macOS, Windows, and Linux.
- [x] Support common local proxy app port detection.
- [x] Apply proxy to simple-git config.
- [x] Commit with `feat: add git proxy service`.

### Task 6.3: Blame controller

**Files:**

- Create: `packages/extension/src/backend/vscode/BlameController.ts`

- [x] Implement blame provider and editor decoration.
- [x] Support `guigit.blame.enabled`.
- [x] Support `guigit.blame.showOnlyCurrentLine`.
- [x] Support `guigit.blame.format`.
- [x] Hover includes commit details.
- [x] Command jump to commit remains compatible.
- [x] Commit with `feat: add git blame integration`.

### Task 6.4: i18n

**Files:**

- Create: `packages/extension/src/backend/i18n/LanguageService.ts`
- Create: `packages/extension/src/backend/i18n/locales/*.json`

- [x] Migrate existing locale files.
- [x] Use one translation service for Extension Host and Webview bootstrap data.
- [x] Implement language selector and Webview refresh.
- [x] Restore current view state after language change.
- [x] Commit with `feat: add internationalization`.

## Phase 6.5: Changes Commit Workflow

### Task 6.5.1: Working-tree status and Changes tab

**Files:**

- Modify: `packages/shared/src/rpc/contract.ts`
- Create: `packages/extension/src/backend/git/WorkingTreeService.ts`
- Create: `packages/webview/src/components/ChangesPanel/ChangesPanel.tsx`
- Create: `packages/webview/src/components/PanelTabs/PanelTabs.tsx`

- [x] Add typed RPC requests and handlers for working-tree status, file actions, stash actions, commit message generation, and AI provider settings.
- [x] Add `Changes` beside `Details` in the right panel.
- [x] Render current branch, operation status, staged files, unstaged/untracked files, stash entries, and commit composer.
- [x] Preserve the selected tab, draft message, expanded file groups, expanded stash entries, and scroll position across refreshes.
- [x] Keep Webview behavior to rendering and user-intent RPC messages.

### Task 6.5.2: Stage, unstage, diff, discard, and stash actions

**Files:**

- Modify: `packages/extension/src/backend/git/WorkingTreeService.ts`
- Modify: `packages/extension/src/backend/vscode/DiffService.ts`
- Modify: `packages/webview/src/components/ChangesPanel/ChangesPanel.tsx`

- [x] Support stage file, stage all, unstage file, and unstage all from `Changes`.
- [x] Support opening staged and working-tree diffs from file rows.
- [x] Support opening the working file from file rows.
- [x] Confirm destructive discard, stash pop, and stash drop actions through VS Code dialogs.
- [x] Support stash list, stash details, stash diff, apply, pop, and drop.

### Task 6.5.3: Staged-only commit and AI message generation

**Files:**

- Create: `packages/extension/src/backend/git/CommitMessageAiService.ts`
- Create: `packages/extension/src/backend/vscode/LanguageModelCommitMessageProvider.ts`
- Create: `packages/extension/src/backend/vscode/OpenAICompatibleCommitMessageProvider.ts`
- Modify: `packages/extension/src/state/SettingsService.ts`
- Modify: `packages/webview/src/components/SettingsMenu/SettingsMenu.tsx`

- [x] Commit action commits only staged files and does not silently stage unstaged work.
- [x] Disable commit when staged files are empty, message is empty, an operation is running, or the repository is in an unfinished Git state.
- [x] Refresh working-tree and history state after a successful commit without disrupting the active view.
- [x] Support VS Code Language Model and OpenAI-compatible providers for commit message generation.
- [x] Add settings menu entries to configure and test the AI provider.
- [x] Store OpenAI-compatible API keys outside the Webview.

### Task 6.5.4: Verification slices

- [x] Typed RPC and backend working-tree read model.
- [x] `Changes` tab and read-only working-tree UI.
- [x] Stage, unstage, open, and diff actions.
- [x] Discard and stash operations with modal confirmations.
- [x] Commit composer and staged-only commit operation.
- [x] AI provider settings and generation service.
- [x] Watcher integration and refresh preservation.
- [x] i18n coverage and local verification for the Changes workflow.

This phase tracks the integrated `Changes` workflow only. Packaging, old-repository replacement, and final branch/rebase integration remain tracked by Phase 7 and are not marked complete here.

## Phase 7: Packaging And Replacement

### Task 7.1: Package VSIX

**Files:**

- Modify: `packages/extension/package.json`
- Modify: root `package.json`

- [x] Add `pnpm package` command.
- [x] Ensure bundled Webview assets are copied into extension package output.
- [x] Ensure extension icon is included.
- [x] Run `pnpm build`.
- [x] Run `pnpm package`.
- [x] Confirm VSIX extension id is `Mickls.vscode-extension-guigit`.
- [x] Commit with `chore: package replacement extension`.

### Task 7.2: Old repository replacement

**Files:**

- Target old repo: `/Users/jiangcheng/code/owner/vscode-extension-guigit`

- [x] Create branch `codex/rewrite-gui-git-history` in the old repo.
- [x] Preserve `.git`.
- [x] Replace old source tree with new project source.
- [x] Keep `package.json.name` as `vscode-extension-guigit`.
- [x] Remove `package-lock.json`.
- [x] Add `pnpm-lock.yaml`.
- [x] Run `pnpm install`, `pnpm typecheck`, `pnpm eslint`, `pnpm test`, `pnpm package`.
- [x] Commit with `feat: rewrite gui git history extension`.

## Verification Checklist

- [ ] Existing commands still appear in Command Palette.
- [ ] Bottom panel view still appears as `Git History / Commit History`.
- [ ] Existing user settings are read without migration prompts.
- [ ] Main UI visually matches old project screenshots.
- [x] Multi-repository switching works.
- [ ] Commit history infinite scroll works.
- [ ] Branch switching and recent branches work.
- [x] Search and author filter work.
- [ ] Commit details and file changes work.
- [ ] Diff opens in VS Code editor.
- [ ] File history panel can jump back to main view.
- [ ] Pull, push, fetch, clone, checkout work.
- [ ] Advanced pull and push work.
- [ ] Context menu operations work.
- [ ] Remote manager works.
- [ ] Proxy settings work.
- [ ] Blame works.
- [x] Language switching works.
- [ ] VSIX installs over the old extension identity.
