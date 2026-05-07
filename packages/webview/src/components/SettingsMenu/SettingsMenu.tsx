import type { ReactElement } from "react";

export type SettingsMenuAction =
  | "resetStash"
  | "configureProxy"
  | "refreshProxy"
  | "manageRemotes"
  | "changeLanguage";

interface SettingsMenuActionItem {
  action: SettingsMenuAction;
  icon: string;
  label: string;
}

const actionGroups: readonly (readonly SettingsMenuActionItem[])[] = [
  [{ action: "resetStash", icon: "R", label: "Reset Auto Stash Preference" }],
  [
    { action: "configureProxy", icon: "P", label: "Configure Proxy" },
    { action: "refreshProxy", icon: "I", label: "Refresh Proxy" },
    { action: "manageRemotes", icon: "G", label: "Manage Remotes" }
  ],
  [{ action: "changeLanguage", icon: "L", label: "Change Language" }]
];

export interface SettingsMenuProps {
  onAction?: (action: SettingsMenuAction) => void;
  visible: boolean;
  x: number;
  y: number;
}

export function SettingsMenu({ onAction, visible, x, y }: SettingsMenuProps): ReactElement | null {
  if (!visible) {
    return null;
  }

  return (
    <div
      aria-label="Settings actions"
      className="fixed z-[1000] max-h-[calc(100vh-40px)] min-w-[220px] max-w-[280px] overflow-y-auto rounded border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] py-1 text-[13px] shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
      role="menu"
      style={{ left: x, top: y }}
    >
      {actionGroups.map((group, groupIndex) => (
        <div key={group[0]!.action}>
          {group.map((item) => (
            <button
              className="flex w-full cursor-pointer items-center gap-2 bg-transparent px-3.5 py-2.5 text-left text-[var(--vscode-menu-foreground,var(--vscode-foreground))] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
              data-action={item.action}
              key={item.action}
              onClick={() => onAction?.(item.action)}
              role="menuitem"
              type="button"
            >
              <span
                aria-hidden="true"
                className="flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-[var(--vscode-icon-foreground)]"
              >
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
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
