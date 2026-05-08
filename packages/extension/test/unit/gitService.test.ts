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
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
      },
      safetyService: {
        runWithAutoStash: async (repositoryRoot, preference, operation) => {
          calls.push(`safety ${repositoryRoot} ${preference}`);
          return operation();
        }
      },
      settingsService: {
        getSettings: () => ({ autoStashOnPull: "always" })
      }
    });

    await expect(service.pull("/repo")).resolves.toEqual({ message: "Pull completed", status: "ok" });
    expect(calls).toEqual(["safety /repo always", "pull"]);
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
    await expect(service.fetch("/repo")).resolves.toEqual({ message: "Fetch completed", status: "ok" });

    expect(calls).toEqual(["push", "rev-parse --abbrev-ref HEAD", "fetch --all --prune"]);
    expect(showInformationMessage).toHaveBeenCalledWith(
      "Pushed feature/demo. Create a pull request?",
      "Create Pull Request",
      "Dismiss"
    );
  });

  it("clones into the target directory and checks out branches", async () => {
    const calls: string[] = [];
    const service = createService({
      gitClone: async (targetDirectory, url) => {
        calls.push(`clone ${url} ${targetDirectory}`);
      },
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
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
  });

  it("uses backend quick picks for advanced pull and push", async () => {
    const calls: string[] = [];
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
        runWithAutoStash: async (_repositoryRoot, _preference, operation) => operation()
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
});

function createService(input: {
  gitClone?: (targetDirectory: string, url: string) => Promise<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  safetyService?: {
    runWithAutoStash(
      repositoryRoot: string,
      preference: "ask" | "always" | "never",
      operation: () => Promise<OperationResultViewModel>
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
}): GitService {
  return new GitService({
    gitClone: input.gitClone,
    gitRaw: input.gitRaw ?? (async () => ""),
    safetyService:
      input.safetyService ??
      ({
        runWithAutoStash: async (_repositoryRoot, _preference, operation) => operation()
      } as never),
    settingsService:
      input.settingsService ??
      ({
        getSettings: () => ({ autoStashOnPull: "ask" })
      } as never),
    showInformationMessage: input.showInformationMessage,
    showQuickPick: input.showQuickPick
  });
}
