import { describe, expect, it, vi } from "vitest";
import { GitService } from "../../src/backend/git/GitService";
import type { OperationResultViewModel } from "../../src/backend/rpc/contract";

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: vi.fn(),
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
        return args.join(" ") === "rev-parse --abbrev-ref HEAD" ? "feature/demo\n" : "";
      },
      showInformationMessage
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual(["push", "rev-parse --abbrev-ref HEAD"]);
    await Promise.resolve();
    await expect(service.fetch("/repo")).resolves.toEqual({ message: "Fetch completed", status: "ok" });

    expect(calls).toEqual(["push", "rev-parse --abbrev-ref HEAD", "fetch --all --prune"]);
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
        return args.join(" ") === "rev-parse --abbrev-ref HEAD" ? "feature/demo\n" : "";
      },
      showInformationMessage
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual(["push", "rev-parse --abbrev-ref HEAD"]);
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Pushed feature/demo. Create a pull request?",
      "Create Pull Request",
      "Dismiss"
    );
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
      continueArgs: ["-c", "core.editor=true", "rebase", "--continue"],
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
        runWithAutoStash: async (_repositoryRoot, _preference, operation) => operation()
      }
    });

    await expect(service.continueOperation("/repo")).resolves.toEqual({ message: "continued", status: "ok" });
    await expect(service.abortOperation("/repo")).resolves.toEqual({ message: "aborted", status: "cancelled" });
    expect(calls).toEqual(["continue /repo", "abort /repo"]);
  });
});

function createService(input: {
  gitClone?: (targetDirectory: string, url: string) => Promise<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  safetyService?: {
    abortOperation(repositoryRoot: string): Promise<OperationResultViewModel>;
    continueOperation(repositoryRoot: string): Promise<OperationResultViewModel>;
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
  showQuickPick?: (
    items: readonly { label: string; value: string }[],
    options: { placeHolder: string }
  ) => Thenable<{ label: string; value: string } | undefined> | Promise<{ label: string; value: string } | undefined>;
  logger?: {
    debug(message: string, context?: unknown): void;
    info(message: string, context?: unknown): void;
  };
}): GitService {
  return new GitService({
    gitClone: input.gitClone,
    gitRaw: input.gitRaw ?? (async () => ""),
    safetyService:
      input.safetyService ??
      ({
        abortOperation: async () => ({ message: "aborted", status: "cancelled" }),
        continueOperation: async () => ({ message: "continued", status: "ok" }),
        runWithAutoStash: async (_repositoryRoot, _preference, operation) => operation()
      } as never),
    settingsService:
      input.settingsService ??
      ({
        getSettings: () => ({ autoStashOnPull: "ask" })
      } as never),
    logger: input.logger,
    showInformationMessage: input.showInformationMessage,
    showQuickPick: input.showQuickPick
  });
}
