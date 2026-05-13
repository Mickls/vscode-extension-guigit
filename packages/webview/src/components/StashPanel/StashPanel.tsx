import { useState, type ReactElement } from "react";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import type {
  RepositoryViewModel,
  StashEntryViewModel,
  WorkingTreeViewModel
} from "../../app/rpcContract.generated";
import { IconTooltip } from "../IconTooltip/IconTooltip";

export interface StashPanelLabels {
  applyStash: string;
  binary: string;
  branch: string;
  createStash: string;
  dropStash: string;
  expandStash: string;
  noStashes: string;
  openDiff: string;
  popStash: string;
  refreshStashes: string;
  repository: string;
  stash: string;
}

const defaultLabels: StashPanelLabels = {
  applyStash: "Apply stash",
  binary: "binary",
  branch: "Branch",
  createStash: "Stash All Changes",
  dropStash: "Drop stash",
  expandStash: "Expand stash {0}",
  noStashes: "No stashes",
  openDiff: "Open diff for {0}",
  popStash: "Pop stash",
  refreshStashes: "Refresh Stashes",
  repository: "Repository",
  stash: "Stash"
};

export interface StashPanelProps {
  labels?: Partial<StashPanelLabels>;
  operationBusy?: boolean;
  operationStatus?: StashPanelOperationStatus;
  repository?: RepositoryViewModel;
  onApplyStash?: (stashRef: string) => void;
  onCreateStash?: () => void;
  onDropStash?: (stashRef: string) => void;
  onExpandStash?: (stashRef: string) => void;
  onOpenStashDiff?: (stashRef: string, path: string, previousPath?: string) => void;
  onPopStash?: (stashRef: string) => void;
  onRefresh?: () => void;
  workingTree?: WorkingTreeViewModel;
}

export interface StashPanelOperationStatus {
  message: string;
  state: "error" | "running" | "success" | "warning";
}

export function StashPanel({
  labels,
  operationBusy = false,
  operationStatus,
  repository,
  onApplyStash,
  onCreateStash,
  onDropStash,
  onExpandStash,
  onOpenStashDiff,
  onPopStash,
  onRefresh,
  workingTree
}: StashPanelProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  const stashes = workingTree?.stashes ?? [];
  const changeCount = (workingTree?.staged.length ?? 0) + (workingTree?.unstaged.length ?? 0);
  const workingTreeBlocksStash = workingTree?.operationState?.status === "conflict";
  const canCreateStash = !operationBusy && !workingTreeBlocksStash && changeCount > 0;
  const status = operationStatus ?? workingTreeOperationStatus(workingTree);

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
          aria-label={text.refreshStashes}
          className="guigit-icon-tooltip-host flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[3px] border border-transparent text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onRefresh}
          title={text.refreshStashes}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          <IconTooltip label={text.refreshStashes} placement="bottom" />
        </button>
      </div>
      <section aria-label={text.stash} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">
            {text.stash} ({stashes.length})
          </h3>
          <button
            className="inline-flex items-center gap-1 rounded-[3px] border border-[var(--vscode-button-border)] px-2 py-0.5 text-[11px] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCreateStash}
            onClick={onCreateStash}
            type="button"
          >
            <Archive aria-hidden="true" className="h-3.5 w-3.5" />
            {text.createStash}
          </button>
        </div>
        <StashList
          labels={{
            applyStash: text.applyStash,
            binary: text.binary,
            dropStash: text.dropStash,
            expandStash: text.expandStash,
            noStashes: text.noStashes,
            openDiff: text.openDiff,
            popStash: text.popStash
          }}
          operationBusy={operationBusy}
          onApplyStash={onApplyStash}
          onDropStash={onDropStash}
          onExpandStash={onExpandStash}
          onOpenStashDiff={onOpenStashDiff}
          onPopStash={onPopStash}
          stashes={stashes}
        />
      </section>
    </div>
  );
}

function StashList({
  labels,
  operationBusy,
  onApplyStash,
  onDropStash,
  onExpandStash,
  onOpenStashDiff,
  onPopStash,
  stashes
}: {
  labels: Pick<StashPanelLabels, "applyStash" | "binary" | "dropStash" | "expandStash" | "noStashes" | "openDiff" | "popStash">;
  operationBusy: boolean;
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
    <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
      {stashes.length > 0 ? (
        stashes.map((stash) => {
          const expanded = expandedRefs.includes(stash.ref);
          return (
            <div className="border-b border-[var(--vscode-panel-border)] px-2 py-1.5 text-xs last:border-b-0" key={stash.ref}>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <button
                  aria-label={formatLabel(labels.expandStash, stash.message)}
                  className="guigit-icon-tooltip-host flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-transparent text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                  onClick={() => toggleStash(stash.ref)}
                  type="button"
                >
                  {expanded ? <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
                  <IconTooltip label={formatLabel(labels.expandStash, stash.message)} placement="right" />
                </button>
                <div className="min-w-0">
                  <div className="truncate text-[var(--vscode-foreground)]">{stash.message}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StashActionButton disabled={operationBusy} icon="apply" label={labels.applyStash} onClick={() => onApplyStash?.(stash.ref)} />
                  <StashActionButton disabled={operationBusy} icon="pop" label={labels.popStash} onClick={() => onPopStash?.(stash.ref)} />
                  <StashActionButton disabled={operationBusy} icon="drop" label={labels.dropStash} onClick={() => onDropStash?.(stash.ref)} />
                </div>
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
                        {file.binary ? labels.binary : file.status}
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
  );
}

function StashActionButton({
  disabled,
  icon,
  label,
  onClick
}: {
  disabled: boolean;
  icon: "apply" | "drop" | "pop";
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-label={label}
      className="guigit-icon-tooltip-host flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-transparent text-[10px] text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon === "apply" ? <ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {icon === "pop" ? <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {icon === "drop" ? <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      <IconTooltip label={label} placement="left" />
    </button>
  );
}

function formatLabel(label: string, value: string): string {
  return label.replace("{0}", value);
}

function workingTreeOperationStatus(workingTree: WorkingTreeViewModel | undefined): StashPanelOperationStatus | undefined {
  if (!workingTree?.operationState) {
    return undefined;
  }

  return {
    message: workingTree.operationState.message,
    state: workingTree.operationState.status === "ok" ? "success" : "warning"
  };
}

function statusClassName(state: StashPanelOperationStatus["state"]): string {
  const tone = state === "error"
    ? "text-[var(--vscode-errorForeground)]"
    : "text-[var(--vscode-descriptionForeground)]";
  return `mt-1 truncate text-[11px] ${tone}`;
}
