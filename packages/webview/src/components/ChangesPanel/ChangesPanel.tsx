import { useState, type ReactElement } from "react";
import { ArchiveRestore, Check, ChevronDown, ChevronRight, FileText, RotateCcw, Trash2, X } from "lucide-react";
import type {
  FileViewMode,
  StashEntryViewModel,
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
  applyStash: string;
  discard: string;
  dropStash: string;
  expandStash: string;
  popStash: string;
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
  applyStash: "Apply stash {0}",
  discard: "Discard {0}",
  dropStash: "Drop stash {0}",
  expandStash: "Expand stash {0}",
  popStash: "Pop stash {0}",
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
  onApplyStash?: (stashRef: string) => void;
  onDiscardFile?: (path: string) => void;
  onDropStash?: (stashRef: string) => void;
  onExpandStash?: (stashRef: string) => void;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, kind: WorkingTreeDiffKind, previousPath?: string) => void;
  onOpenStashDiff?: (stashRef: string, path: string, previousPath?: string) => void;
  onPopStash?: (stashRef: string) => void;
  onStageFile?: (path: string) => void;
  onUnstageFile?: (path: string) => void;
  workingTree?: WorkingTreeViewModel;
}

export function ChangesPanel({
  fileViewMode,
  labels,
  onApplyStash,
  onDiscardFile,
  onDropStash,
  onExpandStash,
  onFileViewModeChange,
  onOpenFile,
  onOpenFileDiff,
  onOpenStashDiff,
  onPopStash,
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
          secondaryAction: text.discard,
          title: text.changes
        }}
        onSecondaryAction={onDiscardFile}
        onOpenFile={onOpenFile}
        onOpenFileDiff={(path, previousPath) => onOpenFileDiff?.(path, "unstaged", previousPath)}
        onPrimaryAction={onStageFile}
      />
      <StashSection
        labels={{
          applyStash: text.applyStash,
          dropStash: text.dropStash,
          expandStash: text.expandStash,
          noStashes: text.noStashes,
          openDiff: text.openDiff,
          popStash: text.popStash,
          title: text.stash
        }}
        onApplyStash={onApplyStash}
        onDropStash={onDropStash}
        onExpandStash={onExpandStash}
        onOpenStashDiff={onOpenStashDiff}
        onPopStash={onPopStash}
        stashes={stashes}
      />
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
  onPrimaryAction,
  onSecondaryAction
}: {
  action: "stage" | "unstage";
  files: readonly WorkingTreeFileChangeViewModel[];
  labels: {
    openDiff: string;
    openFile: string;
    primaryAction: string;
    secondaryAction?: string;
    title: string;
  };
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, previousPath?: string) => void;
  onPrimaryAction?: (path: string) => void;
  onSecondaryAction?: (path: string) => void;
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
            {labels.secondaryAction ? (
              <WorkingTreeActionButton
                icon="discard"
                label={formatLabel(labels.secondaryAction, file.path)}
                onClick={() => onSecondaryAction?.(file.path)}
              />
            ) : null}
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
  icon: "discard" | "openFile" | "stage" | "unstage";
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
      {icon === "discard" ? <X aria-hidden="true" className="h-3.5 w-3.5" /> : null}
    </button>
  );
}

function StashSection({
  labels,
  onApplyStash,
  onDropStash,
  onExpandStash,
  onOpenStashDiff,
  onPopStash,
  stashes
}: {
  labels: {
    applyStash: string;
    dropStash: string;
    expandStash: string;
    noStashes: string;
    openDiff: string;
    popStash: string;
    title: string;
  };
  onApplyStash?: (stashRef: string) => void;
  onDropStash?: (stashRef: string) => void;
  onExpandStash?: (stashRef: string) => void;
  onOpenStashDiff?: (stashRef: string, path: string, previousPath?: string) => void;
  onPopStash?: (stashRef: string) => void;
  stashes: readonly StashEntryViewModel[];
}): ReactElement {
  const [expandedRefs, setExpandedRefs] = useState<readonly string[]>([]);

  const toggleStash = (stashRef: string) => {
    setExpandedRefs((current) => current.includes(stashRef) ? current.filter((ref) => ref !== stashRef) : [...current, stashRef]);
    onExpandStash?.(stashRef);
  };

  return (
    <section aria-label={labels.title} className="space-y-2">
      <h3 className="text-xs font-semibold">
        {labels.title} ({stashes.length})
      </h3>
      <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
        {stashes.length > 0 ? (
          stashes.map((stash) => {
            const expanded = expandedRefs.includes(stash.ref);
            return (
              <div className="border-b border-[var(--vscode-panel-border)] px-2 py-1.5 text-xs last:border-b-0" key={stash.ref}>
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2">
                  <button
                    aria-label={formatLabel(labels.expandStash, stash.ref)}
                    className="flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-transparent text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                    onClick={() => toggleStash(stash.ref)}
                    type="button"
                  >
                    {expanded ? <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-[var(--vscode-foreground)]">{stash.message}</div>
                    <div className="truncate text-[11px] text-[var(--vscode-descriptionForeground)]">{stash.ref}</div>
                  </div>
                  <StashActionButton icon="apply" label={formatLabel(labels.applyStash, stash.ref)} onClick={() => onApplyStash?.(stash.ref)} />
                  <StashActionButton icon="pop" label={formatLabel(labels.popStash, stash.ref)} onClick={() => onPopStash?.(stash.ref)} />
                  <StashActionButton icon="drop" label={formatLabel(labels.dropStash, stash.ref)} onClick={() => onDropStash?.(stash.ref)} />
                </div>
                {expanded && stash.files ? (
                  <div className="mt-1 border-t border-[var(--vscode-panel-border)] pt-1">
                    {stash.files.map((file) => (
                      <button
                        aria-label={formatLabel(labels.openDiff, file.path)}
                        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[3px] px-1 py-1 text-left hover:bg-[var(--vscode-list-hoverBackground)]"
                        key={file.path}
                        onClick={() => onOpenStashDiff?.(stash.ref, file.path, file.previousPath)}
                        type="button"
                      >
                        <span className="rounded-[2px] bg-[var(--vscode-badge-background)] px-1 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
                          {file.binary ? "binary" : file.status}
                        </span>
                        <span className="min-w-0 truncate">{file.path}</span>
                        <span className="text-[11px]">
                          <span className="text-[#28a745]">+{file.insertions}</span>{" "}
                          <span className="text-[#dc3545]">-{file.deletions}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="px-2 py-1.5 text-xs text-[var(--vscode-descriptionForeground)]">{labels.noStashes}</div>
        )}
      </div>
    </section>
  );
}

function StashActionButton({
  icon,
  label,
  onClick
}: {
  icon: "apply" | "drop" | "pop";
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
      {icon === "apply" ? <ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {icon === "pop" ? <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {icon === "drop" ? <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> : null}
    </button>
  );
}

function formatLabel(label: string, value: string): string {
  return label.replace("{0}", value);
}
