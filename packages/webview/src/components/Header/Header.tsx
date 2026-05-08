import type { ReactElement } from "react";

type ToolbarAction = "fetch" | "pull" | "push" | "refresh" | "settings";

interface ToolbarActionItem {
  action: ToolbarAction;
  icon: ReactElement;
  label: string;
}

const toolbarActions: readonly ToolbarActionItem[] = [
  {
    action: "refresh",
    icon: <RefreshIcon />,
    label: "Refresh"
  },
  {
    action: "pull",
    icon: <PullIcon />,
    label: "Pull"
  },
  {
    action: "push",
    icon: <PushIcon />,
    label: "Push"
  },
  {
    action: "fetch",
    icon: <FetchIcon />,
    label: "Fetch"
  },
  {
    action: "settings",
    icon: <SettingsIcon />,
    label: "Settings"
  }
];

export interface HeaderProps {
  graphVisible?: boolean;
  onGraphToggle?: () => void;
  onRefresh?: () => void;
  onFetch?: () => void;
  onPull?: () => void;
  onPush?: () => void;
  onSettingsClick?: () => void;
  settingsOpen?: boolean;
}

export function Header({
  graphVisible = true,
  onGraphToggle,
  onFetch,
  onPull,
  onPush,
  onRefresh,
  onSettingsClick,
  settingsOpen = false
}: HeaderProps): ReactElement {
  const graphLabel = graphVisible ? "Hide Git Graph" : "Show Git Graph";
  const actionHandlers: Record<ToolbarAction, (() => void) | undefined> = {
    fetch: onFetch,
    pull: onPull,
    push: onPush,
    refresh: onRefresh,
    settings: onSettingsClick
  };

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
          <GraphIcon />
        </button>
        {toolbarActions.map((item) => (
          <button
            aria-label={item.label}
            aria-expanded={item.action === "settings" ? settingsOpen : undefined}
            className="flex h-7 min-w-7 items-center justify-center rounded-[3px] border border-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            key={item.action}
            onClick={actionHandlers[item.action]}
            title={item.label}
            type="button"
          >
            {item.icon}
          </button>
        ))}
      </div>
    </header>
  );
}

function HeaderIcon({ children }: { children: ReactElement | readonly ReactElement[] }): ReactElement {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
      {children}
    </svg>
  );
}

function GraphIcon(): ReactElement {
  return (
    <HeaderIcon>
      <path d="M4 3.2v9.6M12 3.2v9.6M4 8h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      <circle cx="4" cy="3.2" fill="currentColor" r="1.45" />
      <circle cx="12" cy="8" fill="currentColor" r="1.45" />
      <circle cx="4" cy="12.8" fill="currentColor" r="1.45" />
    </HeaderIcon>
  );
}

function RefreshIcon(): ReactElement {
  return (
    <HeaderIcon>
      <path d="M12.2 5.2A4.8 4.8 0 0 0 3.5 4.4L2.6 5.6M3.8 10.8a4.8 4.8 0 0 0 8.7.8l.9-1.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      <path d="M2.5 2.8v2.9h3M13.5 13.2v-2.9h-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
    </HeaderIcon>
  );
}

function PullIcon(): ReactElement {
  return (
    <HeaderIcon>
      <path d="M8 2.5v10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      <path d="M4.8 9.4 8 12.6l3.2-3.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      <path d="M3.3 13.5h9.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
    </HeaderIcon>
  );
}

function PushIcon(): ReactElement {
  return (
    <HeaderIcon>
      <path d="M8 13.5v-10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      <path d="M4.8 6.6 8 3.4l3.2 3.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      <path d="M3.3 2.5h9.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
    </HeaderIcon>
  );
}

function FetchIcon(): ReactElement {
  return (
    <HeaderIcon>
      <path d="M4.5 7.2A3.8 3.8 0 0 1 11 4.5l.6.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      <path d="M11.5 8.8A3.8 3.8 0 0 1 5 11.5l-.6-.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      <path d="M11.8 2.4v2.9H8.9M4.2 13.6v-2.9h2.9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
    </HeaderIcon>
  );
}

function SettingsIcon(): ReactElement {
  return (
    <HeaderIcon>
      <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.35" />
      <path d="M8 2.8v1.3M8 11.9v1.3M3.5 5.4l1.1.7M11.4 9.9l1.1.7M3.5 10.6l1.1-.7M11.4 6.1l1.1-.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
    </HeaderIcon>
  );
}
