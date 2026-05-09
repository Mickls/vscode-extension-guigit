import { useState, type ReactElement } from "react";
import type { FileViewMode, WorkingTreeViewModel } from "../../app/rpcContract.generated";
import { FileChanges, FileViewModeControls } from "../FileChanges/FileChanges";

export interface ChangesPanelLabels {
  changes: string;
  commit: string;
  commitMessage: string;
  generate: string;
  list: string;
  listView: string;
  noStashes: string;
  stagedChanges: string;
  stash: string;
  tree: string;
  treeView: string;
}

const defaultLabels: ChangesPanelLabels = {
  changes: "Changes",
  commit: "Commit",
  commitMessage: "Commit message",
  generate: "Generate",
  list: "List",
  listView: "List view",
  noStashes: "No stashes",
  stagedChanges: "Staged Changes",
  stash: "Stash",
  tree: "Tree",
  treeView: "Tree view"
};

export interface ChangesPanelProps {
  fileViewMode: FileViewMode;
  labels?: Partial<ChangesPanelLabels>;
  onFileViewModeChange?: (mode: FileViewMode) => void;
  workingTree?: WorkingTreeViewModel;
}

export function ChangesPanel({ fileViewMode, labels, onFileViewModeChange, workingTree }: ChangesPanelProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  const [commitMessage, setCommitMessage] = useState("");
  const staged = workingTree?.staged ?? [];
  const unstaged = workingTree?.unstaged ?? [];
  const stashes = workingTree?.stashes ?? [];
  const canCommit = staged.length > 0 && commitMessage.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <div className="flex justify-end">
        <FileViewModeControls labels={text} mode={fileViewMode} onModeChange={onFileViewModeChange} />
      </div>
      <FileChanges
        files={staged}
        labels={{
          changed: text.stagedChanges
        }}
        mode={fileViewMode}
        onModeChange={onFileViewModeChange}
        showModeControls={false}
      />
      <FileChanges
        files={unstaged}
        labels={{
          changed: text.changes
        }}
        mode={fileViewMode}
        onModeChange={onFileViewModeChange}
        showModeControls={false}
      />
      <section aria-label={text.stash} className="space-y-2">
        <h3 className="text-xs font-semibold">
          {text.stash} ({stashes.length})
        </h3>
        <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
          {stashes.length > 0 ? (
            stashes.map((stash) => (
              <div className="border-b border-[var(--vscode-panel-border)] px-2 py-1.5 text-xs last:border-b-0" key={stash.ref}>
                <div className="truncate text-[var(--vscode-foreground)]">{stash.message}</div>
                <div className="truncate text-[11px] text-[var(--vscode-descriptionForeground)]">{stash.ref}</div>
              </div>
            ))
          ) : (
            <div className="px-2 py-1.5 text-xs text-[var(--vscode-descriptionForeground)]">{text.noStashes}</div>
          )}
        </div>
      </section>
      <section className="mt-auto space-y-2 border-t border-[var(--vscode-panel-border)] pt-3">
        <label className="flex flex-col gap-1 text-xs">
          <span>{text.commitMessage}</span>
          <textarea
            aria-label={text.commitMessage}
            className="min-h-20 resize-y rounded-[3px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] p-2 text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
            onChange={(event) => setCommitMessage(event.currentTarget.value)}
            value={commitMessage}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-[3px] border border-[var(--vscode-button-border)] px-2 py-1 text-xs text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
            type="button"
          >
            {text.generate}
          </button>
          <button
            className="rounded-[3px] bg-[var(--vscode-button-background)] px-3 py-1 text-xs text-[var(--vscode-button-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCommit}
            type="button"
          >
            {text.commit}
          </button>
        </div>
      </section>
    </div>
  );
}
