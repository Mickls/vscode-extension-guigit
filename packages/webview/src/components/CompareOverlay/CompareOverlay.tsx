import type { ReactElement } from "react";
import type { FileChangeViewModel } from "../../app/rpcContract.generated";

export interface CompareOverlayProps {
  files?: readonly FileChangeViewModel[];
  fromHash: string;
  onClose?: () => void;
  onOpenFileDiff?: (path: string) => void;
  open: boolean;
  toHash: string;
}

export function CompareOverlay({
  files = [],
  fromHash,
  onClose,
  onOpenFileDiff,
  open,
  toHash
}: CompareOverlayProps): ReactElement | null {
  if (!open) {
    return null;
  }

  return (
    <section
      aria-label="Compare Commits"
      className="fixed inset-0 z-[999] flex flex-col bg-[var(--vscode-editor-background)]"
      role="region"
    >
      <header className="flex items-center justify-between border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-panel-background)] px-4 py-3">
        <h3 className="m-0 text-sm">Compare Commits</h3>
        <button
          aria-label="Close compare"
          className="flex h-6 w-6 items-center justify-center rounded bg-transparent text-lg text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={onClose}
          type="button"
        >
          x
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex gap-4 border-b border-[var(--vscode-panel-border)] pb-4">
          <CompareCommitSummary hash={fromHash} label="From" note="Base commit" />
          <div className="flex min-w-[30px] items-center justify-center text-lg text-[var(--vscode-descriptionForeground)]">
            to
          </div>
          <CompareCommitSummary hash={toHash} label="To" note="Target commit" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-sm">Changed Files ({files.length})</h3>
          </div>
          <div className="rounded border border-[var(--vscode-panel-border)]">
            {files.length > 0 ? (
              files.map((file) => (
                <button
                  aria-label={`Open diff for ${file.path}`}
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
                No files changed
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
  label: "From" | "To";
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
