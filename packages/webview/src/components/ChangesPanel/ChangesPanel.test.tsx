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

  it("renders commit composer before staged changes, changes, and stash", () => {
    render(<ChangesPanel fileViewMode="list" workingTree={workingTree} />);

    const commitComposer = screen.getByRole("textbox", { name: "Commit message" });
    expect(screen.getByRole("heading", { name: "Staged Changes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Changes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stash (1)" })).toBeInTheDocument();
    expect(screen.getByText("src/staged.ts")).toBeInTheDocument();
    expect(screen.getByText("src/unstaged.ts")).toBeInTheDocument();
    expect(screen.getByText("WIP on main: abc1234 message")).toBeInTheDocument();
    expect(commitComposer.compareDocumentPosition(screen.getByRole("heading", { name: "Staged Changes (1)" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
  });

  it("keeps the commit button disabled when the message is empty", () => {
    render(<ChangesPanel fileViewMode="list" workingTree={workingTree} />);

    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
  });

  it("keeps the commit button disabled when staged files are empty", async () => {
    const user = userEvent.setup();

    render(<ChangesPanel fileViewMode="list" workingTree={{ ...workingTree, staged: [] }} />);
    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "feat: test");

    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
  });

  it("sends typed commit messages when the commit button is enabled", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(<ChangesPanel fileViewMode="list" onCommit={onCommit} workingTree={workingTree} />);
    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "feat: test");
    await user.click(screen.getByRole("button", { name: "Commit" }));

    expect(onCommit).toHaveBeenCalledWith("feat: test");
  });

  it("starts commit message generation and applies the returned suggestion", async () => {
    const user = userEvent.setup();
    const onGenerateCommitMessage = vi.fn(() => "generate-1");
    const { rerender } = render(
      <ChangesPanel
        fileViewMode="list"
        onGenerateCommitMessage={onGenerateCommitMessage}
        workingTree={workingTree}
      />
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));
    rerender(
      <ChangesPanel
        commitMessageSuggestion={{ message: "feat: generated", requestId: "generate-1" }}
        fileViewMode="list"
        onGenerateCommitMessage={onGenerateCommitMessage}
        workingTree={workingTree}
      />
    );

    expect(onGenerateCommitMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Commit message" })).toHaveValue("feat: generated");
  });

  it("disables commit message generation while a request is pending", () => {
    render(
      <ChangesPanel
        fileViewMode="list"
        generatingCommitMessage
        workingTree={workingTree}
      />
    );

    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  it("does not let stale generated suggestions replace newer manual text", async () => {
    const user = userEvent.setup();
    const onGenerateCommitMessage = vi.fn(() => "generate-1");
    const { rerender } = render(
      <ChangesPanel
        fileViewMode="list"
        onGenerateCommitMessage={onGenerateCommitMessage}
        workingTree={workingTree}
      />
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));
    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "manual message");
    rerender(
      <ChangesPanel
        commitMessageSuggestion={{ message: "feat: stale", requestId: "generate-1" }}
        fileViewMode="list"
        onGenerateCommitMessage={onGenerateCommitMessage}
        workingTree={workingTree}
      />
    );

    expect(screen.getByRole("textbox", { name: "Commit message" })).toHaveValue("manual message");
  });

  it("does not let older generated suggestions replace the latest generated result", async () => {
    const user = userEvent.setup();
    const onGenerateCommitMessage = vi.fn()
      .mockReturnValueOnce("generate-1")
      .mockReturnValueOnce("generate-2");
    const { rerender } = render(
      <ChangesPanel
        fileViewMode="list"
        onGenerateCommitMessage={onGenerateCommitMessage}
        workingTree={workingTree}
      />
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));
    rerender(
      <ChangesPanel
        commitMessageSuggestion={{ message: "feat: latest", requestId: "generate-2" }}
        fileViewMode="list"
        onGenerateCommitMessage={onGenerateCommitMessage}
        workingTree={workingTree}
      />
    );
    rerender(
      <ChangesPanel
        commitMessageSuggestion={{ message: "feat: stale", requestId: "generate-1" }}
        fileViewMode="list"
        onGenerateCommitMessage={onGenerateCommitMessage}
        workingTree={workingTree}
      />
    );

    expect(screen.getByRole("textbox", { name: "Commit message" })).toHaveValue("feat: latest");
  });

  it("uses one shared file view mode control", () => {
    render(<ChangesPanel fileViewMode="list" workingTree={workingTree} />);

    expect(screen.getAllByRole("button", { name: "Tree view" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "List view" })).toHaveLength(1);
  });

  it("sends bulk staged and unstaged actions", async () => {
    const user = userEvent.setup();
    const onStageAll = vi.fn();
    const onUnstageAll = vi.fn();

    render(
      <ChangesPanel
        fileViewMode="list"
        onStageAll={onStageAll}
        onUnstageAll={onUnstageAll}
        workingTree={workingTree}
      />
    );

    await user.click(screen.getByRole("button", { name: "Stage All" }));
    await user.click(screen.getByRole("button", { name: "Unstage All" }));

    expect(onStageAll).toHaveBeenCalledTimes(1);
    expect(onUnstageAll).toHaveBeenCalledTimes(1);
  });

  it("groups staged and unstaged files in tree mode while preserving row actions", async () => {
    const user = userEvent.setup();
    const onDiscardFile = vi.fn();
    const onOpenFile = vi.fn();
    const onOpenFileDiff = vi.fn();
    const onStageFile = vi.fn();
    const onUnstageFile = vi.fn();

    render(
      <ChangesPanel
        fileViewMode="tree"
        onDiscardFile={onDiscardFile}
        onOpenFile={onOpenFile}
        onOpenFileDiff={onOpenFileDiff}
        onStageFile={onStageFile}
        onUnstageFile={onUnstageFile}
        workingTree={treeWorkingTree}
      />
    );

    expect(screen.getByRole("button", { name: "Collapse src" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse assets" })).toBeInTheDocument();
    expect(screen.getByText("Button.tsx")).toBeInTheDocument();
    expect(screen.getByText("app.css")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open diff for src/components/Button.tsx" }));
    await user.click(screen.getByRole("button", { name: "Unstage src/components/Button.tsx" }));
    await user.click(screen.getByRole("button", { name: "Stage assets/styles/app.css" }));
    await user.click(screen.getByRole("button", { name: "Discard assets/styles/app.css" }));
    await user.click(screen.getByRole("button", { name: "Open file assets/styles/app.css" }));

    expect(onOpenFileDiff).toHaveBeenCalledWith("src/components/Button.tsx", "staged", "src/old/Button.tsx");
    expect(onUnstageFile).toHaveBeenCalledWith("src/components/Button.tsx");
    expect(onStageFile).toHaveBeenCalledWith("assets/styles/app.css");
    expect(onDiscardFile).toHaveBeenCalledWith("assets/styles/app.css");
    expect(onOpenFile).toHaveBeenCalledWith("assets/styles/app.css");
  });

  it("keeps the commit button disabled while an operation is busy", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(
      <ChangesPanel
        fileViewMode="list"
        operationBusy
        onCommit={onCommit}
        workingTree={workingTree}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "feat: test");

    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps the commit button disabled when the working tree has an unfinished operation", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(
      <ChangesPanel
        fileViewMode="list"
        onCommit={onCommit}
        workingTree={{
          ...workingTree,
          operationState: {
            message: "Merge is still in progress",
            status: "conflict"
          }
        }}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Commit message" }), "feat: test");

    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("renders repository summary, refresh action, and operation status", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <ChangesPanel
        fileViewMode="list"
        onRefresh={onRefresh}
        operationStatus={{ message: "Pull is running...", state: "running" }}
        repository={{ id: "/repo", name: "repo", rootPath: "/repo" }}
        workingTree={workingTree}
      />
    );

    expect(screen.getByText("repo")).toBeInTheDocument();
    expect(screen.getByText("/repo")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Pull is running...");

    await user.click(screen.getByRole("button", { name: "Refresh Changes" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
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

  it("sends discard actions only for unstaged file rows", async () => {
    const user = userEvent.setup();
    const onDiscardFile = vi.fn();

    render(<ChangesPanel fileViewMode="list" onDiscardFile={onDiscardFile} workingTree={workingTree} />);

    await user.click(screen.getByRole("button", { name: "Discard src/unstaged.ts" }));

    expect(onDiscardFile).toHaveBeenCalledWith("src/unstaged.ts");
    expect(screen.queryByRole("button", { name: "Discard src/staged.ts" })).not.toBeInTheDocument();
  });

  it("expands stash entries and sends stash actions", async () => {
    const user = userEvent.setup();
    const onApplyStash = vi.fn();
    const onDropStash = vi.fn();
    const onExpandStash = vi.fn();
    const onOpenStashDiff = vi.fn();
    const onPopStash = vi.fn();

    render(
      <ChangesPanel
        fileViewMode="list"
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

const treeWorkingTree = {
  ...workingTree,
  staged: [
    {
      area: "staged",
      binary: false,
      deletions: 1,
      insertions: 2,
      path: "src/components/Button.tsx",
      previousPath: "src/old/Button.tsx",
      status: "renamed"
    }
  ],
  unstaged: [
    {
      area: "unstaged",
      binary: false,
      deletions: 3,
      insertions: 4,
      path: "assets/styles/app.css",
      status: "modified"
    }
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
