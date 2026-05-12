import { useRef, type ChangeEvent, type MouseEvent, type ReactElement } from "react";
import {
  CloudDownload,
  Bell,
  GitBranch,
  GitGraph,
  GitPullRequestArrow,
  GitPullRequestCreateArrow,
  HardDriveDownload,
  RefreshCw,
  Settings,
  User
} from "lucide-react";
import type { BranchesViewModel, CurrentUserViewModel, RepositoryViewModel } from "../../app/rpcContract.generated";
import { BranchMenu } from "./BranchMenu";

type ToolbarAction = "fetch" | "notifications" | "pull" | "push" | "refresh" | "settings";
type HeaderAction = ToolbarAction | "checkout" | "clone";

interface ToolbarActionItem {
  action: HeaderAction;
  gitOperation?: boolean;
  icon: ReactElement;
  label: string;
  title?: string;
}

export interface HeaderLabels {
  allBranches: string;
  authorMe: string;
  authorPlaceholder: string;
  branch: string;
  checkout: string;
  clone: string;
  fetch: string;
  filterAuthor: string;
  graph: string;
  hideGraph: string;
  pull: string;
  pullTitle: string;
  push: string;
  pushTitle: string;
  refresh: string;
  repository: string;
  searchCommits: string;
  searchPlaceholder: string;
  selectedBranches: string;
  settings: string;
  showGraph: string;
  notifications: string;
}

const defaultLabels: HeaderLabels = {
  allBranches: "All branches",
  authorMe: "Me",
  authorPlaceholder: "Author",
  branch: "Branches",
  checkout: "Checkout",
  clone: "Clone",
  fetch: "Fetch",
  filterAuthor: "Filter author",
  graph: "Graph",
  hideGraph: "Hide Git Graph",
  pull: "Pull",
  pullTitle: "Pull (Command/Ctrl+click for Advanced Pull)",
  push: "Push",
  pushTitle: "Push (Command/Ctrl+click for Advanced Push)",
  refresh: "Refresh",
  repository: "Repository",
  searchCommits: "Search commits",
  searchPlaceholder: "Search commits",
  selectedBranches: "{0} branches",
  settings: "Settings",
  showGraph: "Show Git Graph",
  notifications: "Notifications"
};

function hasAdvancedModifier(event: MouseEvent<HTMLButtonElement>): boolean {
  return event.metaKey || event.ctrlKey;
}

export interface HeaderProps {
  authorValue?: string;
  branches?: BranchesViewModel;
  currentUser?: CurrentUserViewModel;
  labels?: Partial<HeaderLabels>;
  graphVisible?: boolean;
  repositories?: readonly RepositoryViewModel[];
  searchValue?: string;
  selectedBranches?: readonly string[];
  selectedRepositoryId?: string;
  onGraphToggle?: () => void;
  onAdvancedPull?: () => void;
  onAdvancedPush?: () => void;
  onAuthorChange?: (value: string) => void;
  onBranchSelectionChange?: (branches: readonly string[]) => void;
  onCheckout?: () => void;
  onClone?: () => void;
  onRefresh?: () => void;
  onFetch?: () => void;
  onPull?: () => void;
  onPush?: () => void;
  onRepositoryChange?: (repositoryId: string) => void;
  onSearchChange?: (value: string) => void;
  onNotificationsClick?: () => void;
  onSettingsClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  gitOperationBusy?: boolean;
  notificationCount?: number;
  notificationsOpen?: boolean;
  settingsOpen?: boolean;
}

export function Header({
  authorValue = "",
  branches,
  currentUser,
  labels,
  graphVisible = true,
  repositories = [],
  searchValue = "",
  selectedBranches = [],
  selectedRepositoryId,
  onAdvancedPull,
  onAdvancedPush,
  onAuthorChange,
  onBranchSelectionChange,
  onCheckout,
  onClone,
  onGraphToggle,
  onFetch,
  onPull,
  onPush,
  onRefresh,
  onRepositoryChange,
  onSearchChange,
  onNotificationsClick,
  onSettingsClick,
  gitOperationBusy = false,
  notificationCount = 0,
  notificationsOpen = false,
  settingsOpen = false
}: HeaderProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  const graphLabel = graphVisible ? text.hideGraph : text.showGraph;
  const toolbarActions: readonly ToolbarActionItem[] = [
    {
      action: "refresh",
      icon: <RefreshCw aria-hidden="true" className="h-4 w-4" />,
      label: text.refresh
    },
    {
      action: "pull",
      gitOperation: true,
      icon: <GitPullRequestArrow aria-hidden="true" className="h-4 w-4" />,
      label: text.pull,
      title: text.pullTitle
    },
    {
      action: "push",
      gitOperation: true,
      icon: <GitPullRequestCreateArrow aria-hidden="true" className="h-4 w-4" />,
      label: text.push,
      title: text.pushTitle
    },
    {
      action: "fetch",
      gitOperation: true,
      icon: <CloudDownload aria-hidden="true" className="h-4 w-4" />,
      label: text.fetch
    },
    {
      action: "checkout",
      gitOperation: true,
      icon: <GitBranch aria-hidden="true" className="h-4 w-4" />,
      label: text.checkout
    },
    {
      action: "clone",
      gitOperation: true,
      icon: <HardDriveDownload aria-hidden="true" className="h-4 w-4" />,
      label: text.clone
    },
    {
      action: "notifications",
      icon: <Bell aria-hidden="true" className="h-4 w-4" />,
      label: text.notifications,
      title: notificationCount > 0 ? `${text.notifications} (${notificationCount})` : text.notifications
    },
    {
      action: "settings",
      icon: <Settings aria-hidden="true" className="h-4 w-4" />,
      label: text.settings
    }
  ];
  const skippedClickActionRef = useRef<HeaderAction | undefined>(undefined);
  const advancedHandlers: Partial<Record<HeaderAction, () => void>> = {
    pull: onAdvancedPull,
    push: onAdvancedPush
  };
  const actionHandlers: Record<HeaderAction, ((event: MouseEvent<HTMLButtonElement>) => void) | undefined> = {
    checkout: onCheckout,
    clone: onClone,
    fetch: onFetch,
    pull: (event) => {
      if (skippedClickActionRef.current === "pull") {
        skippedClickActionRef.current = undefined;
        return;
      }

      if (hasAdvancedModifier(event)) {
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

      if (hasAdvancedModifier(event)) {
        onAdvancedPush?.();
        return;
      }

      onPush?.();
    },
    refresh: onRefresh,
    notifications: (event) => {
      event.stopPropagation();
      onNotificationsClick?.();
    },
    settings: (event) => {
      event.stopPropagation();
      onSettingsClick?.(event);
    }
  };
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>, action: HeaderAction) => {
    if (!hasAdvancedModifier(event)) {
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
  const updateSearch = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(event.currentTarget.value);
  };
  const updateAuthor = (event: ChangeEvent<HTMLInputElement>) => {
    onAuthorChange?.(event.currentTarget.value);
  };
  const filterCurrentUser = () => {
    onAuthorChange?.(currentUser!.name);
  };
  const updateRepository = (event: ChangeEvent<HTMLSelectElement>) => {
    onRepositoryChange?.(event.currentTarget.value);
  };

  return (
    <header className="relative flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-panel-background)] px-2 py-2">
      <select
        aria-label={text.repository}
        className="h-7 max-w-[220px] rounded-[3px] border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] px-2 text-xs text-[var(--vscode-dropdown-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
        onChange={updateRepository}
        value={selectedRepositoryId ?? repositories[0]?.id ?? ""}
      >
        {repositories.map((repository) => (
          <option key={repository.id} value={repository.id}>
            {repository.name}
          </option>
        ))}
      </select>
      <BranchMenu
        branches={branches}
        labels={{
          allBranches: text.allBranches,
          branch: text.branch,
          selectedBranches: text.selectedBranches
        }}
        onBranchSelectionChange={onBranchSelectionChange}
        selectedBranches={selectedBranches}
      />
      <input
        aria-label={text.searchCommits}
        className="h-7 min-w-[180px] flex-1 rounded-[3px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
        onChange={updateSearch}
        placeholder={text.searchPlaceholder}
        type="search"
        value={searchValue}
      />
      <div className="flex flex-wrap items-center gap-1">
        <input
          aria-label={text.filterAuthor}
          className="h-7 w-[150px] rounded-[3px] border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
          onChange={updateAuthor}
          placeholder={text.authorPlaceholder}
          type="search"
          value={authorValue}
        />
        <button
          aria-label={text.authorMe}
          className="flex h-7 items-center justify-center gap-1 rounded-[3px] border border-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          disabled={!currentUser}
          onClick={filterCurrentUser}
          title={currentUser ? `${currentUser.name} <${currentUser.email}>` : text.authorMe}
          type="button"
        >
          <User aria-hidden="true" className="h-4 w-4" />
          <span>{text.authorMe}</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          aria-label={graphLabel}
          aria-pressed={graphVisible}
          className="flex h-7 items-center justify-center gap-1 rounded-[3px] border border-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onGraphToggle}
          title={graphLabel}
          type="button"
        >
          <GitGraph aria-hidden="true" className="h-4 w-4" />
          <span>{text.graph}</span>
        </button>
        {toolbarActions.map((item) => (
          <button
            aria-label={item.label}
            aria-busy={item.gitOperation && gitOperationBusy ? true : undefined}
            aria-expanded={item.action === "settings" ? settingsOpen : undefined}
            aria-pressed={item.action === "notifications" ? notificationsOpen : undefined}
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
            {item.action === "notifications" && notificationCount > 0 ? (
              <span
                aria-hidden="true"
                className="min-w-4 rounded-full bg-[var(--vscode-badge-background)] px-1 text-center text-[10px] leading-4 text-[var(--vscode-badge-foreground)]"
              >
                {notificationCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </header>
  );
}
