import type { ReactElement } from "react";

export interface ConflictBannerLabels {
  abort: string;
  continue: string;
  label: string;
}

export interface ConflictBannerProps {
  labels: ConflictBannerLabels;
  message: string;
  onAbort: () => void;
  onContinue: () => void;
}

export function ConflictBanner({ labels, message, onAbort, onContinue }: ConflictBannerProps): ReactElement {
  return (
    <section
      aria-label={labels.label}
      className="flex shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-notifications-background)] px-3 py-2 text-xs text-[var(--vscode-notifications-foreground)]"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        className="h-7 whitespace-nowrap rounded-[3px] border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] px-2 text-xs text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
        onClick={onContinue}
        type="button"
      >
        {labels.continue}
      </button>
      <button
        className="h-7 whitespace-nowrap rounded-[3px] border border-[var(--vscode-button-secondaryBorder,transparent)] bg-[var(--vscode-button-secondaryBackground)] px-2 text-xs text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
        onClick={onAbort}
        type="button"
      >
        {labels.abort}
      </button>
    </section>
  );
}
