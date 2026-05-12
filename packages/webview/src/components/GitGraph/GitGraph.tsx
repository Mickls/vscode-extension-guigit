import type { KeyboardEvent, ReactElement } from "react";
import { useState } from "react";
import type { GraphLayoutViewModel, GraphPointViewModel } from "../../app/rpcContract.generated";

export interface GitGraphLabels {
  label: string;
  selectCommit: string;
}

const defaultLabels: GitGraphLabels = {
  label: "Git graph",
  selectCommit: "Select commit {0} in graph"
};

export interface GitGraphProps {
  graph?: GraphLayoutViewModel;
  labels?: Partial<GitGraphLabels>;
  onNodeSelect?: (hash: string) => void;
  rowCount?: number;
}

const rowHeight = 36;
const minimumHeight = 36;
const defaultWidth = 120;
const curveRadius = 12;

export function GitGraph({ graph, labels, onNodeSelect, rowCount = 0 }: GitGraphProps): ReactElement {
  const [hoveredHash, setHoveredHash] = useState<string | undefined>();
  const height = Math.max(rowCount * rowHeight, minimumHeight);
  const width = graph?.width ?? defaultWidth;
  const text = { ...defaultLabels, ...labels };

  const handleNodeKeyDown = (event: KeyboardEvent<SVGGElement>, hash: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNodeSelect?.(hash);
    }
  };

  return (
    <svg aria-label={text.label} className="block" height={height} role="img" viewBox={`0 0 ${width} ${height}`} width={width}>
      {graph?.edges.map((edge) => (
        <path
          d={toRoundedPath(edge.points)}
          fill="none"
          key={`${edge.fromHash}-${edge.toHash}`}
          strokeLinecap="round"
          strokeLinejoin="round"
          stroke={edge.color}
          strokeWidth="2"
        />
      ))}
      {graph?.nodes.map((node) => (
        <g
          aria-label={formatLabel(text.selectCommit, node.hash)}
          data-hash={node.hash}
          data-hovered={hoveredHash === node.hash}
          key={node.hash}
          onClick={() => onNodeSelect?.(node.hash)}
          onKeyDown={(event) => handleNodeKeyDown(event, node.hash)}
          onMouseEnter={() => setHoveredHash(node.hash)}
          onMouseLeave={() => setHoveredHash(undefined)}
          role="button"
          tabIndex={0}
        >
          <circle
            cx={node.x}
            cy={node.y}
            fill={node.color}
            r={hoveredHash === node.hash ? "6" : "4"}
            stroke="var(--vscode-editor-background)"
            strokeWidth="1"
          />
        </g>
      ))}
    </svg>
  );
}

function toRoundedPath(points: readonly GraphPointViewModel[]): string {
  const commands = [`M ${formatPoint(points[0]!)}`];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const nextPoint = points[index + 1];
    if (nextPoint === undefined) {
      commands.push(`L ${formatPoint(point)}`);
      continue;
    }

    const previousPoint = points[index - 1]!;
    const beforeCurve = pointAlongSegment(point, previousPoint, curveRadius);
    const afterCurve = pointAlongSegment(point, nextPoint, curveRadius);
    commands.push(`L ${formatPoint(beforeCurve)}`);
    commands.push(`Q ${formatPoint(point)} ${formatPoint(afterCurve)}`);
  }

  return commands.join(" ");
}

function pointAlongSegment(
  from: GraphPointViewModel,
  to: GraphPointViewModel,
  distance: number
): GraphPointViewModel {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const clampedDistance = Math.min(distance, length / 2);

  return {
    x: from.x + (dx / length) * clampedDistance,
    y: from.y + (dy / length) * clampedDistance
  };
}

function formatPoint(point: GraphPointViewModel): string {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function formatLabel(label: string, value: string): string {
  return label.replace("{0}", value);
}
