import type { ReactElement } from "react";

export type ContextMenuAction =
  | "copyHash"
  | "cherryPick"
  | "revert"
  | "editCommitMessage"
  | "compare"
  | "squash"
  | "createBranch"
  | "pushToCommit"
  | "resetSoft"
  | "resetMixed"
  | "resetHard";

interface ContextMenuActionItem {
  action: ContextMenuAction;
}

const actionGroups: readonly (readonly ContextMenuActionItem[])[] = [
  [
    { action: "copyHash" },
    { action: "cherryPick" },
    { action: "revert" }
  ],
  [{ action: "editCommitMessage" }],
  [
    { action: "compare" },
    { action: "squash" }
  ],
  [
    { action: "createBranch" },
    { action: "pushToCommit" }
  ],
  [
    { action: "resetSoft" },
    { action: "resetMixed" },
    { action: "resetHard" }
  ]
];

const viewportPadding = 8;
const menuWidth = 150;
const estimatedMenuHeight = 360;

export interface ContextMenuLabels extends Record<ContextMenuAction, string> {
  compareSelectedCount: string;
  compareSelectedProgress: string;
  menuLabel: string;
  squashCommitsCount: string;
}

const defaultLabels: ContextMenuLabels = {
  cherryPick: "Cherry Pick",
  compare: "Compare Selected",
  compareSelectedCount: "Compare Selected ({0})",
  compareSelectedProgress: "Compare Selected ({0}/2)",
  copyHash: "Copy Hash",
  createBranch: "Create Branch",
  editCommitMessage: "Edit Commit Message",
  menuLabel: "Commit actions",
  pushToCommit: "Push All Commits to Here",
  resetHard: "Reset Hard",
  resetMixed: "Reset Mixed",
  resetSoft: "Reset Soft",
  revert: "Revert",
  squash: "Squash Commits",
  squashCommitsCount: "Squash {0} Commits"
};

export interface ContextMenuProps {
  canEditCommitMessage: boolean;
  canSquashCommits?: boolean;
  labels?: Partial<ContextMenuLabels>;
  onAction?: (action: ContextMenuAction) => void;
  selectedCommitCount: number;
  visible: boolean;
  x: number;
  y: number;
}

export function ContextMenu({
  canEditCommitMessage,
  canSquashCommits,
  labels,
  onAction,
  selectedCommitCount,
  visible,
  x,
  y
}: ContextMenuProps): ReactElement | null {
  if (!visible) {
    return null;
  }

  const squashEnabled = canSquashCommits ?? selectedCommitCount > 1;
  const left = clampToViewport(x, window.innerWidth, menuWidth);
  const top = clampToViewport(y, window.innerHeight, estimatedMenuHeight);
  const text = { ...defaultLabels, ...labels };

  return (
    <div
      aria-label={text.menuLabel}
      className="fixed z-[1000] min-w-[150px] max-w-[calc(100vw-20px)] rounded border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] py-1 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
      style={{
        left,
        maxHeight: `calc(100vh - ${viewportPadding * 2}px)`,
        overflowY: "auto",
        top
      }}
    >
      {actionGroups.map((group, groupIndex) => (
        <div key={group[0]!.action}>
          {group.map((item) => (
            <button
              aria-disabled={isDisabled(item.action, canEditCommitMessage, selectedCommitCount, squashEnabled)}
              className="block w-full cursor-pointer bg-transparent px-3 py-2 text-left text-[var(--vscode-menu-foreground,var(--vscode-foreground))] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-disabled:hover:text-[var(--vscode-menu-foreground,var(--vscode-foreground))]"
              data-action={item.action}
              key={item.action}
              onClick={() => {
                if (!isDisabled(item.action, canEditCommitMessage, selectedCommitCount, squashEnabled)) {
                  onAction?.(item.action);
                }
              }}
              role="menuitem"
              type="button"
            >
              {labelFor(item.action, selectedCommitCount, text)}
            </button>
          ))}
          {groupIndex < actionGroups.length - 1 ? (
            <div
              className="my-1 h-px bg-[var(--vscode-menu-separatorBackground)]"
              role="separator"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function isDisabled(
  action: ContextMenuAction,
  canEditCommitMessage: boolean,
  selectedCommitCount: number,
  canSquashCommits = selectedCommitCount > 1
): boolean {
  if (action === "editCommitMessage") {
    return !canEditCommitMessage;
  }

  if (action === "compare") {
    return selectedCommitCount !== 2;
  }

  if (action === "squash") {
    return !canSquashCommits;
  }

  return false;
}

function clampToViewport(value: number, viewportSize: number, elementSize: number): number {
  return Math.min(Math.max(value, viewportPadding), Math.max(viewportPadding, viewportSize - elementSize - viewportPadding));
}

function labelFor(action: ContextMenuAction, selectedCommitCount: number, labels: ContextMenuLabels): string {
  if (action === "compare") {
    return selectedCommitCount === 2
      ? formatLabel(labels.compareSelectedCount, selectedCommitCount)
      : formatLabel(labels.compareSelectedProgress, selectedCommitCount);
  }

  if (action === "squash" && selectedCommitCount > 1) {
    return formatLabel(labels.squashCommitsCount, selectedCommitCount);
  }

  return labels[action];
}

function formatLabel(label: string, value: number): string {
  return label.replace("{0}", value.toString());
}
