import { describe, expect, it, vi } from "vitest";
import { GitService } from "../../src/backend/git/GitService";
import type { OperationResultViewModel } from "../../src/backend/rpc/contract";

vi.mock("vscode", () => ({
  env: {
    clipboard: {
      writeText: vi.fn()
    }
  },
  window: {
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showWarningMessage: vi.fn(),
    showQuickPick: vi.fn()
  }
}));

describe("GitService", () => {
  it("runs pull through safety auto-stash handling", async () => {
    const calls: string[] = [];
    const logs: unknown[] = [];
    let conflictContext: unknown;
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
      },
      safetyService: {
        runWithAutoStash: async (repositoryRoot, preference, operation, conflict) => {
          calls.push(`safety ${repositoryRoot} ${preference}`);
          conflictContext = conflict;
          return operation();
        }
      },
      settingsService: {
        getSettings: () => ({ autoStashOnPull: "always" })
      },
      logger: {
        debug: () => undefined,
        info: (_message, context) => logs.push(context)
      }
    });

    await expect(service.pull("/repo")).resolves.toEqual({ message: "Pull completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "safety /repo always",
      "pull --no-rebase"
    ]);
    expect(conflictContext).toEqual({
      abortArgs: ["merge", "--abort"],
      continueArgs: ["commit", "--no-edit"],
      operationKind: "merge",
      operationName: "Pull"
    });
    expect(logs).toContainEqual({ command: "git -C /repo pull --no-rebase" });
  });

  it("guides pull to set upstream tracking when the current branch has none", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue({ label: "origin/chore/all-my-stuffs", value: "origin/chore/all-my-stuffs" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          throw new Error("There is no tracking information for the current branch.");
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        if (args.join(" ") === "branch -r") {
          return "  origin/chore/all-my-stuffs\n";
        }

        return "";
      },
      safetyService: {
        runWithAutoStash: async (_repositoryRoot, _preference, operation) => operation()
      },
      showQuickPick
    });

    await expect(service.pull("/repo")).resolves.toEqual({ message: "Pull completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "branch -r",
      "branch --set-upstream-to origin/chore/all-my-stuffs feature",
      "pull --no-rebase"
    ]);
    expect(showQuickPick).toHaveBeenCalledWith(
      [{ label: "origin/chore/all-my-stuffs", value: "origin/chore/all-my-stuffs" }],
      { placeHolder: "Select upstream branch for feature" }
    );
  });

  it("runs push, prompts pull request creation for non-main branches, and fetches", async () => {
    const calls: string[] = [];
    const showInformationMessage = vi.fn();
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          return "origin/feature/demo\n";
        }

        return args.join(" ") === "rev-parse --abbrev-ref HEAD" ? "feature/demo\n" : "";
      },
      showInformationMessage
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "push origin HEAD:feature/demo",
      "rev-parse --abbrev-ref HEAD"
    ]);
    await Promise.resolve();
    await expect(service.fetch("/repo")).resolves.toEqual({ message: "Fetch completed", status: "ok" });

    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "push origin HEAD:feature/demo",
      "rev-parse --abbrev-ref HEAD",
      "fetch --all --prune"
    ]);
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Pushed feature/demo. Create a pull request?",
      "Create Pull Request",
      "Dismiss"
    );
  });

  it("completes push without waiting for the pull request prompt", async () => {
    const calls: string[] = [];
    const showInformationMessage = vi.fn(() => new Promise<string | undefined>(() => undefined));
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          return "origin/feature/demo\n";
        }

        return args.join(" ") === "rev-parse --abbrev-ref HEAD" ? "feature/demo\n" : "";
      },
      showInformationMessage
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "push origin HEAD:feature/demo",
      "rev-parse --abbrev-ref HEAD"
    ]);
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Pushed feature/demo. Create a pull request?",
      "Create Pull Request",
      "Dismiss"
    );
  });

  it("publishes the current branch to a same-name remote branch when selected", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue({
      label: "Create or update origin/feature",
      value: "same-name:origin"
    });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          throw new Error("fatal: no upstream configured for branch 'feature'");
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        if (args.join(" ") === "remote") {
          return "origin\n";
        }

        if (args.join(" ") === "branch -r") {
          return "  origin/chore/all-my-stuffs\n";
        }

        return "";
      },
      showQuickPick
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "remote",
      "branch -r",
      "push -u origin HEAD:feature",
      "rev-parse --abbrev-ref HEAD"
    ]);
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Create or update origin/feature", value: "same-name:origin" },
        { label: "Push to origin/chore/all-my-stuffs", value: "branch:origin/chore/all-my-stuffs" }
      ],
      { placeHolder: "Select push target for feature" }
    );
  });

  it("pushes to a selected remote branch when no upstream exists", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue({
      label: "Push to origin/chore/all-my-stuffs",
      value: "branch:origin/chore/all-my-stuffs"
    });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          throw new Error("fatal: no upstream configured for branch 'feature'");
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        if (args.join(" ") === "remote") {
          return "origin\n";
        }

        if (args.join(" ") === "branch -r") {
          return "  origin/chore/all-my-stuffs\n";
        }

        return "";
      },
      showQuickPick
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "remote",
      "branch -r",
      "push -u origin HEAD:chore/all-my-stuffs",
      "rev-parse --abbrev-ref HEAD"
    ]);
  });

  it("prompts before pushing to a differently named upstream branch", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue({
      label: "Push to upstream origin/chore/all-my-stuffs",
      value: "upstream:origin/chore/all-my-stuffs"
    });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          return "origin/chore/all-my-stuffs\n";
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        if (args.join(" ") === "remote") {
          return "origin\n";
        }

        if (args.join(" ") === "branch -r") {
          return "  origin/chore/all-my-stuffs\n";
        }

        return "";
      },
      showQuickPick
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "remote",
      "branch -r",
      "push origin HEAD:chore/all-my-stuffs",
      "rev-parse --abbrev-ref HEAD"
    ]);
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Push to upstream origin/chore/all-my-stuffs", value: "upstream:origin/chore/all-my-stuffs" },
        { label: "Create or update origin/feature", value: "same-name:origin" }
      ],
      { placeHolder: "Select push target for feature" }
    );
  });

  it("cancels push when the target picker is dismissed", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue(undefined);
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          throw new Error("fatal: no upstream configured for branch 'feature'");
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        if (args.join(" ") === "remote") {
          return "origin\n";
        }

        if (args.join(" ") === "branch -r") {
          return "";
        }

        return "";
      },
      showQuickPick
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push cancelled", status: "cancelled" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "remote",
      "branch -r"
    ]);
  });

  it("clones into the target directory and checks out branches", async () => {
    const calls: string[] = [];
    const logs: unknown[] = [];
    const service = createService({
      gitClone: async (targetDirectory, url) => {
        calls.push(`clone ${url} ${targetDirectory}`);
      },
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
      },
      logger: {
        debug: () => undefined,
        info: (_message, context) => logs.push(context)
      }
    });

    await expect(service.clone("/target", "https://example.com/repo.git")).resolves.toEqual({
      message: "Clone completed",
      status: "ok"
    });
    await expect(service.checkout("/repo", "feature/demo")).resolves.toEqual({
      message: "Checked out feature/demo",
      status: "ok"
    });

    expect(calls).toEqual(["clone https://example.com/repo.git /target", "checkout feature/demo"]);
    expect(logs).toEqual([
      { command: "git -C /target clone https://example.com/repo.git ." },
      { command: "git -C /repo checkout feature/demo" }
    ]);
  });

  it("uses backend quick picks for advanced pull and push", async () => {
    const calls: string[] = [];
    let conflictContext: unknown;
    const showInformationMessage = vi.fn().mockResolvedValue("Force Push");
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "Rebase", value: "rebase" })
      .mockResolvedValueOnce({ label: "origin/main", value: "origin/main" })
      .mockResolvedValueOnce({ label: "origin/feature", value: "origin/feature" })
      .mockResolvedValueOnce({ label: "Force with lease", value: "force-with-lease" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  origin/feature\n";
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        return "";
      },
      safetyService: {
        runWithAutoStash: async (_repositoryRoot, _preference, operation, conflict) => {
          conflictContext = conflict;
          return operation();
        }
      },
      settingsService: {
        getSettings: () => ({ autoStashOnPull: "ask" })
      },
      showQuickPick,
      showInformationMessage
    });

    await expect(service.advancedPull("/repo")).resolves.toEqual({ message: "Advanced pull completed", status: "ok" });
    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(calls).toEqual([
      "branch -r",
      "pull --rebase origin main",
      "branch -r",
      "push --force-with-lease origin HEAD:feature",
      "rev-parse --abbrev-ref HEAD"
    ]);
    expect(conflictContext).toEqual({
      abortArgs: ["rebase", "--abort"],
      continueArgs: ["rebase", "--continue"],
      operationKind: "rebase",
      operationName: "Rebase"
    });
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Force push to origin/feature with lease?",
      "Force Push",
      "Cancel"
    );
  });

  it("cancels advanced force push when confirmation is dismissed", async () => {
    const calls: string[] = [];
    const showInformationMessage = vi.fn().mockResolvedValue(undefined);
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "origin/feature", value: "origin/feature" })
      .mockResolvedValueOnce({ label: "Force with lease", value: "force-with-lease" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "  origin/feature\n";
      },
      showInformationMessage,
      showQuickPick
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({
      message: "Advanced push cancelled",
      status: "cancelled"
    });

    expect(calls).toEqual(["branch -r"]);
  });

  it("continues and aborts active git conflict sessions through safety service", async () => {
    const calls: string[] = [];
    const service = createService({
      safetyService: {
        abortOperation: async (repositoryRoot) => {
          calls.push(`abort ${repositoryRoot}`);
          return { message: "aborted", status: "cancelled" };
        },
        continueOperation: async (repositoryRoot) => {
          calls.push(`continue ${repositoryRoot}`);
          return { message: "continued", status: "ok" };
        },
        getOperationState: async (repositoryRoot) => {
          calls.push(`state ${repositoryRoot}`);
          return { message: "ok", status: "ok" };
        },
        runWithAutoStash: async (_repositoryRoot, _preference, operation) => operation()
      }
    });

    await expect(service.continueOperation("/repo")).resolves.toEqual({ message: "continued", status: "ok" });
    await expect(service.abortOperation("/repo")).resolves.toEqual({ message: "aborted", status: "cancelled" });
    await expect(service.getOperationState("/repo")).resolves.toEqual({ message: "ok", status: "ok" });
    expect(calls).toEqual(["continue /repo", "abort /repo", "state /repo"]);
  });

  it("runs confirmed commit context git operations", async () => {
    const calls: string[] = [];
    const clipboardWrites: string[] = [];
    const showInputBox = vi
      .fn()
      .mockResolvedValueOnce("feature/from-context")
      .mockResolvedValueOnce("origin/review")
      .mockResolvedValueOnce("Updated subject")
      .mockResolvedValueOnce("Squashed subject");
    const showQuickPick = vi.fn().mockResolvedValue({ label: "+ Create new remote branch", value: "__create__" });
    const showInformationMessage = vi.fn().mockResolvedValue(undefined);
    const showWarningMessage = vi.fn().mockResolvedValue("Continue");
    const service = createService({
      clipboardWrite: async (text) => {
        clipboardWrites.push(text);
      },
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        if (args.join(" ") === "show --no-patch --format=%s abc123") {
          return "Old subject\n";
        }

        if (args.join(" ") === "rev-parse HEAD") {
          return "abc123\n";
        }

        if (args.join(" ") === "rev-parse abc123^") {
          return "old456\n";
        }

        if (args.join(" ") === "rev-parse old456^") {
          return "parent000\n";
        }

        if (args.join(" ") === "diff --numstat abc123 def456") {
          return "2\t1\tsrc/shared.ts\n";
        }

        if (args.join(" ") === "diff --name-status abc123 def456") {
          return "M\tsrc/shared.ts\n";
        }

        return "";
      },
      showInformationMessage,
      showInputBox,
      showQuickPick,
      showWarningMessage
    });

    await expect(service.copyHash("abc123")).resolves.toEqual({ message: "Copied abc123", status: "ok" });
    await expect(service.cherryPick("/repo", "abc123")).resolves.toEqual({ message: "Cherry-pick completed", status: "ok" });
    await expect(service.revert("/repo", "abc123")).resolves.toEqual({ message: "Revert completed", status: "ok" });
    await expect(service.reset("/repo", "abc123", "hard")).resolves.toEqual({ message: "Reset hard completed", status: "ok" });
    await expect(service.compareCommits("/repo", ["abc123", "def456"])).resolves.toEqual({
      files: [
        {
          binary: false,
          deletions: 1,
          insertions: 2,
          path: "src/shared.ts",
          status: "modified"
        }
      ],
      result: {
        message: "Compared abc123 and def456",
        status: "ok"
      }
    });
    await expect(service.createBranchFromCommit("/repo", "abc123")).resolves.toEqual({
      message: "Created branch feature/from-context",
      status: "ok"
    });
    await expect(service.pushAllCommitsToHere("/repo", "abc123")).resolves.toEqual({
      message: "Pushed commits to origin/review",
      status: "ok"
    });
    await expect(service.editCommitMessage("/repo", "abc123")).resolves.toEqual({
      message: "Commit message updated",
      status: "ok"
    });
    await expect(service.squashCommits("/repo", ["abc123", "old456"])).resolves.toEqual({
      message: "Squashed 2 commits",
      status: "ok"
    });

    expect(clipboardWrites).toEqual(["abc123"]);
    expect(calls).toEqual([
      "cherry-pick abc123",
      "revert --no-edit abc123",
      "reset --hard abc123",
      "diff --numstat abc123 def456",
      "diff --name-status abc123 def456",
      "branch feature/from-context abc123",
      "branch -r",
      "push origin abc123:refs/heads/review",
      "show --no-patch --format=%s abc123",
      "rev-parse HEAD",
      "commit --amend -m Updated subject",
      "rev-parse HEAD",
      "rev-parse abc123^",
      "rev-parse old456^",
      "reset --soft parent000",
      "commit -m Squashed subject"
    ]);
    expect(showWarningMessage).toHaveBeenCalledTimes(5);
  });

  it("offers to checkout a branch after creating it", async () => {
    const calls: string[] = [];
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
      },
      showInformationMessage: vi.fn().mockResolvedValue("Checkout branch"),
      showInputBox: vi.fn().mockResolvedValue("feature/from-context")
    });

    await expect(service.createBranchFromCommit("/repo", "abc123")).resolves.toEqual({
      message: "Created and checked out branch feature/from-context",
      status: "ok"
    });
    expect(calls).toEqual(["branch feature/from-context abc123", "checkout feature/from-context"]);
  });

  it("cancels squash when selected commits are not a first-parent range ending at HEAD", async () => {
    const calls: string[] = [];
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse HEAD") {
          return "abc123\n";
        }

        if (args.join(" ") === "rev-parse abc123^") {
          return "not-old456\n";
        }

        return "";
      }
    });

    await expect(service.squashCommits("/repo", ["abc123", "old456"])).resolves.toEqual({
      message: "Selected commits are not a consecutive range ending at HEAD",
      status: "cancelled"
    });
    expect(calls).toEqual(["rev-parse HEAD", "rev-parse abc123^"]);
  });

  it("cancels commit context operations when required input is dismissed", async () => {
    const calls: string[] = [];
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return args.join(" ") === "show --no-patch --format=%s abc123" ? "Old subject\n" : "";
      },
      showInputBox: vi.fn().mockResolvedValue(undefined),
      showWarningMessage: vi.fn().mockResolvedValue(undefined)
    });

    await expect(service.cherryPick("/repo", "abc123")).resolves.toEqual({ message: "Cherry-pick cancelled", status: "cancelled" });
    await expect(service.createBranchFromCommit("/repo", "abc123")).resolves.toEqual({ message: "Create branch cancelled", status: "cancelled" });
    await expect(service.editCommitMessage("/repo", "abc123")).resolves.toEqual({ message: "Edit commit message cancelled", status: "cancelled" });

    expect(calls).toEqual(["show --no-patch --format=%s abc123"]);
  });
});

function createService(input: {
  gitClone?: (targetDirectory: string, url: string) => Promise<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  clipboardWrite?: (text: string) => Thenable<void> | Promise<void>;
  safetyService?: {
    abortOperation(repositoryRoot: string): Promise<OperationResultViewModel>;
    continueOperation(repositoryRoot: string): Promise<OperationResultViewModel>;
    getOperationState(repositoryRoot: string): Promise<OperationResultViewModel>;
    runWithAutoStash(
      repositoryRoot: string,
      preference: "ask" | "always" | "never",
      operation: () => Promise<OperationResultViewModel>,
      conflict?: {
        abortArgs: readonly string[];
        continueArgs: readonly string[];
        operationKind: "merge" | "rebase";
        operationName: string;
      }
    ): Promise<OperationResultViewModel>;
  };
  settingsService?: {
    getSettings(): { autoStashOnPull: "ask" | "always" | "never" };
  };
  showInformationMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined> | Promise<string | undefined>;
  showInputBox?: (options: { placeHolder?: string; prompt: string; value?: string }) => Thenable<string | undefined> | Promise<string | undefined>;
  showQuickPick?: (
    items: readonly { label: string; value: string }[],
    options: { placeHolder: string }
  ) => Thenable<{ label: string; value: string } | undefined> | Promise<{ label: string; value: string } | undefined>;
  showWarningMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined> | Promise<string | undefined>;
  logger?: {
    debug(message: string, context?: unknown): void;
    info(message: string, context?: unknown): void;
  };
}): GitService {
  return new GitService({
    gitClone: input.gitClone,
    gitRaw: input.gitRaw ?? (async () => ""),
    clipboardWrite: input.clipboardWrite,
    safetyService:
      input.safetyService ??
      ({
        abortOperation: async () => ({ message: "aborted", status: "cancelled" }),
        continueOperation: async () => ({ message: "continued", status: "ok" }),
        getOperationState: async () => ({ message: "ok", status: "ok" }),
        runWithAutoStash: async (_repositoryRoot, _preference, operation) => operation()
      } as never),
    settingsService:
      input.settingsService ??
      ({
        getSettings: () => ({ autoStashOnPull: "ask" })
      } as never),
    logger: input.logger,
    showInformationMessage: input.showInformationMessage,
    showInputBox: input.showInputBox,
    showQuickPick: input.showQuickPick,
    showWarningMessage: input.showWarningMessage
  });
}
