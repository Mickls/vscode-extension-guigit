import type { KeyboardEvent, ReactElement } from "react";
import { useState } from "react";
import type { GraphLayoutViewModel } from "../../app/rpcContract.generated";

export interface GitGraphProps {
  graph?: GraphLayoutViewModel;
  onNodeSelect?: (hash: string) => void;
  rowCount?: number;
}

const rowHeight = 36;
const minimumHeight = 36;

export function GitGraph({ graph, onNodeSelect, rowCount = 0 }: GitGraphProps): ReactElement {
  const [hoveredHash, setHoveredHash] = useState<string | undefined>();
  const height = Math.max(rowCount * rowHeight, minimumHeight);

  const handleNodeKeyDown = (event: KeyboardEvent<SVGGElement>, hash: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNodeSelect?.(hash);
    }
  };

  return (
    <svg aria-label="Git graph" className="block w-full" height={height} role="img" viewBox={`0 0 120 ${height}`}>
      {graph?.edges.map((edge) => (
        <polyline
          fill="none"
          key={`${edge.fromHash}-${edge.toHash}`}
          points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke={edge.color}
          strokeWidth="2"
        />
      ))}
      {graph?.nodes.map((node) => (
        <g
          aria-label={`Select commit ${node.hash} in graph`}
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
