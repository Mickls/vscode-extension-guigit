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
  label: string;
}

const actionGroups: readonly (readonly ContextMenuActionItem[])[] = [
  [
    { action: "copyHash", label: "Copy Hash" },
    { action: "cherryPick", label: "Cherry Pick" },
    { action: "revert", label: "Revert" }
  ],
  [{ action: "editCommitMessage", label: "Edit Commit Message" }],
  [
    { action: "compare", label: "Compare Selected" },
    { action: "squash", label: "Squash Commits" }
  ],
  [
    { action: "createBranch", label: "Create Branch" },
    { action: "pushToCommit", label: "Push All Commits to Here" }
  ],
  [
    { action: "resetSoft", label: "Reset Soft" },
    { action: "resetMixed", label: "Reset Mixed" },
    { action: "resetHard", label: "Reset Hard" }
  ]
];

export interface ContextMenuProps {
  canEditCommitMessage: boolean;
  onAction?: (action: ContextMenuAction) => void;
  selectedCommitCount: number;
  visible: boolean;
  x: number;
  y: number;
}

export function ContextMenu({
  canEditCommitMessage,
  onAction,
  selectedCommitCount,
  visible,
  x,
  y
}: ContextMenuProps): ReactElement | null {
  if (!visible) {
    return null;
  }

  return (
    <div
      aria-label="Commit actions"
      className="fixed z-[1000] min-w-[150px] max-w-[calc(100vw-20px)] rounded border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] py-1 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
      role="menu"
      style={{ left: x, top: y }}
    >
      {actionGroups.map((group, groupIndex) => (
        <div key={group[0]!.action}>
          {group.map((item) => (
            <button
              aria-disabled={isDisabled(item.action, canEditCommitMessage, selectedCommitCount)}
              className="block w-full cursor-pointer bg-transparent px-3 py-2 text-left text-[var(--vscode-menu-foreground,var(--vscode-foreground))] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-disabled:hover:text-[var(--vscode-menu-foreground,var(--vscode-foreground))]"
              data-action={item.action}
              key={item.action}
              onClick={() => {
                if (!isDisabled(item.action, canEditCommitMessage, selectedCommitCount)) {
                  onAction?.(item.action);
                }
              }}
              role="menuitem"
              type="button"
            >
              {labelFor(item, selectedCommitCount)}
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

function isDisabled(action: ContextMenuAction, canEditCommitMessage: boolean, selectedCommitCount: number): boolean {
  if (action === "editCommitMessage") {
    return !canEditCommitMessage;
  }

  if (action === "compare") {
    return selectedCommitCount !== 2;
  }

  return false;
}

function labelFor(item: ContextMenuActionItem, selectedCommitCount: number): string {
  if (item.action === "compare") {
    return selectedCommitCount === 2 ? "Compare Selected (2)" : `Compare Selected (${selectedCommitCount}/2)`;
  }

  if (item.action === "squash" && selectedCommitCount > 1) {
    return `Squash ${selectedCommitCount} Commits`;
  }

  return item.label;
}
