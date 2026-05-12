import type { ReactElement } from "react";
import type { NotificationState } from "../NotificationCenter/NotificationCenter";

export interface OperationToastProps {
  message: string;
  state: NotificationState;
}

export function OperationToast({ message, state }: OperationToastProps): ReactElement {
  const stateClass = {
    error: "border-l-4 border-l-[var(--vscode-errorForeground)]",
    running: "border-l-4 border-l-[var(--vscode-progressBar-background)]",
    success: "border-l-4 border-l-[var(--vscode-testing-iconPassed)]",
    warning: "border-l-4 border-l-[var(--vscode-editorWarning-foreground)]"
  }[state];

  return (
    <div
      className={`fixed bottom-4 right-4 flex max-w-[360px] items-center gap-2 rounded-[4px] border border-[var(--vscode-notifications-border)] bg-[var(--vscode-notifications-background)] px-3 py-2 text-xs text-[var(--vscode-notifications-foreground)] shadow-lg ${stateClass}`}
      role="status"
    >
      {state === "running" ? (
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-[var(--vscode-progressBar-background)] border-t-transparent" />
      ) : null}
      {message}
    </div>
  );
}
