import type { MouseEvent, ReactElement } from "react";
import type { CommitListItemViewModel, GraphLayoutViewModel } from "../../app/rpcContract.generated";
import { GitGraph } from "../GitGraph/GitGraph";

const sampleCommits: readonly CommitListItemViewModel[] = [
  {
    hash: "8f9d5c2b4a1e0d7c6b5a49382716151413121110",
    shortHash: "8f9d5c2",
    message: "Preserve extension identity",
    author: "Mickls",
    date: "Today",
    refs: [
      { name: "HEAD", type: "head" },
      { name: "main", type: "local" }
    ],
    parents: ["7fd6979"]
  },
  {
    hash: "72ea7564a1e0d7c6b5a49382716151413121110",
    shortHash: "72ea756",
    message: "Add webview shell",
    author: "Codex",
    date: "Yesterday",
    refs: [{ name: "origin/main", type: "remote" }],
    parents: ["ee55e12"]
  }
];

const sampleGraph: GraphLayoutViewModel = {
  nodes: [
    { hash: sampleCommits[0]!.hash, row: 0, column: 0, color: "#f56565" },
    { hash: sampleCommits[1]!.hash, row: 1, column: 0, color: "#4299e1" }
  ],
  edges: [
    {
      fromHash: sampleCommits[0]!.hash,
      toHash: sampleCommits[1]!.hash,
      color: "#9f7aea",
      points: [
        { x: 16, y: 18 },
        { x: 16, y: 54 }
      ]
    }
  ]
};

export interface CommitListProps {
  commits?: readonly CommitListItemViewModel[];
  graph?: GraphLayoutViewModel;
  onCommitContextMenu?: (event: MouseEvent<HTMLElement>, commit: CommitListItemViewModel) => void;
}

export function CommitList({
  commits = sampleCommits,
  graph = sampleGraph,
  onCommitContextMenu
}: CommitListProps): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="w-[120px] shrink-0 border-r border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
        <GitGraph graph={graph} />
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {commits.map((commit, index) => (
          <article
            className="flex min-h-9 cursor-pointer select-none border-b border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]"
            data-testid="commit-row"
            key={commit.hash}
            onContextMenu={(event) => onCommitContextMenu?.(event, commit)}
          >
            <div
              className={`grid min-w-[550px] flex-1 grid-cols-[80px_minmax(180px,1fr)_minmax(96px,180px)_120px_100px] items-center gap-3 px-3 py-2 ${index === 0 ? "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]" : "bg-[var(--vscode-editor-background)]"}`}
            >
              <span className="truncate font-mono text-[11px] text-[var(--vscode-descriptionForeground)]">
                {commit.shortHash}
              </span>
              <span className="truncate text-xs font-medium">{commit.message}</span>
              <span className="flex min-w-0 gap-1 overflow-hidden text-[10px]">
                {commit.refs.map((ref) => (
                  <span
                    className="max-w-[96px] truncate rounded-[3px] px-1 py-0.5 text-[var(--vscode-editor-background)]"
                    data-ref-type={ref.type}
                    key={`${commit.hash}-${ref.name}`}
                    style={{ backgroundColor: refColor(ref.type) }}
                  >
                    {ref.name}
                  </span>
                ))}
              </span>
              <span className="truncate text-[11px] text-[var(--vscode-descriptionForeground)]">
                {commit.author}
              </span>
              <span className="truncate text-[11px] text-[var(--vscode-descriptionForeground)]">
                {commit.date}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function refColor(type: CommitListItemViewModel["refs"][number]["type"]): string {
  const colors = {
    head: "#f56565",
    remote: "#4299e1",
    tag: "#48bb78",
    local: "#9f7aea"
  } as const;

  return colors[type];
}
