import { useRef, type MouseEvent, type ReactElement } from "react";

type ToolbarAction = "fetch" | "pull" | "push" | "refresh" | "settings";

interface ToolbarActionItem {
  action: ToolbarAction;
  gitOperation?: boolean;
  icon: ReactElement;
  label: string;
  title?: string;
}

export interface HeaderLabels {
  authorPlaceholder: string;
  fetch: string;
  filterAuthor: string;
  graph: string;
  hideGraph: string;
  pull: string;
  pullTitle: string;
  push: string;
  pushTitle: string;
  refresh: string;
  searchCommits: string;
  searchPlaceholder: string;
  settings: string;
  showGraph: string;
}

const defaultLabels: HeaderLabels = {
  authorPlaceholder: "Author",
  fetch: "Fetch",
  filterAuthor: "Filter author",
  graph: "Graph",
  hideGraph: "Hide Git Graph",
  pull: "Pull",
  pullTitle: "Pull (Command+click for Advanced Pull)",
  push: "Push",
  pushTitle: "Push (Command+click for Advanced Push)",
  refresh: "Refresh",
  searchCommits: "Search commits",
  searchPlaceholder: "Search commits",
  settings: "Settings",
  showGraph: "Show Git Graph"
};

export interface HeaderProps {
  labels?: Partial<HeaderLabels>;
  graphVisible?: boolean;
  onGraphToggle?: () => void;
  onAdvancedPull?: () => void;
  onAdvancedPush?: () => void;
  onRefresh?: () => void;
  onFetch?: () => void;
  onPull?: () => void;
  onPush?: () => void;
  onSettingsClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  gitOperationBusy?: boolean;
  settingsOpen?: boolean;
}

export function Header({
  labels,
  graphVisible = true,
  onAdvancedPull,
  onAdvancedPush,
  onGraphToggle,
  onFetch,
  onPull,
  onPush,
  onRefresh,
  onSettingsClick,
  gitOperationBusy = false,
  settingsOpen = false
}: HeaderProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  const graphLabel = graphVisible ? text.hideGraph : text.showGraph;
  const toolbarActions: readonly ToolbarActionItem[] = [
    {
      action: "refresh",
      icon: <RefreshIcon />,
      label: text.refresh
    },
    {
      action: "pull",
      gitOperation: true,
      icon: <PullIcon />,
      label: text.pull,
      title: text.pullTitle
    },
    {
      action: "push",
      gitOperation: true,
      icon: <PushIcon />,
      label: text.push,
      title: text.pushTitle
    },
    {
      action: "fetch",
      gitOperation: true,
      icon: <FetchIcon />,
      label: text.fetch
    },
    {
      action: "settings",
      icon: <SettingsIcon />,
      label: text.settings
    }
  ];
  const skippedClickActionRef = useRef<ToolbarAction | undefined>(undefined);
  const advancedHandlers: Partial<Record<ToolbarAction, () => void>> = {
    pull: onAdvancedPull,
    push: onAdvancedPush
  };
  const actionHandlers: Record<ToolbarAction, ((event: MouseEvent<HTMLButtonElement>) => void) | undefined> = {
    fetch: onFetch,
    pull: (event) => {
      if (skippedClickActionRef.current === "pull") {
        skippedClickActionRef.current = undefined;
        return;
      }

      if (event.metaKey) {
        onAdvancedPull?.();
        return;
      }

      onPull?.();
    },
    push: (event) => {
      if (skippedClickActionRef.current === "push") {
        skippedClickActionRef.current = undefined;
        return;
      }

      if (event.metaKey) {
        onAdvancedPush?.();
        return;
      }

      onPush?.();
    },
    refresh: onRefresh,
    settings: onSettingsClick
  };
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>, action: ToolbarAction) => {
    if (!event.metaKey) {
      return;
    }

    const advancedHandler = advancedHandlers[action];
    if (!advancedHandler) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    skippedClickActionRef.current = action;
    advancedHandler();
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
        aria-label={text.searchCommits}
        className="h-7 min-w-[180px] flex-1 rounded-[3px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
        placeholder={text.searchPlaceholder}
        type="search"
      />
      <input
        aria-label={text.filterAuthor}
        className="h-7 w-[150px] rounded-[3px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
        placeholder={text.authorPlaceholder}
        type="search"
      />
      <div className="flex items-center gap-1">
        <button
          aria-label={graphLabel}
          aria-pressed={graphVisible}
          className="flex h-7 items-center justify-center gap-1 rounded-[3px] border border-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onGraphToggle}
          title={graphLabel}
          type="button"
        >
          <GraphIcon />
          <span>{text.graph}</span>
        </button>
        {toolbarActions.map((item) => (
          <button
            aria-label={item.label}
            aria-busy={item.gitOperation && gitOperationBusy ? true : undefined}
            aria-expanded={item.action === "settings" ? settingsOpen : undefined}
            className="flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-[3px] border border-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            disabled={item.gitOperation && gitOperationBusy}
            key={item.action}
            onMouseDown={(event) => handleMouseDown(event, item.action)}
            onClick={actionHandlers[item.action]}
            title={item.title ?? item.label}
            type="button"
          >
            {item.icon}
            <span>{item.label}</span>
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
      <path d="M5.1 12.2H4.6a3 3 0 0 1-.3-6 4.1 4.1 0 0 1 7.9 1.1 2.5 2.5 0 0 1-.8 4.9h-.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      <path d="M8 7.4v6M5.8 11.2 8 13.4l2.2-2.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
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
