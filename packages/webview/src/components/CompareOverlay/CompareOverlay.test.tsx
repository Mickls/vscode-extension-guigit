/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompareOverlay } from "./CompareOverlay";

describe("CompareOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a full-panel compare view", () => {
    render(
      <CompareOverlay
        files={[
          {
            binary: false,
            deletions: 2,
            insertions: 5,
            path: "src/extension.ts",
            status: "modified"
          }
        ]}
        fromHash="8f9d5c2b4a1e"
        open
        toHash="72ea7564a1e0"
      />
    );

    const region = screen.getByRole("region", { name: "Compare Commits" });

    expect(region).toHaveClass("fixed");
    expect(within(region).getByText("From: 8f9d5c2")).toBeInTheDocument();
    expect(within(region).getByText("To: 72ea756")).toBeInTheDocument();
    expect(within(region).getByText("Changed Files (1)")).toBeInTheDocument();
    expect(within(region).getByText("src/extension.ts")).toBeInTheDocument();
  });

  it("sends close and file diff intents", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenFileDiff = vi.fn();

    render(
      <CompareOverlay
        files={[
          {
            binary: false,
            deletions: 2,
            insertions: 5,
            path: "src/extension.ts",
            status: "modified"
          }
        ]}
        fromHash="8f9d5c2b4a1e"
        onClose={onClose}
        onOpenFileDiff={onOpenFileDiff}
        open
        toHash="72ea7564a1e0"
      />
    );

    await user.click(screen.getByRole("button", { name: "Open diff for src/extension.ts" }));
    await user.click(screen.getByRole("button", { name: "Close compare" }));

    expect(onOpenFileDiff).toHaveBeenCalledWith("src/extension.ts");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
