/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SplitPanels } from "./SplitPanels";

describe("SplitPanels", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders expanded left and right panels with the resizer", () => {
    render(<SplitPanels left={<div>left content</div>} right={<div>right content</div>} />);

    expect(screen.getByTestId("split-panels")).toHaveAttribute("data-left-collapsed", "false");
    expect(screen.getByTestId("split-panels")).toHaveAttribute("data-right-collapsed", "false");
    expect(screen.getByLabelText("Commit list panel")).toHaveStyle({ width: "80%" });
    expect(screen.getByLabelText("Commit details panel")).toHaveStyle({ width: "20%" });
    expect(screen.getByLabelText("Resize panels")).toBeInTheDocument();
    expect(screen.getByText("left content")).toBeInTheDocument();
    expect(screen.getByText("right content")).toBeInTheDocument();
  });

  it("supports collapsed initial states without rendering hidden panel content", () => {
    const { unmount } = render(
      <SplitPanels
        initialLeftCollapsed
        left={<div>hidden left content</div>}
        right={<div>visible right content</div>}
      />
    );
    expect(screen.getByTestId("split-panels")).toHaveAttribute("data-left-collapsed", "true");
    expect(screen.queryByText("hidden left content")).not.toBeInTheDocument();
    expect(screen.getByText("visible right content")).toBeInTheDocument();

    unmount();

    render(
      <SplitPanels
        initialRightCollapsed
        left={<div>visible left content</div>}
        right={<div>hidden right content</div>}
      />
    );

    expect(screen.getByTestId("split-panels")).toHaveAttribute("data-right-collapsed", "true");
    expect(screen.queryByText("hidden right content")).not.toBeInTheDocument();
    expect(screen.getByText("visible left content")).toBeInTheDocument();
  });

  it("toggles collapsed panels and keeps at least one side expanded", async () => {
    const user = userEvent.setup();

    render(<SplitPanels left={<div>left content</div>} right={<div>right content</div>} />);

    await user.click(screen.getByLabelText("Collapse commit list panel"));
    expect(screen.getByTestId("split-panels")).toHaveAttribute("data-left-collapsed", "true");
    expect(screen.queryByText("left content")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Collapse commit details panel"));
    expect(screen.getByTestId("split-panels")).toHaveAttribute("data-left-collapsed", "false");
    expect(screen.getByTestId("split-panels")).toHaveAttribute("data-right-collapsed", "true");
    expect(screen.getByText("left content")).toBeInTheDocument();
    expect(screen.queryByText("right content")).not.toBeInTheDocument();
  });

  it("resizes expanded panels with the separator and resets on double click", () => {
    render(<SplitPanels left={<div>left content</div>} right={<div>right content</div>} />);

    vi.spyOn(screen.getByTestId("split-panels"), "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 100,
      right: 1100,
      toJSON: () => undefined,
      top: 100,
      width: 1000,
      x: 100,
      y: 100
    });

    fireEvent.mouseDown(screen.getByLabelText("Resize panels"), { clientX: 900 });
    fireEvent.mouseMove(document, { clientX: 500 });
    fireEvent.mouseUp(document);

    expect(screen.getByLabelText("Commit list panel")).toHaveStyle({ width: "40%" });
    expect(screen.getByLabelText("Commit details panel")).toHaveStyle({ width: "60%" });

    fireEvent.doubleClick(screen.getByLabelText("Resize panels"));

    expect(screen.getByLabelText("Commit list panel")).toHaveStyle({ width: "80%" });
    expect(screen.getByLabelText("Commit details panel")).toHaveStyle({ width: "20%" });
  });
});
