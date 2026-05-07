/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitGraph } from "./GitGraph";
import type { GraphLayoutViewModel } from "../../app/rpcContract.generated";

const graph = {
  edges: [
    {
      color: "#f56565",
      fromHash: "first",
      points: [
        { x: 16, y: 18 },
        { x: 44, y: 18 },
        { x: 16, y: 54 }
      ],
      toHash: "second"
    }
  ],
  nodes: [
    {
      color: "#f56565",
      column: 0,
      hash: "first",
      row: 0,
      x: 20,
      y: 22
    },
    {
      color: "#f56565",
      column: 8,
      hash: "second",
      row: 1,
      x: 72,
      y: 58
    }
  ],
  width: 160
} satisfies GraphLayoutViewModel;

describe("GitGraph", () => {
  afterEach(() => {
    cleanup();
  });

  it("draws backend nodes and edges without calculating layout in the component", () => {
    render(<GitGraph graph={graph} rowCount={2} />);

    const svg = screen.getByRole("img", { name: "Git graph" });
    expect(svg).toHaveAttribute("width", "160");
    expect(svg).toHaveAttribute("viewBox", "0 0 160 72");
    expect(svg.querySelector("polyline")).not.toBeInTheDocument();
    expect(svg.querySelector("path")).toHaveAttribute("d", "M 16 18 L 36 18 Q 44 18 39.088 24.315 L 16 54");
    expect(svg.querySelector('[data-hash="second"] circle')).toHaveAttribute("cx", "72");
    expect(svg.querySelector('[data-hash="second"] circle')).toHaveAttribute("cy", "58");
  });

  it("highlights hovered nodes and reports node clicks", async () => {
    const user = userEvent.setup();
    const onNodeSelect = vi.fn();

    render(<GitGraph graph={graph} onNodeSelect={onNodeSelect} rowCount={2} />);

    const secondNode = screen.getByRole("button", { name: "Select commit second in graph" });
    await user.hover(secondNode);
    expect(secondNode).toHaveAttribute("data-hovered", "true");

    await user.click(secondNode);
    expect(onNodeSelect).toHaveBeenCalledWith("second");
  });
});
