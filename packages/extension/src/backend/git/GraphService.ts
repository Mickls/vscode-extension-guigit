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

    const commits = parseGraphCommits(await this.gitRaw(repositoryRoot, args));
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
  const displayedHashes = new Set(commits.map((commit) => commit.hash));
  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const mainline = identifyMainline(commits, commitByHash);
  const activeColumns: Array<string | undefined> = [];
  const positionedNodes: Array<Omit<GraphNodeViewModel, "x" | "y">> = [];
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
    const color = colorByHash.get(commit.hash) ?? (mainlineCommit ? graphColors[0]! : nextColor());

    removeHashFromOtherColumns(activeColumns, commit.hash, column);
    colorByHash.set(commit.hash, color);
    activeColumns[column] = commit.hash;

    positionedNodes.push({
      color,
      column,
      hash: commit.hash,
      row
    });

    updateActiveColumns(activeColumns, colorByHash, commit, column, displayedHashes, mainline, color, nextColor);
  }

  const maxColumn = Math.max(0, ...positionedNodes.map((node) => node.column));
  const columnSpacing = maxColumn === 0 ? 0 : Math.max(5, Math.min(12, Math.floor((graphRight - graphLeft) / maxColumn)));
  const nodes = positionedNodes.map((node) => ({
    ...node,
    x: graphPoint(node.column, node.row, columnSpacing).x,
    y: graphPoint(node.column, node.row, columnSpacing).y
  }));
  const nodeByHash = new Map(nodes.map((node) => [node.hash, node]));

  return {
    edges: commits.flatMap((commit) => {
      const fromNode = nodeByHash.get(commit.hash)!;

      return commit.parents
        .filter((parentHash) => displayedHashes.has(parentHash))
        .map((parentHash) => {
          const toNode = nodeByHash.get(parentHash)!;

          return {
            color: fromNode.color,
            fromHash: commit.hash,
            points: edgePoints(fromNode, toNode),
            toHash: parentHash
          };
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

function updateActiveColumns(
  activeColumns: Array<string | undefined>,
  colorByHash: Map<string, string>,
  commit: ParsedGraphCommit,
  column: number,
  displayedHashes: Set<string>,
  mainline: ReadonlySet<string>,
  color: string,
  nextColor: () => string
): void {
  const visibleParents = commit.parents.filter((parentHash) => displayedHashes.has(parentHash));
  if (visibleParents.length === 0) {
    activeColumns[column] = undefined;
    return;
  }

  const firstParent = visibleParents[0]!;
  const firstParentColumn = mainline.has(firstParent) ? 0 : activeColumns.indexOf(firstParent);
  if (firstParentColumn >= 0 && firstParentColumn !== column && !mainline.has(firstParent)) {
    activeColumns[column] = undefined;
  } else {
    activeColumns[firstParentColumn >= 0 ? firstParentColumn : column] = firstParent;
    colorByHash.set(firstParent, colorByHash.get(firstParent) ?? color);
  }

  for (const parentHash of visibleParents.slice(1)) {
    const existingColumn = activeColumns.indexOf(parentHash);
    if (existingColumn >= 0) {
      continue;
    }

    const parentColumn = mainline.has(parentHash) ? 0 : findAvailableColumn(activeColumns, 1);
    activeColumns[parentColumn] = parentHash;
    colorByHash.set(parentHash, colorByHash.get(parentHash) ?? nextColor());
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

function edgePoints(from: GraphNodeViewModel, to: GraphNodeViewModel) {
  const fromPoint = { x: from.x, y: from.y };
  const toPoint = { x: to.x, y: to.y };
  if (from.x === to.x) {
    return [fromPoint, toPoint];
  }

  const midY = Math.floor((from.y + to.y) / 2);
  return [fromPoint, { x: from.x, y: midY }, { x: to.x, y: midY }, toPoint];
}

function graphPoint(column: number, row: number, columnSpacing: number) {
  return {
    x: column * columnSpacing + graphLeft,
    y: row * rowHeight + nodeOffsetY
  };
}
