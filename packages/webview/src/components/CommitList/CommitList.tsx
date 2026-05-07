import type { UIEvent, MouseEvent, ReactElement } from "react";
import type { CommitListItemViewModel, GraphLayoutViewModel } from "../../app/rpcContract.generated";
import { GitGraph } from "../GitGraph/GitGraph";

const emptyGraph: GraphLayoutViewModel = {
  edges: [],
  nodes: [],
  width: 120
};

const minimumGraphViewportWidth = 120;
const maximumGraphViewportWidth = 240;

export interface CommitListProps {
  commits?: readonly CommitListItemViewModel[];
  graph?: GraphLayoutViewModel;
  graphVisible?: boolean;
  onGraphNodeSelect?: (hash: string) => void;
  onLoadMore?: () => void;
  onCommitSelect?: (commit: CommitListItemViewModel) => void;
  onCommitContextMenu?: (event: MouseEvent<HTMLElement>, commit: CommitListItemViewModel) => void;
  selectedHash?: string;
}

export function CommitList({
  commits = [],
  graph = emptyGraph,
  graphVisible = true,
  onGraphNodeSelect,
  onLoadMore,
  onCommitContextMenu,
  onCommitSelect,
  selectedHash
}: CommitListProps): ReactElement {
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 24) {
      onLoadMore?.();
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 overflow-y-auto"
      data-testid="commit-scroll-container"
      onScroll={handleScroll}
    >
      {graphVisible ? (
        <div
          className="max-w-[240px] shrink-0 overflow-x-auto border-r border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]"
          data-testid="graph-strip"
          style={{
            height: `${Math.max(commits.length, 1) * 36}px`,
            width: `${Math.min(Math.max(graph.width, minimumGraphViewportWidth), maximumGraphViewportWidth)}px`
          }}
        >
          <GitGraph graph={graph} onNodeSelect={onGraphNodeSelect} rowCount={commits.length} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {commits.map((commit, index) => (
          <article
            className="flex h-9 cursor-pointer select-none border-b border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]"
            data-testid="commit-row"
            key={commit.hash}
            onContextMenu={(event) => onCommitContextMenu?.(event, commit)}
            onClick={() => onCommitSelect?.(commit)}
          >
            <div
              className={`grid h-full min-w-[550px] flex-1 grid-cols-[80px_minmax(180px,1fr)_minmax(96px,180px)_120px_100px] items-center gap-3 px-3 ${selectedHash === commit.hash || (!selectedHash && index === 0) ? "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]" : "bg-[var(--vscode-editor-background)]"}`}
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
