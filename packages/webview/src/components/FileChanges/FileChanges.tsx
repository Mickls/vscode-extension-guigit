import { useMemo, useState, type ReactElement } from "react";
import { FileText, History } from "lucide-react";
import type { FileChangeViewModel, FileViewMode } from "../../app/rpcContract.generated";

export interface FileChangesLabels {
  binary: string;
  changed: string;
  collapseDirectory: string;
  expandDirectory: string;
  list: string;
  listView: string;
  openDiff: string;
  openFile: string;
  openFileHistory: string;
  tree: string;
  treeView: string;
}

const defaultLabels: FileChangesLabels = {
  binary: "binary",
  changed: "Files Changed",
  collapseDirectory: "Collapse {0}",
  expandDirectory: "Expand {0}",
  list: "List",
  listView: "List view",
  openDiff: "Open diff for {0}",
  openFile: "Open file {0}",
  openFileHistory: "Open file history for {0}",
  tree: "Tree",
  treeView: "Tree view"
};

export interface FileChangesProps {
  files: readonly FileChangeViewModel[];
  labels?: Partial<FileChangesLabels>;
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
  labels,
  mode,
  onModeChange,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: FileChangesProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  return (
    <section aria-label={text.changed} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">{text.changed} ({files.length})</h3>
        <div className="flex overflow-hidden rounded-[3px] border border-[var(--vscode-button-border)]">
          <FileViewModeButton active={mode === "tree"} ariaLabel={text.treeView} label={text.tree} mode="tree" onModeChange={onModeChange} />
          <FileViewModeButton active={mode === "list"} ariaLabel={text.listView} label={text.list} mode="list" onModeChange={onModeChange} />
        </div>
      </div>
      <div className="rounded-[3px] border border-[var(--vscode-panel-border)]">
        {mode === "tree" ? (
          <TreeFileChanges
            files={files}
            labels={text}
            onOpenFile={onOpenFile}
            onOpenFileDiff={onOpenFileDiff}
            onOpenFileHistory={onOpenFileHistory}
          />
        ) : (
          <ListFileChanges
            files={files}
            labels={text}
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
  ariaLabel,
  label,
  mode,
  onModeChange
}: {
  active: boolean;
  ariaLabel: string;
  label: string;
  mode: FileViewMode;
  onModeChange?: (mode: FileViewMode) => void;
}): ReactElement {
  return (
    <button
      aria-label={ariaLabel}
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
  labels,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: {
  files: readonly FileChangeViewModel[];
  labels: FileChangesLabels;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
}): ReactElement {
  return (
    <>
      {files.map((file) => (
        <FileRow
          file={file}
          key={file.path}
          labels={labels}
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
  labels,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: {
  files: readonly FileChangeViewModel[];
  labels: FileChangesLabels;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
}): ReactElement {
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
        labels,
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
  labels: FileChangesLabels;
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
          labels={input.labels}
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
        aria-label={formatLabel(collapsed ? input.labels.expandDirectory : input.labels.collapseDirectory, directoryPath)}
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
  labels,
  label,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: {
  depth?: number;
  file: FileChangeViewModel;
  labels: FileChangesLabels;
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
      <span className={`rounded-[2px] border px-1 py-0.5 text-[10px] ${statusBadgeClass(file.status)}`}>
        {file.binary ? labels.binary : file.status}
      </span>
      <button
        aria-label={formatLabel(labels.openDiff, file.path)}
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
      <FileActionButton icon="history" label={formatLabel(labels.openFileHistory, file.path)} onClick={() => onOpenFileHistory?.(file.path)} />
      <FileActionButton icon="openFile" label={formatLabel(labels.openFile, file.path)} onClick={() => onOpenFile?.(file.path)} />
    </div>
  );
}

function FileActionButton({
  icon,
  label,
  onClick
}: {
  icon: "history" | "openFile";
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-label={label}
      className="flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-transparent text-[10px] text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
      onClick={onClick}
      title={label}
      type="button"
    >
      <FileActionIcon icon={icon} />
    </button>
  );
}

function FileActionIcon({ icon }: { icon: "history" | "openFile" }): ReactElement {
  if (icon === "history") {
    return <History aria-hidden="true" className="h-3.5 w-3.5" />;
  }

  return <FileText aria-hidden="true" className="h-3.5 w-3.5" />;
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

function statusBadgeClass(status: FileChangeViewModel["status"]): string {
  const classes = {
    added: "file-status--added border-[#2ea043]/60 bg-[#2ea043]/15 text-[#2ea043]",
    copied: "file-status--copied border-[#39c5cf]/60 bg-[#39c5cf]/15 text-[#39c5cf]",
    deleted: "file-status--deleted border-[#f85149]/60 bg-[#f85149]/15 text-[#f85149]",
    modified: "file-status--modified border-[#d29922]/60 bg-[#d29922]/15 text-[#d29922]",
    renamed: "file-status--renamed border-[#a371f7]/60 bg-[#a371f7]/15 text-[#a371f7]",
    unchanged: "file-status--unchanged border-[var(--vscode-descriptionForeground)]/50 bg-[var(--vscode-descriptionForeground)]/10 text-[var(--vscode-descriptionForeground)]"
  } satisfies Record<FileChangeViewModel["status"], string>;

  return classes[status];
}

function formatLabel(label: string, value: string): string {
  return label.replace("{0}", value);
}
