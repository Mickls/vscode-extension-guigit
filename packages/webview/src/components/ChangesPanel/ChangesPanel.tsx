import { useState, type ReactElement } from "react";
import { Check, FileText, RotateCcw } from "lucide-react";
import type {
  FileViewMode,
  WorkingTreeDiffKind,
  WorkingTreeFileChangeViewModel,
  WorkingTreeViewModel
} from "../../app/rpcContract.generated";
import { FileViewModeControls } from "../FileChanges/FileChanges";

export interface ChangesPanelLabels {
  changes: string;
  commit: string;
  commitMessage: string;
  generate: string;
  list: string;
  listView: string;
  noStashes: string;
  openDiff: string;
  openFile: string;
  stage: string;
  stagedChanges: string;
  stash: string;
  tree: string;
  treeView: string;
  unstage: string;
}

const defaultLabels: ChangesPanelLabels = {
  changes: "Changes",
  commit: "Commit",
  commitMessage: "Commit message",
  generate: "Generate",
  list: "List",
  listView: "List view",
  noStashes: "No stashes",
  openDiff: "Open diff for {0}",
  openFile: "Open file {0}",
  stage: "Stage {0}",
  stagedChanges: "Staged Changes",
  stash: "Stash",
  tree: "Tree",
  treeView: "Tree view",
  unstage: "Unstage {0}"
};

export interface ChangesPanelProps {
  fileViewMode: FileViewMode;
  labels?: Partial<ChangesPanelLabels>;
  onFileViewModeChange?: (mode: FileViewMode) => void;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, kind: WorkingTreeDiffKind, previousPath?: string) => void;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
  workingTree?: WorkingTreeViewModel;
}

export function ChangesPanel({
  fileViewMode,
  labels,
  onFileViewModeChange,
  onOpenFile,
  onOpenFileDiff,
  onStageFile,
  onUnstageFile,
  workingTree
}: ChangesPanelProps): ReactElement {
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
      <WorkingTreeFileSection
        action="unstage"
        files={staged}
        labels={{
          openDiff: text.openDiff,
          openFile: text.openFile,
          primaryAction: text.unstage,
          title: text.stagedChanges
        }}
        onOpenFile={onOpenFile}
        onOpenFileDiff={(path, previousPath) => onOpenFileDiff?.(path, "staged", previousPath)}
        onPrimaryAction={onUnstageFile}
      />
      <WorkingTreeFileSection
        action="stage"
        files={unstaged}
        labels={{
          openDiff: text.openDiff,
          openFile: text.openFile,
          primaryAction: text.stage,
          title: text.changes
        }}
        onOpenFile={onOpenFile}
        onOpenFileDiff={(path, previousPath) => onOpenFileDiff?.(path, "unstaged", previousPath)}
        onPrimaryAction={onStageFile}
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

function WorkingTreeFileSection({
  action,
  files,
  labels,
  onOpenFile,
  onOpenFileDiff,
  onPrimaryAction
}: {
  action: "stage" | "unstage";
  files: readonly WorkingTreeFileChangeViewModel[];
  labels: {
    openDiff: string;
    openFile: string;
    primaryAction: string;
    title: string;
  };
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, previousPath?: string) => void;
  onPrimaryAction?: (path: string) => void;
}): ReactElement {
  return (
    <section aria-label={labels.title} className="space-y-2">
      <h3 className="text-xs font-semibold">
        {labels.title} ({files.length})
      </h3>
      <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
        {files.map((file) => (
          <div
            className="grid w-full grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
            key={file.path}
          >
            <span className="rounded-[2px] bg-[var(--vscode-badge-background)] px-1 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
              {file.binary ? "binary" : file.status}
            </span>
            <button
              aria-label={formatLabel(labels.openDiff, file.path)}
              className="min-w-0 truncate bg-transparent text-left hover:underline"
              onClick={() => onOpenFileDiff?.(file.path, file.previousPath)}
              type="button"
            >
              {file.path}
            </button>
            <span className="shrink-0 text-[11px]">
              <span className="text-[#28a745]">+{file.insertions}</span>{" "}
              <span className="text-[#dc3545]">-{file.deletions}</span>
            </span>
            <WorkingTreeActionButton
              icon={action}
              label={formatLabel(labels.primaryAction, file.path)}
              onClick={() => onPrimaryAction?.(file.path)}
            />
            <WorkingTreeActionButton icon="openFile" label={formatLabel(labels.openFile, file.path)} onClick={() => onOpenFile?.(file.path)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkingTreeActionButton({
  icon,
  label,
  onClick
}: {
  icon: "openFile" | "stage" | "unstage";
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-label={label}
      className="flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-transparent text-[10px] text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon === "stage" ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {icon === "unstage" ? <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {icon === "openFile" ? <FileText aria-hidden="true" className="h-3.5 w-3.5" /> : null}
    </button>
  );
}

function formatLabel(label: string, value: string): string {
  return label.replace("{0}", value);
}
