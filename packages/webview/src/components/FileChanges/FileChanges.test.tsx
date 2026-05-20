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

  it("uses distinct badge colors for file statuses", () => {
    render(
      <FileChanges
        files={[
          createFile("added.ts", "added"),
          createFile("deleted.ts", "deleted"),
          createFile("modified.ts", "modified"),
          createFile("renamed.ts", "renamed"),
          createFile("copied.ts", "copied"),
          createFile("unchanged.ts", "unchanged")
        ]}
        mode="list"
      />
    );

    expect(screen.getByText("added")).toHaveClass("file-status--added");
    expect(screen.getByText("deleted")).toHaveClass("file-status--deleted");
    expect(screen.getByText("modified")).toHaveClass("file-status--modified");
    expect(screen.getByText("renamed")).toHaveClass("file-status--renamed");
    expect(screen.getByText("copied")).toHaveClass("file-status--copied");
    expect(screen.getByText("unchanged")).toHaveClass("file-status--unchanged");
  });

  it("renders tree mode grouped by directory", () => {
    render(<FileChanges files={files} mode="tree" />);

    const region = screen.getByRole("region", { name: "Files Changed" });

    expect(within(region).getByRole("button", { name: "Collapse src/components" })).toBeInTheDocument();
    expect(within(region).getByText("FileChanges.tsx")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Collapse assets" })).toBeInTheDocument();
    expect(within(region).getByText("logo.png")).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: "Collapse src" })).not.toBeInTheDocument();
    expect(within(region).queryByText("components")).not.toBeInTheDocument();
  });

  it("stops tree directory compression at branch points", () => {
    render(
      <FileChanges
        files={[
          createFile("app/biz/knowledge/base.go", "modified"),
          createFile("app/biz/biz.go", "modified")
        ]}
        mode="tree"
      />
    );

    const region = screen.getByRole("region", { name: "Files Changed" });

    expect(within(region).getByRole("button", { name: "Collapse app/biz" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Collapse app/biz/knowledge" })).toBeInTheDocument();
    expect(within(region).getByText("knowledge")).toBeInTheDocument();
    expect(within(region).getByText("base.go")).toBeInTheDocument();
    expect(within(region).getByText("biz.go")).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: "Collapse app" })).not.toBeInTheDocument();
  });

  it("collapses and expands tree directories", async () => {
    const user = userEvent.setup();

    render(<FileChanges files={files} mode="tree" />);

    await user.click(screen.getByRole("button", { name: "Collapse src/components" }));

    expect(screen.queryByText("FileChanges.tsx")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand src/components" }));

    expect(screen.getByText("FileChanges.tsx")).toBeInTheDocument();
  });

  it("sends open diff intent", async () => {
    const user = userEvent.setup();
    const onOpenFileDiff = vi.fn();

    render(<FileChanges files={files} mode="list" onOpenFileDiff={onOpenFileDiff} />);

    await user.click(screen.getByRole("button", { name: "Open diff for src/components/FileChanges.tsx" }));

    expect(onOpenFileDiff).toHaveBeenCalledWith("src/components/FileChanges.tsx");
  });

  it("sends open file and file history intents without opening diffs", async () => {
    const user = userEvent.setup();
    const onOpenFileDiff = vi.fn();
    const onOpenFile = vi.fn();
    const onOpenFileHistory = vi.fn();

    render(
      <FileChanges
        files={files}
        mode="list"
        onOpenFile={onOpenFile}
        onOpenFileDiff={onOpenFileDiff}
        onOpenFileHistory={onOpenFileHistory}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open file src/components/FileChanges.tsx" }));
    await user.click(screen.getByRole("button", { name: "Open file history for src/components/FileChanges.tsx" }));

    expect(screen.getByRole("button", { name: "Open file src/components/FileChanges.tsx" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open file history for src/components/FileChanges.tsx" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open file src/components/FileChanges.tsx" })).not.toHaveTextContent("O");
    expect(screen.getByRole("button", { name: "Open file history for src/components/FileChanges.tsx" })).not.toHaveTextContent("H");
    expect(onOpenFile).toHaveBeenCalledWith("src/components/FileChanges.tsx");
    expect(onOpenFileHistory).toHaveBeenCalledWith("src/components/FileChanges.tsx");
    expect(onOpenFileDiff).not.toHaveBeenCalled();
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

function createFile(path: string, status: FileChangeViewModel["status"]): FileChangeViewModel {
  return {
    binary: false,
    deletions: 0,
    insertions: 0,
    path,
    status
  };
}
