import { simpleGit } from "simple-git";
import type { GraphLayoutViewModel, GraphNodeViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";

const fieldSeparator = "\x1f";
const recordSeparator = "\x1e";
const prettyFormat = `%H%x1f%P%x1e`;
const columnSpacing = 16;
const rowHeight = 36;
const nodeOffsetX = 16;
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
  const activeColumns: Array<string | undefined> = [];
  const nodeByHash = new Map<string, GraphNodeViewModel>();
  const colorByHash = new Map<string, string>();
  let nextColorIndex = 0;

  const nextColor = () => {
    const color = graphColors[nextColorIndex % graphColors.length]!;
    nextColorIndex += 1;
    return color;
  };

  const nodes: GraphNodeViewModel[] = [];

  for (let row = 0; row < commits.length; row += 1) {
    const commit = commits[row]!;
    const existingColumn = activeColumns.indexOf(commit.hash);
    const column = existingColumn >= 0 ? existingColumn : findAvailableColumn(activeColumns, 0);
    const color = colorByHash.get(commit.hash) ?? nextColor();

    colorByHash.set(commit.hash, color);
    activeColumns[column] = commit.hash;

    const node = {
      color,
      column,
      hash: commit.hash,
      row
    };
    nodes.push(node);
    nodeByHash.set(commit.hash, node);

    updateActiveColumns(activeColumns, colorByHash, commit, column, displayedHashes, color, nextColor);
  }

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
            points: edgePoints(fromNode.column, fromNode.row, toNode.column, toNode.row),
            toHash: parentHash
          };
        });
    }),
    nodes
  };
}

function updateActiveColumns(
  activeColumns: Array<string | undefined>,
  colorByHash: Map<string, string>,
  commit: ParsedGraphCommit,
  column: number,
  displayedHashes: Set<string>,
  color: string,
  nextColor: () => string
): void {
  const visibleParents = commit.parents.filter((parentHash) => displayedHashes.has(parentHash));
  if (visibleParents.length === 0) {
    activeColumns[column] = undefined;
    return;
  }

  const firstParent = visibleParents[0]!;
  const firstParentColumn = activeColumns.indexOf(firstParent);
  if (firstParentColumn >= 0 && firstParentColumn !== column) {
    activeColumns[column] = undefined;
  } else {
    activeColumns[column] = firstParent;
    colorByHash.set(firstParent, colorByHash.get(firstParent) ?? color);
  }

  for (const parentHash of visibleParents.slice(1)) {
    const existingColumn = activeColumns.indexOf(parentHash);
    if (existingColumn >= 0) {
      continue;
    }

    const parentColumn = findAvailableColumn(activeColumns, column + 1);
    activeColumns[parentColumn] = parentHash;
    colorByHash.set(parentHash, colorByHash.get(parentHash) ?? nextColor());
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

function edgePoints(fromColumn: number, fromRow: number, toColumn: number, toRow: number) {
  const from = graphPoint(fromColumn, fromRow);
  const to = graphPoint(toColumn, toRow);
  if (fromColumn === toColumn) {
    return [from, to];
  }

  return [from, { x: to.x, y: from.y }, to];
}

function graphPoint(column: number, row: number) {
  return {
    x: column * columnSpacing + nodeOffsetX,
    y: row * rowHeight + nodeOffsetY
  };
}
