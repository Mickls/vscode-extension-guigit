import type { ReactElement } from "react";
import type { FileChangeViewModel } from "../../app/rpcContract.generated";
import { IconTooltip } from "../IconTooltip/IconTooltip";

export interface CompareOverlayLabels {
  baseCommit: string;
  changedFiles: string;
  close: string;
  from: string;
  noFilesChanged: string;
  openDiff: string;
  targetCommit: string;
  title: string;
  to: string;
}

const defaultLabels: CompareOverlayLabels = {
  baseCommit: "Base commit",
  changedFiles: "Changed Files",
  close: "Close compare",
  from: "From",
  noFilesChanged: "No files changed",
  openDiff: "Open diff for {0}",
  targetCommit: "Target commit",
  title: "Compare Commits",
  to: "To"
};

export interface CompareOverlayProps {
  files?: readonly FileChangeViewModel[];
  fromHash: string;
  labels?: Partial<CompareOverlayLabels>;
  onClose?: () => void;
  onOpenFileDiff?: (path: string) => void;
  open: boolean;
  toHash: string;
}

export function CompareOverlay({
  files = [],
  fromHash,
  labels,
  onClose,
  onOpenFileDiff,
  open,
  toHash
}: CompareOverlayProps): ReactElement | null {
  if (!open) {
    return null;
  }

  const text = { ...defaultLabels, ...labels };
  return (
    <section
      aria-label={text.title}
      className="fixed inset-0 z-[999] flex flex-col bg-[var(--vscode-editor-background)]"
      role="region"
    >
      <header className="flex items-center justify-between border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-panel-background)] px-4 py-3">
        <h3 className="m-0 text-sm">{text.title}</h3>
        <button
          aria-label={text.close}
          className="guigit-icon-tooltip-host flex h-6 w-6 items-center justify-center rounded bg-transparent text-lg text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onClose}
          type="button"
        >
          x
          <IconTooltip label={text.close} placement="bottom" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex gap-4 border-b border-[var(--vscode-panel-border)] pb-4">
          <CompareCommitSummary hash={fromHash} label={text.from} note={text.baseCommit} />
          <div className="flex min-w-[30px] items-center justify-center text-lg text-[var(--vscode-descriptionForeground)]">
            {text.to}
          </div>
          <CompareCommitSummary hash={toHash} label={text.to} note={text.targetCommit} />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-sm">{text.changedFiles} ({files.length})</h3>
          </div>
          <div className="rounded border border-[var(--vscode-panel-border)]">
            {files.length > 0 ? (
              files.map((file) => (
                <button
                  aria-label={formatLabel(text.openDiff, file.path)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--vscode-panel-border)] bg-transparent px-3 py-2 text-left text-xs last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
                  key={file.path}
                  onClick={() => onOpenFileDiff?.(file.path)}
                  type="button"
                >
                  <span className="truncate">{file.path}</span>
                  <span className="shrink-0 text-[11px]">
                    <span className="text-[#28a745]">+{file.insertions}</span>{" "}
                    <span className="text-[#dc3545]">-{file.deletions}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-xs text-[var(--vscode-descriptionForeground)]">
                {text.noFilesChanged}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface CompareCommitSummaryProps {
  hash: string;
  label: string;
  note: string;
}

function CompareCommitSummary({ hash, label, note }: CompareCommitSummaryProps): ReactElement {
  return (
    <div className="flex-1 rounded bg-[var(--vscode-input-background)] p-3">
      <h4 className="m-0 mb-1 font-mono text-sm">
        {label}: {hash.slice(0, 7)}
      </h4>
      <p className="m-0 text-[11px] text-[var(--vscode-descriptionForeground)]">{note}</p>
    </div>
  );
}

function formatLabel(label: string, value: string): string {
  return label.replace("{0}", value);
}
