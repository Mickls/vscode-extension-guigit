import type { ReactElement } from "react";
import type { CommitDetailsViewModel, FileViewMode } from "../../app/rpcContract.generated";
import { FileChanges, type FileChangesLabels } from "../FileChanges/FileChanges";

export interface CommitDetailsLabels {
  files?: Partial<FileChangesLabels>;
  selectCommit: string;
}

const defaultLabels: CommitDetailsLabels = {
  selectCommit: "Select a commit to view details."
};

export interface CommitDetailsProps {
  commit?: CommitDetailsViewModel;
  fileViewMode: FileViewMode;
  labels?: Partial<CommitDetailsLabels>;
  onFileViewModeChange?: (mode: FileViewMode) => void;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
}

export function CommitDetails({
  commit,
  fileViewMode,
  labels,
  onFileViewModeChange,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: CommitDetailsProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  if (!commit) {
    return (
      <div className="p-4 text-xs text-[var(--vscode-descriptionForeground)]">
        {text.selectCommit}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 text-xs">
      <section className="space-y-1 border-b border-[var(--vscode-panel-border)] pb-3">
        <div className="font-mono text-[11px] text-[var(--vscode-descriptionForeground)]">
          {commit.hash.slice(0, 7)}
        </div>
        <h2 className="text-sm font-semibold">{commit.message}</h2>
        <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
          {commit.author} - {commit.date}
        </div>
        <p className="max-w-[72ch] text-[11px] leading-5 text-[var(--vscode-descriptionForeground)]">
          {commit.body}
        </p>
      </section>
      <FileChanges
        files={commit.files}
        labels={text.files}
        mode={fileViewMode}
        onModeChange={onFileViewModeChange}
        onOpenFile={onOpenFile}
        onOpenFileDiff={onOpenFileDiff}
        onOpenFileHistory={onOpenFileHistory}
      />
    </div>
  );
}
