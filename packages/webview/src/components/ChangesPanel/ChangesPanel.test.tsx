/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
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
