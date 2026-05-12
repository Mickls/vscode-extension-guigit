import type { ReactElement } from "react";
import { Clipboard, Trash2, X } from "lucide-react";

export type NotificationState = "error" | "running" | "success" | "warning";

export interface NotificationHistoryItem {
  createdAt: string;
  id: string;
  message: string;
  read: boolean;
  state: NotificationState;
}

export interface NotificationCenterLabels {
  clear: string;
  close: string;
  copy: string;
  empty: string;
  showUnreadCount: string;
  states: Record<NotificationState, string>;
  title: string;
}

export interface NotificationCenterProps {
  labels: NotificationCenterLabels;
  notifications: readonly NotificationHistoryItem[];
  onClear: () => void;
  onClose: () => void;
  onCopyNotification: (notification: NotificationHistoryItem) => void;
  onShowUnreadCountChange: (showUnreadCount: boolean) => void;
  open: boolean;
  showUnreadCount: boolean;
}

export function NotificationCenter({
  labels,
  notifications,
  onClear,
  onClose,
  onCopyNotification,
  onShowUnreadCountChange,
  open,
  showUnreadCount
}: NotificationCenterProps): ReactElement | null {
  if (!open) {
    return null;
  }

  return (
    <section
      aria-label={labels.title}
      className="fixed right-3 top-14 z-50 flex max-h-[min(520px,calc(100vh-72px))] w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[4px] border border-[var(--vscode-panel-border)] bg-[var(--vscode-panel-background)] text-[var(--vscode-editor-foreground)] shadow-xl"
      role="region"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] px-3">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">{labels.title}</h2>
        <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-[var(--vscode-descriptionForeground)]">
          <input
            checked={showUnreadCount}
            className="h-3 w-3"
            onChange={(event) => onShowUnreadCountChange(event.currentTarget.checked)}
            type="checkbox"
          />
          {labels.showUnreadCount}
        </label>
        <button
          aria-label={labels.clear}
          className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-transparent text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          disabled={notifications.length === 0}
          onClick={onClear}
          title={labels.clear}
          type="button"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          aria-label={labels.close}
          className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-transparent text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onClose}
          title={labels.close}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {notifications.length === 0 ? (
        <p className="px-3 py-4 text-xs text-[var(--vscode-descriptionForeground)]">{labels.empty}</p>
      ) : (
        <ul className="min-h-0 overflow-y-auto">
          {notifications.map((notification) => (
            <li
              className="flex gap-2 border-b border-[var(--vscode-panel-border)] px-3 py-2 last:border-b-0"
              key={notification.id}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-[10px] uppercase text-[var(--vscode-descriptionForeground)]">
                  <span>{labels.states[notification.state]}</span>
                  <span>{formatNotificationTime(notification.createdAt)}</span>
                </div>
                <p className="text-xs leading-5">{notification.message}</p>
              </div>
              <button
                aria-label={labels.copy}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border border-transparent text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                onClick={() => onCopyNotification(notification)}
                title={labels.copy}
                type="button"
              >
                <Clipboard aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatNotificationTime(createdAt: string): string {
  return new Date(createdAt).toLocaleString();
}
