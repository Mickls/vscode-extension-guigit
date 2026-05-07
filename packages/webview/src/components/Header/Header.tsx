import type { ReactElement } from "react";

const toolbarActions = ["Refresh", "Pull", "Push", "Fetch", "Settings"] as const;

export interface HeaderProps {
  graphVisible?: boolean;
  onGraphToggle?: () => void;
  onSettingsClick?: () => void;
  settingsOpen?: boolean;
}

export function Header({
  graphVisible = true,
  onGraphToggle,
  onSettingsClick,
  settingsOpen = false
}: HeaderProps): ReactElement {
  const graphLabel = graphVisible ? "Hide Git Graph" : "Show Git Graph";

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-panel-background)] px-2">
      <button
        className="h-7 max-w-[220px] truncate rounded-[3px] border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] px-2 text-left text-xs text-[var(--vscode-dropdown-foreground)]"
        type="button"
      >
        main
      </button>
      <input
        aria-label="Search commits"
        className="h-7 min-w-[180px] flex-1 rounded-[3px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
        placeholder="Search commits"
        type="search"
      />
      <input
        aria-label="Filter author"
        className="h-7 w-[150px] rounded-[3px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
        placeholder="Author"
        type="search"
      />
      <div className="flex items-center gap-1">
        <button
          aria-label={graphLabel}
          aria-pressed={graphVisible}
          className="flex h-7 min-w-7 items-center justify-center rounded-[3px] border border-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onGraphToggle}
          title={graphLabel}
          type="button"
        >
          G
        </button>
        {toolbarActions.map((action) => (
          <button
            aria-label={action}
            aria-expanded={action === "Settings" ? settingsOpen : undefined}
            className="flex h-7 min-w-7 items-center justify-center rounded-[3px] border border-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            key={action}
            onClick={action === "Settings" ? onSettingsClick : undefined}
            title={action}
            type="button"
          >
            {action[0]}
          </button>
        ))}
      </div>
    </header>
  );
}
