import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ArchiveRestore, Check, ChevronDown, ChevronRight, FileText, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import type {
  FileViewMode,
  RepositoryViewModel,
  StashEntryViewModel,
  WorkingTreeDiffKind,
  WorkingTreeFileChangeViewModel,
  WorkingTreeViewModel
} from "../../app/rpcContract.generated";
import { FileViewModeControls } from "../FileChanges/FileChanges";

export interface ChangesPanelLabels {
  binary: string;
  branch: string;
  changes: string;
  collapseDirectory: string;
  commit: string;
  commitMessage: string;
  expandDirectory: string;
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
  refreshChanges: string;
  repository: string;
  stage: string;
  stageAll: string;
  stagedChanges: string;
  stash: string;
  tree: string;
  treeView: string;
  unstage: string;
  unstageAll: string;
}

const defaultLabels: ChangesPanelLabels = {
  binary: "binary",
  branch: "Branch",
  changes: "Changes",
  collapseDirectory: "Collapse {0}",
  commit: "Commit",
  commitMessage: "Commit message",
  expandDirectory: "Expand {0}",
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
  refreshChanges: "Refresh Changes",
  repository: "Repository",
  stage: "Stage {0}",
  stageAll: "Stage All",
  stagedChanges: "Staged Changes",
  stash: "Stash",
  tree: "Tree",
  treeView: "Tree view",
  unstage: "Unstage {0}",
  unstageAll: "Unstage All"
};

export interface ChangesPanelProps {
  commitMessageResetKey?: number;
  commitMessageSuggestion?: { message: string; requestId: string };
  fileViewMode: FileViewMode;
  generatingCommitMessage?: boolean;
  labels?: Partial<ChangesPanelLabels>;
  operationBusy?: boolean;
  operationStatus?: ChangesPanelOperationStatus;
  repository?: RepositoryViewModel;
  onCommit?: (message: string) => void;
  onFileViewModeChange?: (mode: FileViewMode) => void;
  onGenerateCommitMessage?: () => string | undefined;
  onApplyStash?: (stashRef: string) => void;
  onDiscardFile?: (path: string) => void;
  onDropStash?: (stashRef: string) => void;
  onExpandStash?: (stashRef: string) => void;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, kind: WorkingTreeDiffKind, previousPath?: string) => void;
  onOpenStashDiff?: (stashRef: string, path: string, previousPath?: string) => void;
  onPopStash?: (stashRef: string) => void;
  onRefresh?: () => void;
  onStageAll?: () => void;
  onStageFile?: (path: string) => void;
  onUnstageAll?: () => void;
  onUnstageFile?: (path: string) => void;
  workingTree?: WorkingTreeViewModel;
}

export interface ChangesPanelOperationStatus {
  message: string;
  state: "error" | "running" | "success" | "warning";
}

interface TreeNode {
  children: Map<string, TreeNode>;
  file?: WorkingTreeFileChangeViewModel;
}

export function ChangesPanel({
  commitMessageResetKey = 0,
  commitMessageSuggestion,
  fileViewMode,
  generatingCommitMessage = false,
  labels,
  operationBusy = false,
  operationStatus,
  repository,
  onCommit,
  onApplyStash,
  onDiscardFile,
  onDropStash,
  onExpandStash,
  onFileViewModeChange,
  onGenerateCommitMessage,
  onOpenFile,
  onOpenFileDiff,
  onOpenStashDiff,
  onPopStash,
  onRefresh,
  onStageAll,
  onStageFile,
  onUnstageAll,
  onUnstageFile,
  workingTree
}: ChangesPanelProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  const [commitMessage, setCommitMessage] = useState("");
  const editSequenceRef = useRef(0);
  const latestGenerateRequestIdRef = useRef<string | undefined>(undefined);
  const generateRequestEditSequencesRef = useRef(new Map<string, number>());
  const staged = workingTree?.staged ?? [];
  const unstaged = workingTree?.unstaged ?? [];
  const stashes = workingTree?.stashes ?? [];
  const workingTreeBlocksCommit = workingTree?.operationState?.status === "conflict";
  const canCommit = !operationBusy && !workingTreeBlocksCommit && staged.length > 0 && commitMessage.trim().length > 0;
  const status = operationStatus ?? workingTreeOperationStatus(workingTree);

  useEffect(() => {
    setCommitMessage("");
    editSequenceRef.current += 1;
    latestGenerateRequestIdRef.current = undefined;
    generateRequestEditSequencesRef.current.clear();
  }, [commitMessageResetKey]);

  useEffect(() => {
    if (!commitMessageSuggestion) {
      return;
    }

    const requestEditSequence = generateRequestEditSequencesRef.current.get(commitMessageSuggestion.requestId);
    generateRequestEditSequencesRef.current.delete(commitMessageSuggestion.requestId);
    if (
      latestGenerateRequestIdRef.current === commitMessageSuggestion.requestId &&
      requestEditSequence === editSequenceRef.current
    ) {
      setCommitMessage(commitMessageSuggestion.message);
    }
  }, [commitMessageSuggestion]);

  const changeCommitMessage = (message: string) => {
    editSequenceRef.current += 1;
    setCommitMessage(message);
  };

  const generateCommitMessage = () => {
    const requestId = onGenerateCommitMessage?.();
    if (requestId) {
      latestGenerateRequestIdRef.current = requestId;
      generateRequestEditSequencesRef.current.set(requestId, editSequenceRef.current);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <div className="flex items-start justify-between gap-3 rounded-[3px] border border-[var(--vscode-panel-border)] px-2 py-1.5 text-xs">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[var(--vscode-descriptionForeground)]">{text.repository}</span>
            <span className="truncate font-semibold">{repository?.name ?? workingTree?.repositoryRoot}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[var(--vscode-descriptionForeground)]">
            <span className="truncate">{repository?.rootPath ?? workingTree?.repositoryRoot}</span>
            <span aria-hidden="true">·</span>
            <span>{text.branch}</span>
            <span className="truncate text-[var(--vscode-foreground)]">{workingTree?.branch}</span>
          </div>
          {status ? (
            <div className={statusClassName(status.state)} role="status">
              {status.message}
            </div>
          ) : null}
        </div>
        <button
          aria-label={text.refreshChanges}
          className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[3px] border border-transparent text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onRefresh}
          title={text.refreshChanges}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex justify-end">
        <FileViewModeControls labels={text} mode={fileViewMode} onModeChange={onFileViewModeChange} />
      </div>
      <WorkingTreeFileSection
        action="unstage"
        files={staged}
        mode={fileViewMode}
        labels={{
          binary: text.binary,
          bulkAction: text.unstageAll,
          collapseDirectory: text.collapseDirectory,
          expandDirectory: text.expandDirectory,
          openDiff: text.openDiff,
          openFile: text.openFile,
          primaryAction: text.unstage,
          title: text.stagedChanges
        }}
        onOpenFile={onOpenFile}
        onOpenFileDiff={(path, previousPath) => onOpenFileDiff?.(path, "staged", previousPath)}
        onBulkAction={onUnstageAll}
        onPrimaryAction={onUnstageFile}
      />
      <WorkingTreeFileSection
        action="stage"
        files={unstaged}
        mode={fileViewMode}
        labels={{
          binary: text.binary,
          bulkAction: text.stageAll,
          collapseDirectory: text.collapseDirectory,
          expandDirectory: text.expandDirectory,
          openDiff: text.openDiff,
          openFile: text.openFile,
          primaryAction: text.stage,
          secondaryAction: text.discard,
          title: text.changes
        }}
        onSecondaryAction={onDiscardFile}
        onOpenFile={onOpenFile}
        onOpenFileDiff={(path, previousPath) => onOpenFileDiff?.(path, "unstaged", previousPath)}
        onBulkAction={onStageAll}
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
            onChange={(event) => changeCommitMessage(event.currentTarget.value)}
            value={commitMessage}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-[3px] border border-[var(--vscode-button-border)] px-2 py-1 text-xs text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={generatingCommitMessage}
            onClick={generateCommitMessage}
            type="button"
          >
            {text.generate}
          </button>
          <button
            className="rounded-[3px] bg-[var(--vscode-button-background)] px-3 py-1 text-xs text-[var(--vscode-button-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCommit}
            onClick={() => onCommit?.(commitMessage)}
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
  mode,
  onBulkAction,
  onOpenFile,
  onOpenFileDiff,
  onPrimaryAction,
  onSecondaryAction
}: {
  action: "stage" | "unstage";
  files: readonly WorkingTreeFileChangeViewModel[];
  labels: {
    binary: string;
    bulkAction: string;
    collapseDirectory: string;
    expandDirectory: string;
    openDiff: string;
    openFile: string;
    primaryAction: string;
    secondaryAction?: string;
    title: string;
  };
  mode: FileViewMode;
  onBulkAction?: () => void;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, previousPath?: string) => void;
  onPrimaryAction?: (path: string) => void;
  onSecondaryAction?: (path: string) => void;
}): ReactElement {
  return (
    <section aria-label={labels.title} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">
          {labels.title} ({files.length})
        </h3>
        <button
          className="rounded-[3px] border border-[var(--vscode-button-border)] px-2 py-0.5 text-[11px] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={files.length === 0}
          onClick={onBulkAction}
          type="button"
        >
          {labels.bulkAction}
        </button>
      </div>
      <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
        {mode === "tree" ? (
          <WorkingTreeFileTree
            action={action}
            files={files}
            labels={labels}
            onOpenFile={onOpenFile}
            onOpenFileDiff={onOpenFileDiff}
            onPrimaryAction={onPrimaryAction}
            onSecondaryAction={onSecondaryAction}
          />
        ) : (
          files.map((file) => (
            <WorkingTreeFileRow
              action={action}
              file={file}
              key={file.path}
              labels={labels}
              label={file.path}
              onOpenFile={onOpenFile}
              onOpenFileDiff={onOpenFileDiff}
              onPrimaryAction={onPrimaryAction}
              onSecondaryAction={onSecondaryAction}
            />
          ))
        )}
      </div>
    </section>
  );
}

function WorkingTreeFileTree({
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
  labels: Pick<ChangesPanelLabels, "binary" | "collapseDirectory" | "expandDirectory" | "openDiff" | "openFile"> & {
    primaryAction: string;
    secondaryAction?: string;
  };
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, previousPath?: string) => void;
  onPrimaryAction?: (path: string) => void;
  onSecondaryAction?: (path: string) => void;
}): ReactElement {
  const root = useMemo(() => buildTree(files), [files]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(new Set());
  const toggleDirectory = (path: string) => {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  return (
    <>
      {renderWorkingTree({
        action,
        collapsedDirectories,
        depth: 0,
        labels,
        node: root,
        onOpenFile,
        onOpenFileDiff,
        onPrimaryAction,
        onSecondaryAction,
        parentPath: "",
        toggleDirectory
      })}
    </>
  );
}

function renderWorkingTree(input: {
  action: "stage" | "unstage";
  collapsedDirectories: ReadonlySet<string>;
  depth: number;
  labels: Pick<ChangesPanelLabels, "binary" | "collapseDirectory" | "expandDirectory" | "openDiff" | "openFile"> & {
    primaryAction: string;
    secondaryAction?: string;
  };
  node: TreeNode;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, previousPath?: string) => void;
  onPrimaryAction?: (path: string) => void;
  onSecondaryAction?: (path: string) => void;
  parentPath: string;
  toggleDirectory(path: string): void;
}): readonly ReactElement[] {
  return [...input.node.children.entries()].flatMap(([name, child]) => {
    if (child.file) {
      return [
        <WorkingTreeFileRow
          action={input.action}
          depth={input.depth}
          file={child.file}
          key={child.file.path}
          labels={input.labels}
          label={name}
          onOpenFile={input.onOpenFile}
          onOpenFileDiff={input.onOpenFileDiff}
          onPrimaryAction={input.onPrimaryAction}
          onSecondaryAction={input.onSecondaryAction}
        />
      ];
    }

    const directoryPath = input.parentPath ? `${input.parentPath}/${name}` : name;
    const collapsed = input.collapsedDirectories.has(directoryPath);
    return [
      <button
        aria-expanded={!collapsed}
        aria-label={formatLabel(collapsed ? input.labels.expandDirectory : input.labels.collapseDirectory, directoryPath)}
        className="flex w-full items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-[11px] text-[var(--vscode-descriptionForeground)] last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
        key={`directory-${input.depth}-${directoryPath}`}
        onClick={() => input.toggleDirectory(directoryPath)}
        style={{ paddingLeft: `${8 + input.depth * 14}px` }}
        type="button"
      >
        <span className="w-3 text-center">{collapsed ? "+" : "-"}</span>
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[10px]">{countFiles(child)}</span>
      </button>,
      ...(collapsed
        ? []
        : renderWorkingTree({
            ...input,
            depth: input.depth + 1,
            node: child,
            parentPath: directoryPath
          }))
    ];
  });
}

function WorkingTreeFileRow({
  action,
  depth = 0,
  file,
  labels,
  label,
  onOpenFile,
  onOpenFileDiff,
  onPrimaryAction,
  onSecondaryAction
}: {
  action: "stage" | "unstage";
  depth?: number;
  file: WorkingTreeFileChangeViewModel;
  labels: Pick<ChangesPanelLabels, "binary" | "openDiff" | "openFile"> & {
    primaryAction: string;
    secondaryAction?: string;
  };
  label: string;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string, previousPath?: string) => void;
  onPrimaryAction?: (path: string) => void;
  onSecondaryAction?: (path: string) => void;
}): ReactElement {
  return (
    <div
      className="grid w-full grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <span className="rounded-[2px] bg-[var(--vscode-badge-background)] px-1 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
        {file.binary ? labels.binary : file.status}
      </span>
      <button
        aria-label={formatLabel(labels.openDiff, file.path)}
        className="min-w-0 truncate bg-transparent text-left hover:underline"
        onClick={() => onOpenFileDiff?.(file.path, file.previousPath)}
        type="button"
      >
        {label}
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

function buildTree(files: readonly WorkingTreeFileChangeViewModel[]): TreeNode {
  const root: TreeNode = { children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    parts.forEach((part, index) => {
      let child = current.children.get(part);
      if (!child) {
        child = { children: new Map() };
        current.children.set(part, child);
      }

      if (index === parts.length - 1) {
        child.file = file;
      }

      current = child;
    });
  }

  return root;
}

function countFiles(node: TreeNode): number {
  let count = node.file ? 1 : 0;
  for (const child of node.children.values()) {
    count += countFiles(child);
  }

  return count;
}

function workingTreeOperationStatus(workingTree: WorkingTreeViewModel | undefined): ChangesPanelOperationStatus | undefined {
  if (!workingTree?.operationState) {
    return undefined;
  }

  return {
    message: workingTree.operationState.message,
    state: workingTree.operationState.status === "ok" ? "success" : "warning"
  };
}

function statusClassName(state: ChangesPanelOperationStatus["state"]): string {
  const tone = state === "error"
    ? "text-[var(--vscode-errorForeground)]"
    : "text-[var(--vscode-descriptionForeground)]";
  return `mt-1 truncate text-[11px] ${tone}`;
}
