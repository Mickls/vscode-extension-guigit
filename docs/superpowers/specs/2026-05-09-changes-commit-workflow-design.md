# Changes Commit Workflow Design

## Goal

Add an integrated `Changes` workflow to the existing `GUI Git History` view so users can review current repository changes, stage files, discard changes, manage stashes, generate commit messages with AI, and commit staged work without leaving the extension panel.

The feature must preserve the existing architecture: the Webview renders backend ViewModels and sends user intents only. All Git commands, VS Code dialogs, settings, secret handling, AI calls, diff preparation, stash operations, and refresh decisions stay in the extension backend.

## UX Model

The right panel becomes a two-tab surface:

- `Details`: existing selected commit details.
- `Changes`: current working-tree workflow for the selected repository.

`Commit` is not used as the tab label because it is ambiguous in a Git history UI. The `Changes` tab owns current uncommitted work. The commit action remains a button inside that tab.

Selecting commits in the left history list continues to update `Details`. Switching to `Changes` is explicit user intent. Repository changes, watcher refreshes, and Git operations must not reset the active tab, commit message draft, expanded directories, expanded stash entries, or scroll position unless the selected repository changes.

## Changes Panel Structure

The `Changes` tab contains:

- Repository summary row: current branch, repository name, refresh action, operation status.
- Bulk actions: `Stage All`, `Unstage All`.
- `Staged Changes`: files included in the next commit.
- `Changes`: unstaged tracked changes plus untracked files.
- `Stash`: stash entries with expandable file lists.
- Commit composer: message input, AI generate button, commit button.

The file sections support both `tree` and `list` view modes using the same preference as commit details where possible. Each file row shows status, path, insertion/deletion counts when available, and compact icon actions.

## File Actions

`Staged Changes` file actions:

- Open staged diff.
- Open working file.
- Unstage file.

`Changes` file actions:

- Open working-tree diff.
- Open working file.
- Stage file.
- Discard file.

`Stash` actions:

- Expand/collapse stash entry.
- Open stash file diff.
- Apply stash.
- Pop stash.
- Drop stash.

Dangerous operations must be confirmed through VS Code modal dialogs in the backend:

- Discard file.
- Drop stash.
- Pop stash.

All Git write operations must log the exact Git command and result to the GUI Git History output channel.

## Commit Behavior

The `Commit` button commits only `Staged Changes`.

The button is disabled when:

- There are no staged files.
- The commit message is empty.
- A Git operation is already running.
- The repository is in a conflict or unfinished operation state.

The UI must not silently stage files during commit. Users can use `Stage All` explicitly.

The backend runs `git commit -m <message>` or an equivalent safe command. After success it clears the message draft, refreshes `Changes`, and notifies history to refresh without disrupting the current view.

## Backend Services

Add `WorkingTreeService` for status-oriented Git operations:

- Load working tree status.
- Stage file and stage all.
- Unstage file and unstage all.
- Discard file.
- Open staged and unstaged diffs.
- Commit staged changes.
- Load stash list.
- Load stash file changes.
- Apply, pop, and drop stash entries.

Add `CommitMessageAiService` for message generation:

- Build a backend-only prompt from staged diff summary and file list.
- Generate a single editable commit message.
- Return status and errors through RPC.

Existing services remain responsible for their existing domains:

- `DiffService` opens VS Code diffs and virtual documents.
- `SettingsService` reads/writes configuration.
- `ProxyService` is reused for OpenAI-compatible HTTP calls when applicable.
- `LoggerService` records commands and AI/provider diagnostics at the configured level.

## RPC Boundary

Add typed RPC requests for:

- `workingTree.load`
- `workingTree.stageFile`
- `workingTree.stageAll`
- `workingTree.unstageFile`
- `workingTree.unstageAll`
- `workingTree.discardFile`
- `workingTree.openFile`
- `workingTree.openDiff`
- `workingTree.commit`
- `stash.list`
- `stash.getDetails`
- `stash.openDiff`
- `stash.apply`
- `stash.pop`
- `stash.drop`
- `commitMessage.generate`

The Webview sends only these intents and renders returned ViewModels. It does not parse `git status`, build diff commands, decide danger confirmation, store AI keys, or construct prompts.

## ViewModels

`WorkingTreeViewModel` includes:

- repository id and root path display data.
- current branch.
- staged file changes.
- unstaged file changes.
- stash summaries.
- operation state.

`WorkingTreeFileChangeViewModel` extends the existing file change shape with an area:

- `staged`
- `unstaged`
- `untracked`
- `stash`

`StashEntryViewModel` includes:

- stash ref, for example `stash@{0}`.
- message.
- branch/base summary when available.
- date.
- optional expanded file changes loaded on demand.

## AI Provider Settings

Support two provider families:

- VS Code Language Model API.
- OpenAI-compatible API.

Settings add:

- `guigit.ai.provider`: `vscodeLanguageModel | openAICompatible`.
- `guigit.ai.openAICompatible.baseUrl`.
- `guigit.ai.openAICompatible.model`.
- `guigit.ai.openAICompatible.apiKey`.

API keys must not be sent to the Webview. Prefer VS Code secret storage for the API key and expose settings UI through backend prompts. The Webview may display provider status and trigger configuration, but it must not render or store secrets.

The OpenAI-compatible request should use a chat-completions compatible endpoint. The provider implementation should be isolated so additional providers can be added without changing the Webview contract.

## Settings UI

The existing settings menu gains AI configuration entries:

- Configure AI Provider.
- Test AI Provider.

Configuration flows use backend VS Code QuickPick/InputBox dialogs. Changing provider settings updates backend settings and sends the refreshed settings bundle back to the Webview.

## Refresh And Watchers

Working-tree refresh is separate from history refresh:

- Git ref changes refresh history.
- Working-tree changes refresh `Changes`.
- A successful commit refreshes both.
- Stash operations refresh `Changes` and stash state.

Watcher updates must preserve active tab, draft message, expanded folders, expanded stash entries, and scroll position. They may update file rows in place.

## Error Handling

External boundaries catch and report errors:

- RPC router converts backend errors to typed RPC errors.
- Git operation services log command output and return user-facing failure messages.
- AI provider failures return actionable messages, for example missing provider configuration or provider request failure.

Internal helpers should trust their typed inputs and avoid redundant defensive validation.

## Testing

Backend unit tests:

- Parse porcelain status into staged, unstaged, and untracked file ViewModels.
- Parse stash list and stash file changes.
- Ensure stage, unstage, discard, commit, stash apply/pop/drop issue the expected Git commands.
- Ensure dangerous operations require VS Code modal confirmation.
- Ensure `commitMessage.generate` does not run without provider configuration.
- Ensure OpenAI-compatible provider sends the expected request shape.
- Ensure VS Code Language Model provider receives staged diff context.

Webview tests:

- The right panel switches between `Details` and `Changes`.
- `Changes` renders `Staged Changes`, `Changes`, and `Stash`.
- Tree/list mode works for working-tree file groups.
- File buttons send the correct RPC intents.
- Commit button enablement follows staged files, message, and operation state.
- Generate button shows loading and applies the returned message.

Integration-style tests:

- RPC contract includes all new request types and handlers.
- Successful commit triggers working-tree refresh and history refresh notification.

## Implementation Slices

1. Typed RPC and backend `WorkingTreeService` read model.
2. `Changes` tab and read-only working-tree UI.
3. Stage, unstage, open, and diff actions.
4. Discard and stash operations with modal confirmations.
5. Commit composer and commit operation.
6. AI provider settings and generation service.
7. Watcher integration and refresh preservation.
8. i18n coverage and final verification.

Each slice should be test-first and should update `docs/implementation-plan.md` checkboxes or add the new Phase task entries as work completes.
