import { useMemo, useState, type ReactElement } from "react";
import type { FileChangeViewModel, FileViewMode } from "../../app/rpcContract.generated";

export interface FileChangesProps {
  files: readonly FileChangeViewModel[];
  mode: FileViewMode;
  onModeChange?: (mode: FileViewMode) => void;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
}

interface TreeNode {
  children: Map<string, TreeNode>;
  file?: FileChangeViewModel;
}

export function FileChanges({
  files,
  mode,
  onModeChange,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: FileChangesProps): ReactElement {
  return (
    <section aria-label="Files Changed" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">Files Changed ({files.length})</h3>
        <div className="flex overflow-hidden rounded-[3px] border border-[var(--vscode-button-border)]">
          <FileViewModeButton active={mode === "tree"} label="Tree" mode="tree" onModeChange={onModeChange} />
          <FileViewModeButton active={mode === "list"} label="List" mode="list" onModeChange={onModeChange} />
        </div>
      </div>
      <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
        {mode === "tree" ? (
          <TreeFileChanges
            files={files}
            onOpenFile={onOpenFile}
            onOpenFileDiff={onOpenFileDiff}
            onOpenFileHistory={onOpenFileHistory}
          />
        ) : (
          <ListFileChanges
            files={files}
            onOpenFile={onOpenFile}
            onOpenFileDiff={onOpenFileDiff}
            onOpenFileHistory={onOpenFileHistory}
          />
        )}
      </div>
    </section>
  );
}

function FileViewModeButton({
  active,
  label,
  mode,
  onModeChange
}: {
  active: boolean;
  label: string;
  mode: FileViewMode;
  onModeChange?: (mode: FileViewMode) => void;
}): ReactElement {
  return (
    <button
      aria-label={`${label} view`}
      aria-pressed={active}
      className={`px-2 py-1 text-[11px] ${active ? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]" : "bg-transparent text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"}`}
      onClick={() => onModeChange?.(mode)}
      type="button"
    >
      {label}
    </button>
  );
}

function ListFileChanges({
  files,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: Omit<FileChangesProps, "mode">): ReactElement {
  return (
    <>
      {files.map((file) => (
        <FileRow
          file={file}
          key={file.path}
          label={file.path}
          onOpenFile={onOpenFile}
          onOpenFileDiff={onOpenFileDiff}
          onOpenFileHistory={onOpenFileHistory}
        />
      ))}
    </>
  );
}

function TreeFileChanges({
  files,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: Omit<FileChangesProps, "mode">): ReactElement {
  const root = useMemo(() => buildTree(files), [files]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(new Set());
  const toggleDirectory = (path: string) => {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  return (
    <>
      {renderTree({
        collapsedDirectories,
        depth: 0,
        node: root,
        onOpenFile,
        onOpenFileDiff,
        onOpenFileHistory,
        parentPath: "",
        toggleDirectory
      })}
    </>
  );
}

function renderTree(input: {
  collapsedDirectories: ReadonlySet<string>;
  depth: number;
  node: TreeNode;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
  parentPath: string;
  toggleDirectory(path: string): void;
}): readonly ReactElement[] {
  return [...input.node.children.entries()].flatMap(([name, child]) => {
    if (child.file) {
      return [
        <FileRow
          depth={input.depth}
          file={child.file}
          key={child.file.path}
          label={name}
          onOpenFile={input.onOpenFile}
          onOpenFileDiff={input.onOpenFileDiff}
          onOpenFileHistory={input.onOpenFileHistory}
        />
      ];
    }

    const directoryPath = input.parentPath ? `${input.parentPath}/${name}` : name;
    const collapsed = input.collapsedDirectories.has(directoryPath);
    return [
      <button
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${directoryPath}`}
        className="flex w-full items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-[11px] text-[var(--vscode-descriptionForeground)] last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
        key={`directory-${input.depth}-${directoryPath}`}
        onClick={() => input.toggleDirectory(directoryPath)}
        style={{ paddingLeft: `${8 + input.depth * 14}px` }}
        type="button"
      >
        <span className="w-3 text-center">{collapsed ? "+" : "-"}</span>
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[10px]">{countFiles(child)}</span>
      </button>,
      ...(collapsed
        ? []
        : renderTree({
            ...input,
            depth: input.depth + 1,
            node: child,
            parentPath: directoryPath
          }))
    ];
  });
}

function FileRow({
  depth = 0,
  file,
  label,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: {
  depth?: number;
  file: FileChangeViewModel;
  label: string;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
}): ReactElement {
  return (
    <div
      className="grid w-full grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <span className="rounded-[2px] bg-[var(--vscode-badge-background)] px-1 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
        {file.binary ? "binary" : file.status}
      </span>
      <button
        aria-label={`Open diff for ${file.path}`}
        className="min-w-0 truncate bg-transparent text-left hover:underline"
        onClick={() => onOpenFileDiff?.(file.path)}
        type="button"
      >
        {label}
      </button>
      <span className="shrink-0 text-[11px]">
        <span className="text-[#28a745]">+{file.insertions}</span>{" "}
        <span className="text-[#dc3545]">-{file.deletions}</span>
      </span>
      <FileActionButton label={`Open file ${file.path}`} onClick={() => onOpenFile?.(file.path)} text="O" />
      <FileActionButton label={`Open file history for ${file.path}`} onClick={() => onOpenFileHistory?.(file.path)} text="H" />
    </div>
  );
}

function FileActionButton({
  label,
  onClick,
  text
}: {
  label: string;
  onClick: () => void;
  text: string;
}): ReactElement {
  return (
    <button
      aria-label={label}
      className="flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-transparent text-[10px] text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
      onClick={onClick}
      title={label}
      type="button"
    >
      {text}
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

function countFiles(node: TreeNode): number {
  let count = node.file ? 1 : 0;
  for (const child of node.children.values()) {
    count += countFiles(child);
  }

  return count;
}
