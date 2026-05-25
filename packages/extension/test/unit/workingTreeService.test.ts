import { describe, expect, it, vi } from "vitest";
import { WorkingTreeService } from "../../src/backend/git/WorkingTreeService";

describe("WorkingTreeService", () => {
  it("loads branch, staged files, unstaged files, and stashes", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "M  src/staged.ts\n M src/unstaged.ts\n?? src/untracked.ts\n";
      }
      if (args.join(" ") === "stash list") {
        return "stash@{0}: WIP on main: abc1234 message";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
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
        ["/repo", ["symbolic-ref", "--short", "HEAD"]],
        ["/repo", ["status", "--porcelain=v1", "--untracked-files=all"]],
        ["/repo", ["stash", "list"]],
        ["/repo", ["diff", "--cached", "--numstat"]],
        ["/repo", ["diff", "--numstat"]]
      ])
    );
    expect(gitRaw).toHaveBeenCalledTimes(5);
  });

  it("loads staged and unstaged line counts from git numstat", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "M  src/staged.ts\n M src/unstaged.ts\nAM src/both.ts\n?? src/untracked.ts\n";
      }
      if (args.join(" ") === "diff --cached --numstat") {
        return "5\t2\tsrc/staged.ts\n3\t1\tsrc/both.ts\n";
      }
      if (args.join(" ") === "diff --numstat") {
        return "7\t4\tsrc/unstaged.ts\n11\t6\tsrc/both.ts\n";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await service.load("/repo", "/repo");

    expect(result.staged).toMatchObject([
      { deletions: 2, insertions: 5, path: "src/staged.ts" },
      { deletions: 1, insertions: 3, path: "src/both.ts" }
    ]);
    expect(result.unstaged).toMatchObject([
      { deletions: 4, insertions: 7, path: "src/unstaged.ts" },
      { deletions: 6, insertions: 11, path: "src/both.ts" },
      { deletions: 0, insertions: 0, path: "src/untracked.ts" }
    ]);
    expect(gitRaw).toHaveBeenCalledWith("/repo", ["diff", "--cached", "--numstat"]);
    expect(gitRaw).toHaveBeenCalledWith("/repo", ["diff", "--numstat"]);
  });

  it("loads untracked text file line counts as insertions", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "?? src/new.ts\n?? src/empty.ts\n?? assets/image.png\n";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const readFile = vi.fn(async (path: string) => {
      const files: Record<string, Buffer> = {
        "/repo/assets/image.png": Buffer.from([0x89, 0x50, 0x00, 0x47]),
        "/repo/src/empty.ts": Buffer.from(""),
        "/repo/src/new.ts": Buffer.from("one\ntwo\nthree\n")
      };
      return files[path]!;
    });
    const service = new WorkingTreeService({ gitRaw, readFile });

    const result = await service.load("/repo", "/repo");

    expect(result.unstaged).toMatchObject([
      { binary: false, deletions: 0, insertions: 3, path: "src/new.ts" },
      { binary: false, deletions: 0, insertions: 0, path: "src/empty.ts" },
      { binary: true, deletions: 0, insertions: 0, path: "assets/image.png" }
    ]);
  });

  it("loads changes from an initialized repository before the first commit", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "?? src/first-file.ts\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await service.load("/repo", "/repo");

    expect(result).toEqual({
      branch: "main",
      repositoryId: "/repo",
      repositoryRoot: "/repo",
      staged: [],
      stashes: [],
      unstaged: [
        expect.objectContaining({
          area: "untracked",
          path: "src/first-file.ts",
          status: "added"
        })
      ]
    });
  });

  it("reports HEAD when the current checkout is detached", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        throw new Error("fatal: ref HEAD is not a symbolic ref");
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    await expect(service.load("/repo", "/repo")).resolves.toEqual(expect.objectContaining({
      branch: "HEAD"
    }));
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
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "M  src/staged.ts\n M src/unstaged.ts\n";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
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
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "M  src/staged.ts\n M src/unstaged.ts\n";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
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

  it("logs working tree write commands and successful results", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    };
    const service = new WorkingTreeService({
      gitRaw,
      logger
    });

    await service.stageAll("/repo", "/repo");

    expect(logger.info).toHaveBeenNthCalledWith(1, "git.command", {
      command: "git -C /repo add --all"
    });
    expect(logger.info).toHaveBeenNthCalledWith(2, "git.result", {
      command: "git -C /repo add --all",
      message: "Staged all changes",
      status: "ok"
    });
  });

  it("does not discard a file unless the warning confirmation returns Discard", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return " M src/a.ts\n";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
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
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
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
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
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
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const showWarningMessage = vi.fn(async () => undefined);
    const t = vi.fn((key: string) => {
      const messages: Record<string, string> = {
        "changes.dropStash": "删除储藏",
        "workingTree.dropStashCancelled": "已取消删除储藏",
        "workingTree.dropStashConfirmation": "要删除这个储藏吗？"
      };
      return messages[key];
    });
    const service = new WorkingTreeService({ gitRaw, showWarningMessage, t });

    const result = await service.dropStash("/repo", "/repo", "stash@{0}");

    expect(showWarningMessage).toHaveBeenCalledWith("要删除这个储藏吗？", { modal: true }, "删除储藏");
    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["stash", "drop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "已取消删除储藏", status: "cancelled" });
  });

  it("runs git stash drop when drop confirmation returns Drop Stash", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({
      gitRaw,
      t: (key: string) => {
        const messages: Record<string, string> = {
          "changes.dropStash": "删除储藏",
          "workingTree.droppedStash": "已删除储藏"
        };
        return messages[key];
      },
      showWarningMessage: async () => "删除储藏"
    });

    const result = await service.dropStash("/repo", "/repo", "stash@{0}");

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", ["stash", "drop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "已删除储藏", status: "ok" });
  });

  it("does not pop a stash unless the warning confirmation returns Pop Stash", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const showWarningMessage = vi.fn(async () => undefined);
    const t = vi.fn((key: string) => {
      const messages: Record<string, string> = {
        "changes.popStash": "应用并移除储藏",
        "workingTree.popStashCancelled": "已取消应用并移除储藏",
        "workingTree.popStashConfirmation": "要应用并移除这个储藏吗？"
      };
      return messages[key];
    });
    const service = new WorkingTreeService({ gitRaw, showWarningMessage, t });

    const result = await service.popStash("/repo", "/repo", "stash@{0}");

    expect(showWarningMessage).toHaveBeenCalledWith("要应用并移除这个储藏吗？", { modal: true }, "应用并移除储藏");
    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["stash", "pop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "已取消应用并移除储藏", status: "cancelled" });
  });

  it("runs git stash pop when pop confirmation returns Pop Stash", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({
      gitRaw,
      t: (key: string) => {
        const messages: Record<string, string> = {
          "changes.popStash": "应用并移除储藏",
          "workingTree.poppedStash": "已应用并移除储藏"
        };
        return messages[key];
      },
      showWarningMessage: async () => "应用并移除储藏"
    });

    const result = await service.popStash("/repo", "/repo", "stash@{0}");

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", ["stash", "pop", "stash@{0}"]);
    expect(result.result).toEqual({ message: "已应用并移除储藏", status: "ok" });
  });

  it("applies stash without confirmation and returns the updated working tree", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return " M src/a.ts\n";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
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

  it("creates a stash with staged, unstaged, and untracked changes", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "stash list") {
        return "stash@{0}: On main: GUI Git History manual stash";
      }
      if (args.join(" ") === "status --porcelain=v1 --untracked-files=all") {
        return "";
      }
      if (args.join(" ") === "symbolic-ref --short HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await service.createStash("/repo", "/repo");

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", [
      "stash",
      "push",
      "--include-untracked",
      "-m",
      "GUI Git History manual stash"
    ]);
    expect(result.result).toEqual({ message: "Stashed changes", status: "ok" });
    expect(result.workingTree.stashes).toEqual([
      { branch: "main", date: "", message: "On main: GUI Git History manual stash", ref: "stash@{0}" }
    ]);
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
