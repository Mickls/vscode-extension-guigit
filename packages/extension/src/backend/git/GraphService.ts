import { simpleGit } from "simple-git";
import type { GraphLayoutViewModel, GraphNodeViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";

const fieldSeparator = "\x1f";
const recordSeparator = "\x1e";
const prettyFormat = `%H%x1f%P%x1e`;
const graphLeft = 8;
const graphRight = 108;
const rowHeight = 36;
const nodeOffsetY = 18;
const graphColors = ["#f56565", "#4299e1", "#48bb78", "#9f7aea", "#ffc107", "#dc3545", "#28a745", "#6f42c1"];

export interface GraphServiceInput {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug">;
}

interface ParsedGraphCommit {
  hash: string;
  parents: readonly string[];
}

export class GraphService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug"> | undefined;

  public constructor(input: GraphServiceInput = {}) {
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
  }

  public async getLayout(repositoryRoot: string, hashes: readonly string[]): Promise<GraphLayoutViewModel> {
    if (hashes.length === 0) {
      return {
        edges: [],
        nodes: []
      };
    }

    const args = ["show", "--no-patch", `--pretty=format:${prettyFormat}`, ...hashes];
    this.logger?.debug("git.graph.load", {
      commitCount: hashes.length,
      repositoryRoot
    });

    const parsedCommits = parseGraphCommits(await this.gitRaw(repositoryRoot, args));
    const parsedCommitByHash = new Map(parsedCommits.map((commit) => [commit.hash, commit]));
    const commits = hashes.flatMap((hash) => {
      const commit = parsedCommitByHash.get(hash);
      return commit ? [commit] : [];
    });
    const graph = computeGraphLayout(commits);
    this.logger?.debug("git.graph.loaded", {
      edgeCount: graph.edges.length,
      nodeCount: graph.nodes.length,
      repositoryRoot
    });

    return graph;
  }
}

function parseGraphCommits(output: string): readonly ParsedGraphCommit[] {
  return output
    .split(recordSeparator)
    .filter(Boolean)
    .map((record) => {
      const [hash, parents = ""] = record.trim().split(fieldSeparator);

      return {
        hash: hash!,
        parents: parents.split(" ").filter(Boolean)
      };
    });
}

function computeGraphLayout(commits: readonly ParsedGraphCommit[]): GraphLayoutViewModel {
  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const mainline = identifyMainline(commits, commitByHash);
  const preferredChildByParent = identifyPreferredParentChildren(commits);
  const activeColumns: Array<string | undefined> = [];
  const positionedNodes: Array<Omit<GraphNodeViewModel, "x" | "y">> = [];
  const columnByHash = new Map<string, number>();
  const colorByHash = new Map<string, string>();
  let nextColorIndex = 1;

  const nextColor = () => {
    const color = graphColors[nextColorIndex % graphColors.length]!;
    nextColorIndex += 1;
    return color;
  };

  for (let row = 0; row < commits.length; row += 1) {
    const commit = commits[row]!;
    const mainlineCommit = mainline.has(commit.hash);
    const existingColumn = activeColumns.indexOf(commit.hash);
    const column = mainlineCommit ? 0 : existingColumn >= 0 ? existingColumn : findAvailableColumn(activeColumns, 1);
    const color = mainlineCommit ? graphColors[0]! : colorByHash.get(commit.hash) ?? nextColor();

    removeHashFromOtherColumns(activeColumns, commit.hash, column);
    colorByHash.set(commit.hash, color);
    columnByHash.set(commit.hash, column);
    activeColumns[column] = commit.hash;

    positionedNodes.push({
      color,
      column,
      hash: commit.hash,
      row
    });

    updateActiveColumns(
      activeColumns,
      columnByHash,
      colorByHash,
      commit,
      column,
      mainline,
      preferredChildByParent,
      color,
      nextColor
    );
  }

  const maxColumn = Math.max(0, ...positionedNodes.map((node) => node.column), ...columnByHash.values());
  const columnSpacing = maxColumn === 0 ? 0 : Math.min(12, (graphRight - graphLeft) / maxColumn);
  const nodes = positionedNodes.map((node) => ({
    ...node,
    x: graphPoint(node.column, node.row, columnSpacing).x,
    y: graphPoint(node.column, node.row, columnSpacing).y
  }));
  const nodeByHash = new Map(nodes.map((node) => [node.hash, node]));

  return {
    edges: commits.flatMap((commit) => {
      const fromNode = nodeByHash.get(commit.hash)!;

      return commit.parents.flatMap((parentHash, parentIndex) => {
        const toNode = nodeByHash.get(parentHash);
        const parentColumn = columnByHash.get(parentHash);
        if (toNode === undefined && parentColumn === undefined) {
          return [];
        }

        const toPoint =
          toNode ?? ({
            x: graphX(parentColumn!, columnSpacing),
            y: commits.length * rowHeight
          } satisfies Pick<GraphNodeViewModel, "x" | "y">);

        return [
          {
            color: parentIndex === 0 ? fromNode.color : (toNode?.color ?? colorByHash.get(parentHash)!),
            fromHash: commit.hash,
            points: edgePoints(fromNode, toPoint, parentIndex),
            toHash: parentHash
          }
        ];
      });
    }),
    nodes
  };
}

function identifyMainline(
  commits: readonly ParsedGraphCommit[],
  commitByHash: Map<string, ParsedGraphCommit>
): ReadonlySet<string> {
  const mainline = new Set<string>();
  let current = commits[0];

  while (current) {
    mainline.add(current.hash);
    const firstParent = current.parents[0];
    current = firstParent ? commitByHash.get(firstParent) : undefined;
  }

  return mainline;
}

function identifyPreferredParentChildren(commits: readonly ParsedGraphCommit[]): ReadonlyMap<string, string> {
  const rowByHash = new Map(commits.map((commit, row) => [commit.hash, row]));
  const preferredByParent = new Map<string, { childHash: string; childRow: number }>();

  for (let row = 0; row < commits.length; row += 1) {
    const commit = commits[row]!;
    const firstParent = commit.parents[0];
    const parentRow = firstParent ? rowByHash.get(firstParent) : undefined;
    if (firstParent === undefined || parentRow === undefined || parentRow <= row) {
      continue;
    }

    const current = preferredByParent.get(firstParent);
    if (current === undefined || row > current.childRow) {
      preferredByParent.set(firstParent, {
        childHash: commit.hash,
        childRow: row
      });
    }
  }

  return new Map(
    [...preferredByParent.entries()].map(([parentHash, preferred]) => [parentHash, preferred.childHash])
  );
}

function updateActiveColumns(
  activeColumns: Array<string | undefined>,
  columnByHash: Map<string, number>,
  colorByHash: Map<string, string>,
  commit: ParsedGraphCommit,
  column: number,
  mainline: ReadonlySet<string>,
  preferredChildByParent: ReadonlyMap<string, string>,
  color: string,
  nextColor: () => string
): void {
  if (commit.parents.length === 0) {
    activeColumns[column] = undefined;
    return;
  }

  const firstParent = commit.parents[0]!;
  const preferredChild = preferredChildByParent.get(firstParent);
  const currentCommitOwnsFirstParentLane =
    mainline.has(firstParent) || preferredChild === undefined || preferredChild === commit.hash;
  if (currentCommitOwnsFirstParentLane) {
    const firstParentColumn = mainline.has(firstParent) ? 0 : activeColumns.indexOf(firstParent);
    if (firstParentColumn >= 0 && firstParentColumn !== column && !mainline.has(firstParent)) {
      activeColumns[column] = undefined;
    } else {
      const parentColumn = firstParentColumn >= 0 ? firstParentColumn : column;
      activeColumns[parentColumn] = firstParent;
      columnByHash.set(firstParent, parentColumn);
      colorByHash.set(firstParent, mainline.has(firstParent) ? graphColors[0]! : colorByHash.get(firstParent) ?? color);
    }
  } else {
    activeColumns[column] = undefined;
  }

  for (const parentHash of commit.parents.slice(1)) {
    const existingColumn = activeColumns.indexOf(parentHash);
    if (existingColumn >= 0) {
      columnByHash.set(parentHash, existingColumn);
      continue;
    }

    const parentColumn = mainline.has(parentHash) ? 0 : findAvailableColumn(activeColumns, 1);
    activeColumns[parentColumn] = parentHash;
    columnByHash.set(parentHash, parentColumn);
    colorByHash.set(parentHash, mainline.has(parentHash) ? graphColors[0]! : colorByHash.get(parentHash) ?? nextColor());
  }
}

function removeHashFromOtherColumns(columns: Array<string | undefined>, hash: string, currentColumn: number): void {
  for (let index = 0; index < columns.length; index += 1) {
    if (index !== currentColumn && columns[index] === hash) {
      columns[index] = undefined;
    }
  }
}

function findAvailableColumn(columns: readonly (string | undefined)[], startFrom: number): number {
  for (let index = startFrom; index < columns.length; index += 1) {
    if (columns[index] === undefined) {
      return index;
    }
  }

  return columns.length;
}

function edgePoints(from: Pick<GraphNodeViewModel, "x" | "y">, to: Pick<GraphNodeViewModel, "x" | "y">, parentIndex: number) {
  const fromPoint = { x: from.x, y: from.y };
  const toPoint = { x: to.x, y: to.y };
  if (from.x === to.x) {
    return [fromPoint, toPoint];
  }

  return parentIndex === 0
    ? [fromPoint, { x: from.x, y: to.y }, toPoint]
    : [fromPoint, { x: to.x, y: from.y }, toPoint];
}

function graphPoint(column: number, row: number, columnSpacing: number) {
  return {
    x: graphX(column, columnSpacing),
    y: row * rowHeight + nodeOffsetY
  };
}

function graphX(column: number, columnSpacing: number): number {
  return column * columnSpacing + graphLeft;
}
