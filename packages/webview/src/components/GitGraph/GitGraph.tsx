import type { ReactElement } from "react";
import type { GraphLayoutViewModel } from "../../app/rpcContract.generated";

export interface GitGraphProps {
  graph?: GraphLayoutViewModel;
}

export function GitGraph({ graph }: GitGraphProps): ReactElement {
  return (
    <svg aria-label="Git graph" className="block h-full w-full" role="img">
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
        <circle cx={node.column * 16 + 16} cy={node.row * 36 + 18} fill={node.color} key={node.hash} r="4" />
      ))}
    </svg>
  );
}
