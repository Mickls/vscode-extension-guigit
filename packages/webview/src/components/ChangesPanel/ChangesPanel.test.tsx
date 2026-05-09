/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangesPanel } from "./ChangesPanel";
import type { WorkingTreeViewModel } from "../../app/rpcContract.generated";

describe("ChangesPanel", () => {
  afterEach(cleanup);

  it("renders staged changes, changes, stash, and commit composer", () => {
    render(<ChangesPanel fileViewMode="list" workingTree={workingTree} />);

    expect(screen.getByRole("heading", { name: "Staged Changes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Changes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stash (1)" })).toBeInTheDocument();
    expect(screen.getByText("src/staged.ts")).toBeInTheDocument();
    expect(screen.getByText("src/unstaged.ts")).toBeInTheDocument();
    expect(screen.getByText("WIP on main: abc1234 message")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Commit message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
  });

  it("uses one shared file view mode control", () => {
    render(<ChangesPanel fileViewMode="list" workingTree={workingTree} />);

    expect(screen.getAllByRole("button", { name: "Tree view" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "List view" })).toHaveLength(1);
  });

  it("sends staged and unstaged file actions", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const onOpenFileDiff = vi.fn();
    const onStageFile = vi.fn();
    const onUnstageFile = vi.fn();

    render(
      <ChangesPanel
        fileViewMode="list"
        onOpenFile={onOpenFile}
        onOpenFileDiff={onOpenFileDiff}
        onStageFile={onStageFile}
        onUnstageFile={onUnstageFile}
        workingTree={workingTree}
      />
    );

    await user.click(screen.getByRole("button", { name: "Unstage src/staged.ts" }));
    await user.click(screen.getByRole("button", { name: "Stage src/unstaged.ts" }));
    await user.click(screen.getByRole("button", { name: "Open diff for src/staged.ts" }));
    await user.click(screen.getByRole("button", { name: "Open file src/unstaged.ts" }));

    expect(onUnstageFile).toHaveBeenCalledWith("src/staged.ts");
    expect(onStageFile).toHaveBeenCalledWith("src/unstaged.ts");
    expect(onOpenFileDiff).toHaveBeenCalledWith("src/staged.ts", "staged", undefined);
    expect(onOpenFile).toHaveBeenCalledWith("src/unstaged.ts");
  });

  it("sends previous paths with renamed working tree diff actions", async () => {
    const user = userEvent.setup();
    const onOpenFileDiff = vi.fn();

    render(<ChangesPanel fileViewMode="list" onOpenFileDiff={onOpenFileDiff} workingTree={renameWorkingTree} />);

    await user.click(screen.getByRole("button", { name: "Open diff for src/staged-new.ts" }));
    await user.click(screen.getByRole("button", { name: "Open diff for src/unstaged-new.ts" }));

    expect(onOpenFileDiff).toHaveBeenNthCalledWith(1, "src/staged-new.ts", "staged", "src/staged-old.ts");
    expect(onOpenFileDiff).toHaveBeenNthCalledWith(2, "src/unstaged-new.ts", "unstaged", "src/unstaged-old.ts");
  });
});

const workingTree = {
  branch: "main",
  repositoryId: "/repo",
  repositoryRoot: "/repo",
  staged: [
    { area: "staged", binary: false, deletions: 0, insertions: 1, path: "src/staged.ts", status: "modified" }
  ],
  stashes: [
    { branch: "main", date: "", message: "WIP on main: abc1234 message", ref: "stash@{0}" }
  ],
  unstaged: [
    { area: "unstaged", binary: false, deletions: 1, insertions: 0, path: "src/unstaged.ts", status: "modified" }
  ]
} satisfies WorkingTreeViewModel;

const renameWorkingTree = {
  branch: "main",
  repositoryId: "/repo",
  repositoryRoot: "/repo",
  staged: [
    {
      area: "staged",
      binary: false,
      deletions: 1,
      insertions: 1,
      path: "src/staged-new.ts",
      previousPath: "src/staged-old.ts",
      status: "renamed"
    }
  ],
  stashes: [],
  unstaged: [
    {
      area: "unstaged",
      binary: false,
      deletions: 1,
      insertions: 1,
      path: "src/unstaged-new.ts",
      previousPath: "src/unstaged-old.ts",
      status: "renamed"
    }
  ]
} satisfies WorkingTreeViewModel;
