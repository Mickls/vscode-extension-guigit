/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkingTreeViewModel } from "../../app/rpcContract.generated";
import { StashPanel } from "./StashPanel";

describe("StashPanel", () => {
  afterEach(cleanup);

  it("renders repository summary, stashes, refresh, and manual stash action", async () => {
    const user = userEvent.setup();
    const onCreateStash = vi.fn();
    const onRefresh = vi.fn();

    render(
      <StashPanel
        onCreateStash={onCreateStash}
        onRefresh={onRefresh}
        repository={{ id: "/repo", name: "repo", rootPath: "/repo" }}
        workingTree={workingTree}
      />
    );

    expect(screen.getByText("repo")).toBeInTheDocument();
    expect(screen.getByText("/repo")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stash (1)" })).toBeInTheDocument();
    expect(screen.getByText("WIP on main: abc1234 message")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh Stashes" }));
    await user.click(screen.getByRole("button", { name: "Stash All Changes" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onCreateStash).toHaveBeenCalledTimes(1);
  });

  it("disables manual stash when there are no current changes", () => {
    render(<StashPanel workingTree={{ ...workingTree, staged: [], unstaged: [] }} />);

    expect(screen.getByRole("button", { name: "Stash All Changes" })).toBeDisabled();
  });

  it("expands stash entries and sends stash actions", async () => {
    const user = userEvent.setup();
    const onApplyStash = vi.fn();
    const onDropStash = vi.fn();
    const onExpandStash = vi.fn();
    const onOpenStashDiff = vi.fn();
    const onPopStash = vi.fn();

    render(
      <StashPanel
        onApplyStash={onApplyStash}
        onDropStash={onDropStash}
        onExpandStash={onExpandStash}
        onOpenStashDiff={onOpenStashDiff}
        onPopStash={onPopStash}
        workingTree={stashDetailsWorkingTree}
      />
    );

    expect(screen.queryByText("stash@{0}")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand stash WIP on main: abc1234 message" }));
    await user.click(screen.getByRole("button", { name: "Open diff for src/stashed.ts" }));
    await user.click(screen.getByRole("button", { name: "Apply stash" }));
    await user.click(screen.getByRole("button", { name: "Pop stash" }));
    await user.click(screen.getByRole("button", { name: "Drop stash" }));

    expect(onExpandStash).toHaveBeenCalledWith("stash@{0}");
    expect(onOpenStashDiff).toHaveBeenCalledWith("stash@{0}", "src/stashed.ts", "src/old-stashed.ts");
    expect(onApplyStash).toHaveBeenCalledWith("stash@{0}");
    expect(onPopStash).toHaveBeenCalledWith("stash@{0}");
    expect(onDropStash).toHaveBeenCalledWith("stash@{0}");
  });

  it("adds hover tooltip labels to icon-only stash buttons", async () => {
    const user = userEvent.setup();

    render(<StashPanel workingTree={stashDetailsWorkingTree} />);

    expect(screen.getByRole("button", { name: "Refresh Stashes" }).querySelector("[data-tooltip='Refresh Stashes']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply stash" }).querySelector("[data-tooltip='Apply stash']")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand stash WIP on main: abc1234 message" }));

    expect(screen.getByRole("button", { name: "Expand stash WIP on main: abc1234 message" }).querySelector(
      "[data-tooltip='Expand stash WIP on main: abc1234 message']"
    )).toBeInTheDocument();
  });

  it("keeps stash action buttons grouped beside the stash message", () => {
    render(<StashPanel workingTree={stashDetailsWorkingTree} />);

    expect(screen.getByText("WIP on main: abc1234 message").closest(".grid")).toHaveClass("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(screen.getByRole("button", { name: "Apply stash" }).parentElement).toHaveClass("flex");
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

const stashDetailsWorkingTree = {
  ...workingTree,
  stashes: [
    {
      branch: "main",
      date: "",
      files: [
        {
          area: "stash",
          binary: false,
          deletions: 1,
          insertions: 2,
          path: "src/stashed.ts",
          previousPath: "src/old-stashed.ts",
          status: "renamed"
        }
      ],
      message: "WIP on main: abc1234 message",
      ref: "stash@{0}"
    }
  ]
} satisfies WorkingTreeViewModel;
