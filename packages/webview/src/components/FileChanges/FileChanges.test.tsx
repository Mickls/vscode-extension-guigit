/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileChanges } from "./FileChanges";
import type { FileChangeViewModel } from "../../app/rpcContract.generated";

const files: readonly FileChangeViewModel[] = [
  {
    binary: false,
    deletions: 1,
    insertions: 4,
    path: "src/components/FileChanges.tsx",
    status: "modified"
  },
  {
    binary: true,
    deletions: 0,
    insertions: 0,
    path: "assets/logo.png",
    status: "added"
  }
];

describe("FileChanges", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders list mode file changes", () => {
    render(<FileChanges files={files} mode="list" />);

    const region = screen.getByRole("region", { name: "Files Changed" });

    expect(within(region).getByText("src/components/FileChanges.tsx")).toBeInTheDocument();
    expect(within(region).getByText("assets/logo.png")).toBeInTheDocument();
    expect(within(region).getByText("modified")).toBeInTheDocument();
    expect(within(region).getByText("binary")).toBeInTheDocument();
  });

  it("renders tree mode grouped by directory", () => {
    render(<FileChanges files={files} mode="tree" />);

    const region = screen.getByRole("region", { name: "Files Changed" });

    expect(within(region).getByText("src")).toBeInTheDocument();
    expect(within(region).getByText("components")).toBeInTheDocument();
    expect(within(region).getByText("FileChanges.tsx")).toBeInTheDocument();
    expect(within(region).getByText("assets")).toBeInTheDocument();
    expect(within(region).getByText("logo.png")).toBeInTheDocument();
  });

  it("sends open diff intent", async () => {
    const user = userEvent.setup();
    const onOpenFileDiff = vi.fn();

    render(<FileChanges files={files} mode="list" onOpenFileDiff={onOpenFileDiff} />);

    await user.click(screen.getByRole("button", { name: "Open diff for src/components/FileChanges.tsx" }));

    expect(onOpenFileDiff).toHaveBeenCalledWith("src/components/FileChanges.tsx");
  });

  it("sends view mode change intent without opening file diffs", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const onOpenFileDiff = vi.fn();

    render(
      <FileChanges
        files={files}
        mode="tree"
        onModeChange={onModeChange}
        onOpenFileDiff={onOpenFileDiff}
      />
    );

    expect(screen.getByRole("button", { name: "Tree view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "List view" }));

    expect(onModeChange).toHaveBeenCalledWith("list");
    expect(onOpenFileDiff).not.toHaveBeenCalled();
  });
});
