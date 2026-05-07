import type { ReactElement } from "react";
import type { FileChangeViewModel, FileViewMode } from "../../app/rpcContract.generated";

export interface FileChangesProps {
  files: readonly FileChangeViewModel[];
  mode: FileViewMode;
  onOpenFileDiff?: (path: string) => void;
}

interface TreeNode {
  children: Map<string, TreeNode>;
  file?: FileChangeViewModel;
}

export function FileChanges({ files, mode, onOpenFileDiff }: FileChangesProps): ReactElement {
  return (
    <section aria-label="Files Changed" className="space-y-2">
      <h3 className="text-xs font-semibold">Files Changed ({files.length})</h3>
      <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
        {mode === "tree" ? (
          <TreeFileChanges files={files} onOpenFileDiff={onOpenFileDiff} />
        ) : (
          <ListFileChanges files={files} onOpenFileDiff={onOpenFileDiff} />
        )}
      </div>
    </section>
  );
}

function ListFileChanges({ files, onOpenFileDiff }: Omit<FileChangesProps, "mode">): ReactElement {
  return (
    <>
      {files.map((file) => (
        <FileButton file={file} key={file.path} label={file.path} onOpenFileDiff={onOpenFileDiff} />
      ))}
    </>
  );
}

function TreeFileChanges({ files, onOpenFileDiff }: Omit<FileChangesProps, "mode">): ReactElement {
  const root = buildTree(files);

  return <>{renderTree(root, 0, onOpenFileDiff)}</>;
}

function renderTree(
  node: TreeNode,
  depth: number,
  onOpenFileDiff: ((path: string) => void) | undefined
): readonly ReactElement[] {
  return [...node.children.entries()].flatMap(([name, child]) => {
    if (child.file) {
      return [
        <FileButton
          depth={depth}
          file={child.file}
          key={child.file.path}
          label={name}
          onOpenFileDiff={onOpenFileDiff}
        />
      ];
    }

    return [
      <div
        className="border-b border-[var(--vscode-panel-border)] px-2 py-1.5 text-[11px] text-[var(--vscode-descriptionForeground)] last:border-b-0"
        key={`directory-${depth}-${name}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {name}
      </div>,
      ...renderTree(child, depth + 1, onOpenFileDiff)
    ];
  });
}

function FileButton({
  depth = 0,
  file,
  label,
  onOpenFileDiff
}: {
  depth?: number;
  file: FileChangeViewModel;
  label: string;
  onOpenFileDiff?: (path: string) => void;
}): ReactElement {
  return (
    <button
      aria-label={`Open diff for ${file.path}`}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
      onClick={() => onOpenFileDiff?.(file.path)}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      type="button"
    >
      <span className="rounded-[2px] bg-[var(--vscode-badge-background)] px-1 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
        {file.binary ? "binary" : file.status}
      </span>
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[11px]">
        <span className="text-[#28a745]">+{file.insertions}</span>{" "}
        <span className="text-[#dc3545]">-{file.deletions}</span>
      </span>
    </button>
  );
}

function buildTree(files: readonly FileChangeViewModel[]): TreeNode {
  const root: TreeNode = { children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    parts.forEach((part, index) => {
      let child = current.children.get(part);
      if (!child) {
        child = { children: new Map() };
        current.children.set(part, child);
      }

      if (index === parts.length - 1) {
        child.file = file;
      }

      current = child;
    });
  }

  return root;
}
