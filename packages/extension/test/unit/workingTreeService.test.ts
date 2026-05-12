import { describe, expect, it, vi } from "vitest";
import { WorkingTreeService } from "../../src/backend/git/WorkingTreeService";

describe("WorkingTreeService", () => {
  it("loads branch, staged files, unstaged files, and stashes", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "M  src/staged.ts\n M src/unstaged.ts\n?? src/untracked.ts\n";
      }
      if (args.join(" ") === "stash list") {
        return "stash@{0}: WIP on main: abc1234 message";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await service.load("/repo", "/repo");

    expect(result.branch).toBe("main");
    expect(result.staged.map((file) => file.path)).toEqual(["src/staged.ts"]);
    expect(result.unstaged.map((file) => file.path)).toEqual(["src/unstaged.ts", "src/untracked.ts"]);
    expect(result.stashes).toHaveLength(1);
    expect(gitRaw.mock.calls).toEqual(
      expect.arrayContaining([
        ["/repo", ["rev-parse", "--abbrev-ref", "HEAD"]],
        ["/repo", ["status", "--porcelain=v1"]],
        ["/repo", ["stash", "list"]]
      ])
    );
    expect(gitRaw).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      action: (service: WorkingTreeService) => service.stageFile("/repo", "/repo", "src/a.ts"),
      command: ["add", "--", "src/a.ts"],
      message: "Staged file"
    },
    {
      action: (service: WorkingTreeService) => service.stageAll("/repo", "/repo"),
      command: ["add", "--all"],
      message: "Staged all changes"
    },
    {
      action: (service: WorkingTreeService) => service.unstageFile("/repo", "/repo", "src/a.ts"),
      command: ["restore", "--staged", "--", "src/a.ts"],
      message: "Unstaged file"
    },
    {
      action: (service: WorkingTreeService) => service.unstageAll("/repo", "/repo"),
      command: ["restore", "--staged", "--", "."],
      message: "Unstaged all changes"
    }
  ])("runs git $message and returns the updated working tree", async ({ action, command, message }) => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "M  src/staged.ts\n M src/unstaged.ts\n";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await action(service);

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", command);
    expect(result).toEqual({
      result: {
        message,
        status: "ok"
      },
      workingTree: expect.objectContaining({
        branch: "main",
        repositoryId: "/repo",
        repositoryRoot: "/repo",
        staged: [expect.objectContaining({ path: "src/staged.ts" })],
        unstaged: [expect.objectContaining({ path: "src/unstaged.ts" })]
      })
    });
  });

  it("runs git commit with the message and returns the updated working tree without staging unstaged files", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "M  src/staged.ts\n M src/unstaged.ts\n";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await service.commit("/repo", "/repo", "feat: test");

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", ["commit", "-m", "feat: test"]);
    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["add", "--all"]);
    expect(result).toEqual({
      result: {
        message: "Commit completed",
        status: "ok"
      },
      workingTree: expect.objectContaining({
        branch: "main",
        repositoryId: "/repo",
        repositoryRoot: "/repo",
        staged: [expect.objectContaining({ path: "src/staged.ts" })],
        unstaged: [expect.objectContaining({ path: "src/unstaged.ts" })]
      })
    });
  });

  it("does not discard a file unless the warning confirmation returns Discard", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return " M src/a.ts\n";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const showWarningMessage = vi.fn(async () => undefined);
    const service = new WorkingTreeService({ gitRaw, showWarningMessage });

    const result = await service.discardFile("/repo", "/repo", "src/a.ts");

    expect(showWarningMessage).toHaveBeenCalledWith("Discard changes in src/a.ts?", { modal: true }, "Discard");
    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["restore", "--worktree", "--", "src/a.ts"]);
    expect(result.result).toEqual({ message: "Discard cancelled", status: "cancelled" });
  });

  it("runs git restore when discard confirmation returns Discard", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 -- src/a.ts") {
        return " M src/a.ts\n";
      }
      if (args.join(" ") === "status --porcelain=v1") {
        return "";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({
      gitRaw,
      showWarningMessage: async () => "Discard"
    });

    const result = await service.discardFile("/repo", "/repo", "src/a.ts");

    expect(gitRaw).toHaveBeenNthCalledWith(2, "/repo", ["restore", "--worktree", "--", "src/a.ts"]);
    expect(result.result).toEqual({ message: "Discarded file", status: "ok" });
  });

  it("runs git clean when discarding an untracked file", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 -- src/new.ts") {
        return "?? src/new.ts\n";
      }
      if (args.join(" ") === "status --porcelain=v1") {
        return "";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({
      gitRaw,
      showWarningMessage: async () => "Discard"
    });

    const result = await service.discardFile("/repo", "/repo", "src/new.ts");

    expect(gitRaw).toHaveBeenNthCalledWith(2, "/repo", ["clean", "-f", "--", "src/new.ts"]);
    expect(result.result).toEqual({ message: "Discarded file", status: "ok" });
  });

  it("does not drop a stash unless the warning confirmation returns Drop Stash", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const showWarningMessage = vi.fn(async () => undefined);
    const service = new WorkingTreeService({ gitRaw, showWarningMessage });

    const result = await service.dropStash("/repo", "/repo", "stash@{0}");

    expect(showWarningMessage).toHaveBeenCalledWith("Drop stash stash@{0}?", { modal: true }, "Drop Stash");
    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["stash", "drop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "Drop stash cancelled", status: "cancelled" });
  });

  it("runs git stash drop when drop confirmation returns Drop Stash", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({
      gitRaw,
      showWarningMessage: async () => "Drop Stash"
    });

    const result = await service.dropStash("/repo", "/repo", "stash@{0}");

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", ["stash", "drop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "Dropped stash", status: "ok" });
  });

  it("does not pop a stash unless the warning confirmation returns Pop Stash", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const showWarningMessage = vi.fn(async () => undefined);
    const service = new WorkingTreeService({ gitRaw, showWarningMessage });

    const result = await service.popStash("/repo", "/repo", "stash@{0}");

    expect(showWarningMessage).toHaveBeenCalledWith("Pop stash stash@{0}?", { modal: true }, "Pop Stash");
    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["stash", "pop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "Pop stash cancelled", status: "cancelled" });
  });

  it("runs git stash pop when pop confirmation returns Pop Stash", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({
      gitRaw,
      showWarningMessage: async () => "Pop Stash"
    });

    const result = await service.popStash("/repo", "/repo", "stash@{0}");

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", ["stash", "pop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "Popped stash", status: "ok" });
  });

  it("applies stash without confirmation and returns the updated working tree", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return " M src/a.ts\n";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await service.applyStash("/repo", "/repo", "stash@{0}");

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", ["stash", "apply", "stash@{0}"]);
    expect(result.result).toEqual({ message: "Applied stash", status: "ok" });
    expect(result.workingTree.unstaged).toMatchObject([{ path: "src/a.ts" }]);
  });

  it("loads stash details with files", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "stash list") {
        return "stash@{0}: WIP on main: abc1234 message\n";
      }
      if (args.join(" ") === "stash show --include-untracked --name-status stash@{0}") {
        return "M\tsrc/a.ts\nA\tsrc/image.png\nR100\tsrc/old.txt\tsrc/new.txt\n";
      }
      if (args.join(" ") === "stash show --include-untracked --numstat stash@{0}") {
        return "10\t2\tsrc/a.ts\n-\t-\tsrc/image.png\n3\t1\tsrc/{old.txt => new.txt}\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const stash = await service.getStashDetails("/repo", "stash@{0}");

    expect(stash).toEqual({
      branch: "main",
      date: "",
      files: [
        { area: "stash", binary: false, deletions: 2, insertions: 10, path: "src/a.ts", status: "modified" },
        { area: "stash", binary: true, deletions: 0, insertions: 0, path: "src/image.png", status: "added" },
        {
          area: "stash",
          binary: false,
          deletions: 1,
          insertions: 3,
          path: "src/new.txt",
          previousPath: "src/old.txt",
          status: "renamed"
        }
      ],
      message: "WIP on main: abc1234 message",
      ref: "stash@{0}"
    });
    expect(gitRaw).toHaveBeenCalledWith("/repo", ["stash", "show", "--include-untracked", "--name-status", "stash@{0}"]);
    expect(gitRaw).toHaveBeenCalledWith("/repo", ["stash", "show", "--include-untracked", "--numstat", "stash@{0}"]);
  });
});
