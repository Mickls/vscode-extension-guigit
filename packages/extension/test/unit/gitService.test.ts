import { describe, expect, it, vi } from "vitest";
import { window } from "vscode";
import { GitService } from "../../src/backend/git/GitService";
import type { OperationResultViewModel } from "../../src/backend/rpc/contract";

vi.mock("vscode", () => ({
  env: {
    clipboard: {
      writeText: vi.fn()
    }
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath })
  },
  window: {
    createQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showOpenDialog: vi.fn(),
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
      },
      showInputBox: vi.fn().mockResolvedValue("https://example.com/repo.git"),
      showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: "/target" }]),
      showQuickPick: vi.fn().mockResolvedValue({ label: "feature/demo", value: "feature/demo" })
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
    const openedUrls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue({ label: "Open Pull Request", value: "open-pull-request" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          return "origin/feature/demo\n";
        }

        if (args.join(" ") === "remote get-url origin") {
          return "git@github.com:owner/repo.git\n";
        }

        return args.join(" ") === "rev-parse --abbrev-ref HEAD" ? "feature/demo\n" : "";
      },
      openExternal: async (url) => {
        openedUrls.push(url);
      },
      showQuickPick
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    await Promise.resolve();
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "push origin HEAD:feature/demo",
      "rev-parse --abbrev-ref HEAD",
      "remote get-url origin"
    ]);
    await expect(service.fetch("/repo")).resolves.toEqual({ message: "Fetch completed", status: "ok" });

    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "push origin HEAD:feature/demo",
      "rev-parse --abbrev-ref HEAD",
      "remote get-url origin",
      "fetch --all --prune"
    ]);
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Open Pull Request", value: "open-pull-request" },
        { label: "Dismiss", value: "dismiss" }
      ],
      { placeHolder: "Pushed feature/demo. Create a pull request?" }
    );
    expect(openedUrls).toEqual(["https://github.com/owner/repo/pull/new/feature%2Fdemo"]);
  });

  it("checks out a picked branch", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue({ label: "feature/demo", value: "feature/demo" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch --all --format=%(refname:short)") {
          return "main\nfeature/demo\norigin/release\n";
        }

        return "";
      },
      showQuickPick
    });

    await expect(service.checkout("/repo")).resolves.toEqual({ message: "Checked out feature/demo", status: "ok" });
    expect(calls).toEqual(["branch --all --format=%(refname:short)", "checkout feature/demo"]);
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "main", value: "main" },
        { label: "feature/demo", value: "feature/demo" },
        { label: "origin/release", value: "origin/release" }
      ],
      { placeHolder: "Select branch to checkout" }
    );
  });

  it("prompts for clone url and target directory", async () => {
    const cloneCalls: unknown[] = [];
    const service = createService({
      gitClone: async (targetDirectory, url, destinationDirectoryName) => {
        cloneCalls.push([targetDirectory, url, destinationDirectoryName]);
      },
      showInputBox: vi.fn().mockResolvedValue("https://example.com/repo.git"),
      showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: "/target" }])
    });

    await expect(service.clone()).resolves.toEqual({ message: "Clone completed", status: "ok" });
    expect(cloneCalls).toEqual([["/target", "https://example.com/repo.git", "repo"]]);
  });

  it("derives the clone target directory from scp-like repository urls", async () => {
    const cloneCalls: unknown[] = [];
    const service = createService({
      gitClone: async (targetDirectory, url, destinationDirectoryName) => {
        cloneCalls.push([targetDirectory, url, destinationDirectoryName]);
      },
      showInputBox: vi.fn().mockResolvedValue("git@example.com:owner/repo.git"),
      showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: "/target" }])
    });

    await expect(service.clone()).resolves.toEqual({ message: "Clone completed", status: "ok" });
    expect(cloneCalls).toEqual([["/target", "git@example.com:owner/repo.git", "repo"]]);
  });

  it("initializes git in the workspace folder", async () => {
    const calls: string[] = [];
    const service = createService({
      gitRaw: async (repositoryRoot, args) => {
        calls.push(`${repositoryRoot}:${args.join(" ")}`);
        return "";
      },
      workspaceFolders: ["/workspace"]
    });

    await expect(service.init()).resolves.toEqual({
      message: "Initialized Git repository in workspace",
      status: "ok"
    });
    expect(calls).toEqual(["/workspace:init"]);
  });

  it("asks which workspace folder to initialize when multiple folders are open", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn().mockResolvedValue({ label: "api", value: "/workspace/api" });
    const service = createService({
      gitRaw: async (repositoryRoot, args) => {
        calls.push(`${repositoryRoot}:${args.join(" ")}`);
        return "";
      },
      showQuickPick,
      workspaceFolders: ["/workspace/app", "/workspace/api"]
    });

    await expect(service.init()).resolves.toEqual({
      message: "Initialized Git repository in api",
      status: "ok"
    });
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "app", value: "/workspace/app" },
        { label: "api", value: "/workspace/api" }
      ],
      { placeHolder: "Select workspace folder to initialize" }
    );
    expect(calls).toEqual(["/workspace/api:init"]);
  });

  it("cancels initialize when no workspace folder is open", async () => {
    const service = createService({});

    await expect(service.init()).resolves.toEqual({
      message: "No workspace folder found",
      status: "cancelled"
    });
  });

  it("completes push without waiting for the pull request prompt", async () => {
    const calls: string[] = [];
    const showQuickPick = vi.fn(() => new Promise<{ label: string; value: string } | undefined>(() => undefined));
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
          return "origin/feature/demo\n";
        }

        return args.join(" ") === "rev-parse --abbrev-ref HEAD" ? "feature/demo\n" : "";
      },
      showQuickPick
    });

    await expect(service.push("/repo")).resolves.toEqual({ message: "Push completed", status: "ok" });
    expect(calls).toEqual([
      "rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "rev-parse --abbrev-ref HEAD",
      "push origin HEAD:feature/demo",
      "rev-parse --abbrev-ref HEAD"
    ]);
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Open Pull Request", value: "open-pull-request" },
        { label: "Dismiss", value: "dismiss" }
      ],
      { placeHolder: "Pushed feature/demo. Create a pull request?" }
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
      gitClone: async (targetDirectory, url, destinationDirectoryName) => {
        calls.push(`clone ${url} ${targetDirectory} ${destinationDirectoryName}`);
      },
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
      },
      logger: {
        debug: () => undefined,
        info: (_message, context) => logs.push(context)
      },
      showInputBox: vi.fn().mockResolvedValue("https://example.com/repo.git"),
      showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: "/target" }]),
      showQuickPick: vi.fn().mockResolvedValue({ label: "feature/demo", value: "feature/demo" })
    });

    await expect(service.clone()).resolves.toEqual({
      message: "Clone completed",
      status: "ok"
    });
    await expect(service.checkout("/repo")).resolves.toEqual({
      message: "Checked out feature/demo",
      status: "ok"
    });

    expect(calls).toEqual(["clone https://example.com/repo.git /target repo", "branch --all --format=%(refname:short)", "checkout feature/demo"]);
    expect(logs).toEqual([
      { command: "git -C /target clone https://example.com/repo.git repo" },
      { command: "git -C /repo branch --all --format=%(refname:short)" },
      { command: "git -C /repo checkout feature/demo" }
    ]);
  });

  it("uses backend quick picks for advanced pull and push", async () => {
    const calls: string[] = [];
    let conflictContext: unknown;
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "Rebase", value: "rebase" })
      .mockResolvedValueOnce({ label: "origin/main", value: "origin/main" })
      .mockResolvedValueOnce({ label: "origin/feature", value: "origin/feature" })
      .mockResolvedValueOnce({ label: "Force with lease", value: "force-with-lease" })
      .mockResolvedValueOnce({ label: "Force Push", value: "confirm" })
      .mockResolvedValueOnce({ label: "Dismiss", value: "dismiss" });
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
      showQuickPick
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
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Force Push", value: "confirm" },
        { label: "Cancel", value: "cancel" }
      ],
      { placeHolder: "Force push to origin/feature with lease?" }
    );
  });

  it("moves the last advanced pull selections to the top", async () => {
    const selectedModes: string[] = [];
    const selectedBranches: string[] = [];
    const showQuickPick = vi.fn((items: readonly { label: string; value: string }[], options: { placeHolder: string }) => {
      if (options.placeHolder === "Select pull mode") {
        selectedModes.push(items[0]!.label);
        return Promise.resolve({ label: "Rebase", value: "rebase" });
      }

      selectedBranches.push(items[0]!.label);
      return Promise.resolve({ label: "origin/feature", value: "origin/feature" });
    });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  origin/feature\n";
        }

        return "";
      },
      showQuickPick
    });

    await expect(service.advancedPull("/repo")).resolves.toEqual({ message: "Advanced pull completed", status: "ok" });
    await expect(service.advancedPull("/repo")).resolves.toEqual({ message: "Advanced pull completed", status: "ok" });

    expect(selectedModes).toEqual(["Merge", "Rebase"]);
    expect(selectedBranches).toEqual(["origin/main", "origin/feature"]);
  });

  it("orders main and master remote branches before other branches by default", async () => {
    const selectedBranches: string[] = [];
    const showQuickPick = vi.fn((items: readonly { label: string; value: string }[], options: { placeHolder: string }) => {
      if (options.placeHolder === "Select pull mode") {
        return Promise.resolve({ label: "Merge", value: "merge" });
      }

      selectedBranches.push(items[0]!.label, items[1]!.label);
      return Promise.resolve({ label: "origin/main", value: "origin/main" });
    });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        if (args.join(" ") === "branch -r") {
          return "  origin/feature\n  upstream/master\n  origin/main\n";
        }

        return "";
      },
      showQuickPick
    });

    await expect(service.advancedPull("/repo")).resolves.toEqual({ message: "Advanced pull completed", status: "ok" });

    expect(selectedBranches).toEqual(["origin/main", "upstream/master"]);
  });

  it("creates a new remote branch from advanced push input", async () => {
    const calls: string[] = [];
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "+ Create new remote branch", value: "__create__" })
      .mockResolvedValueOnce({ label: "Normal", value: "normal" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        if (args.join(" ") === "remote") {
          return "origin\n";
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        return "";
      },
      showInputBox: vi.fn().mockResolvedValue("feature/new-branch"),
      showQuickPickWithInput: vi.fn().mockResolvedValue({ label: "+ Create new remote branch", value: "__create__" }),
      showQuickPick
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(calls).toEqual([
      "branch -r",
      "rev-parse --abbrev-ref HEAD",
      "push origin HEAD:feature/new-branch",
      "rev-parse --abbrev-ref HEAD"
    ]);
  });

  it("creates a new remote branch when advanced push input has no branch match", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "origin/feature/new-branch",
      value: "origin/feature/new-branch"
    });
    const showQuickPick = vi.fn().mockResolvedValue({ label: "Normal", value: "normal" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        if (args.join(" ") === "remote") {
          return "origin\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(showQuickPickWithInput).toHaveBeenCalledWith(
      [
        { label: "origin/main", value: "origin/main" },
        { label: "+ Create new remote branch", value: "__create__" }
      ],
      { createRemote: "origin", placeHolder: "Select remote branch to push", remotes: ["origin"] }
    );
    expect(calls).toEqual([
      "branch -r",
      "push origin HEAD:feature/new-branch",
      "rev-parse --abbrev-ref HEAD"
    ]);
  });

  it("preserves an explicit remote when advanced push input has no branch match", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "upstream/feature/new-branch",
      value: "upstream/feature/new-branch"
    });
    const showQuickPick = vi.fn().mockResolvedValue({ label: "Normal", value: "normal" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  upstream/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(calls).toEqual([
      "branch -r",
      "push upstream HEAD:feature/new-branch",
      "rev-parse --abbrev-ref HEAD"
    ]);
  });

  it("preserves an explicit remote typed into the advanced push picker", async () => {
    const calls: string[] = [];
    let accept: () => void;
    vi.mocked(window.createQuickPick).mockReturnValueOnce({
      activeItems: [],
      dispose: vi.fn(),
      items: [],
      onDidAccept: (listener: () => void) => {
        accept = listener;
        return { dispose: vi.fn() };
      },
      onDidHide: () => ({ dispose: vi.fn() }),
      selectedItems: [],
      show: () => accept(),
      value: "upstream/feature/new-branch"
    } as never);
    vi.mocked(window.showQuickPick).mockResolvedValueOnce({ label: "Normal", value: "normal" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  upstream/main\n";
        }

        return "";
      }
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(calls).toEqual([
      "branch -r",
      "push upstream HEAD:feature/new-branch",
      "rev-parse --abbrev-ref HEAD"
    ]);
  });

  it("moves the last advanced push selections to the top", async () => {
    const selectedBranches: string[] = [];
    const selectedModes: string[] = [];
    const showQuickPick = vi.fn((items: readonly { label: string; value: string }[], options: { placeHolder: string }) => {
      if (options.placeHolder === "Select remote branch to push") {
        selectedBranches.push(items[0]!.label);
        return Promise.resolve({ label: "origin/feature", value: "origin/feature" });
      }

      if (options.placeHolder === "Force push to origin/feature with lease?") {
        return Promise.resolve({ label: "Force Push", value: "confirm" });
      }

      if (options.placeHolder === "Pushed feature. Create a pull request?") {
        return Promise.resolve({ label: "Dismiss", value: "dismiss" });
      }

      selectedModes.push(items[0]!.label);
      return Promise.resolve({ label: "Force with lease", value: "force-with-lease" });
    });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  origin/feature\n";
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        return "";
      },
      showQuickPickWithInput: (items) => showQuickPick(items, { placeHolder: "Select remote branch to push" }),
      showQuickPick
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });
    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(selectedBranches).toEqual(["origin/main", "origin/feature"]);
    expect(selectedModes).toEqual(["Normal", "Force with lease"]);
  });

  it("keeps a newly created advanced push target at the top before it appears in remote branches", async () => {
    const secondTargetLabels: string[] = [];
    const showQuickPick = vi.fn((items: readonly { label: string; value: string }[], options: { placeHolder: string }) => {
      if (options.placeHolder === "Select remote branch to push") {
        if (showQuickPick.mock.calls.length === 1) {
          return Promise.resolve({ label: "+ Create new remote branch", value: "__create__" });
        }

        secondTargetLabels.push(items[0]!.label);
        return Promise.resolve({ label: "origin/feature/new-branch", value: "origin/feature/new-branch" });
      }

      return Promise.resolve({ label: "Normal", value: "normal" });
    });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        if (args.join(" ") === "remote") {
          return "origin\n";
        }

        if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
          return "feature\n";
        }

        return "";
      },
      showInputBox: vi.fn().mockResolvedValue("feature/new-branch"),
      showQuickPickWithInput: (items) => showQuickPick(items, { placeHolder: "Select remote branch to push" }),
      showQuickPick
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });
    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(secondTargetLabels).toEqual(["origin/feature/new-branch"]);
  });

  it("cancels advanced force push when confirmation is dismissed", async () => {
    const calls: string[] = [];
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "origin/feature", value: "origin/feature" })
      .mockResolvedValueOnce({ label: "Force with lease", value: "force-with-lease" })
      .mockResolvedValueOnce({ label: "Cancel", value: "cancel" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "  origin/feature\n";
      },
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
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "+ Create new remote branch", value: "__create__" })
      .mockResolvedValueOnce({ label: "Normal", value: "normal" })
      .mockResolvedValueOnce({ label: "Push Commits", value: "confirm" });
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
      "show --no-patch --format=%s abc123",
      "show --no-patch --format=%s old456",
      "reset --soft parent000",
      "commit -m Squashed subject"
    ]);
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Normal", value: "normal" },
        { label: "Force with lease", value: "force-with-lease" }
      ],
      { placeHolder: "Select push mode" }
    );
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Push Commits", value: "confirm" },
        { label: "Cancel", value: "cancel" }
      ],
      { placeHolder: "Push commits up to abc123 to origin/review?" }
    );
    expect(showWarningMessage).toHaveBeenCalledTimes(4);
  });

  it("pushes all commits to a typed default-remote branch target", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "origin/review/topic",
      value: "origin/review/topic"
    });
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "Normal", value: "normal" })
      .mockResolvedValueOnce({ label: "Push Commits", value: "confirm" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.pushAllCommitsToHere("/repo", "abc123")).resolves.toEqual({
      message: "Pushed commits to origin/review/topic",
      status: "ok"
    });

    expect(showQuickPickWithInput).toHaveBeenCalledWith(
      [
        { label: "origin/main", value: "origin/main" },
        { label: "+ Create new remote branch", value: "__create__" }
      ],
      { createRemote: "origin", placeHolder: "Select target remote branch", remotes: ["origin"] }
    );
    expect(calls).toEqual(["branch -r", "push origin abc123:refs/heads/review/topic"]);
  });

  it("pushes all commits to a typed explicit remote branch target", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "upstream/review/topic",
      value: "upstream/review/topic"
    });
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "Normal", value: "normal" })
      .mockResolvedValueOnce({ label: "Push Commits", value: "confirm" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  upstream/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.pushAllCommitsToHere("/repo", "abc123")).resolves.toEqual({
      message: "Pushed commits to upstream/review/topic",
      status: "ok"
    });

    expect(calls).toEqual(["branch -r", "push upstream abc123:refs/heads/review/topic"]);
  });

  it("force pushes all commits to a selected target with lease", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "origin/review/topic",
      value: "origin/review/topic"
    });
    const showQuickPick = vi
      .fn()
      .mockResolvedValueOnce({ label: "Force with lease", value: "force-with-lease" })
      .mockResolvedValueOnce({ label: "Force Push", value: "confirm" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.pushAllCommitsToHere("/repo", "abc123")).resolves.toEqual({
      message: "Force pushed commits to origin/review/topic",
      status: "ok"
    });

    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: "Force Push", value: "confirm" },
        { label: "Cancel", value: "cancel" }
      ],
      { placeHolder: "Force push commits up to abc123 to origin/review/topic with lease?" }
    );
    expect(calls).toEqual(["branch -r", "push --force-with-lease origin abc123:refs/heads/review/topic"]);
  });

  it("cancels push all commits when push mode is dismissed", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "origin/review/topic",
      value: "origin/review/topic"
    });
    const showQuickPick = vi.fn().mockResolvedValue(undefined);
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.pushAllCommitsToHere("/repo", "abc123")).resolves.toEqual({
      message: "Push commits cancelled",
      status: "cancelled"
    });

    expect(calls).toEqual(["branch -r"]);
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

  it("prefills squash commit message with selected commit subjects on separate lines", async () => {
    const calls: string[] = [];
    const showInputBox = vi.fn().mockResolvedValue("Keep subject\nDrop subject");
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-parse HEAD") {
          return "abc123\n";
        }

        if (args.join(" ") === "rev-parse abc123^") {
          return "old456\n";
        }

        if (args.join(" ") === "rev-parse old456^") {
          return "parent000\n";
        }

        if (args.join(" ") === "show --no-patch --format=%s abc123") {
          return "Keep subject\n";
        }

        if (args.join(" ") === "show --no-patch --format=%s old456") {
          return "Drop subject\n";
        }

        return "";
      },
      showInputBox,
      showWarningMessage: vi.fn().mockResolvedValue("Continue")
    });

    await expect(service.squashCommits("/repo", ["abc123", "old456"])).resolves.toEqual({
      message: "Squashed 2 commits",
      status: "ok"
    });

    expect(showInputBox).toHaveBeenCalledWith({
      placeHolder: "Enter squashed commit message",
      prompt: "Squash commit message",
      value: "Keep subject\nDrop subject"
    });
    expect(calls).toEqual([
      "rev-parse HEAD",
      "rev-parse abc123^",
      "rev-parse old456^",
      "show --no-patch --format=%s abc123",
      "show --no-patch --format=%s old456",
      "reset --soft parent000",
      "commit -m Keep subject\nDrop subject"
    ]);
  });

  it("squashes non-consecutive selected commits and replays unselected commits", async () => {
    const calls: string[] = [];
    const showInputBox = vi.fn().mockResolvedValue("Squashed selected work");
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-list --first-parent HEAD") {
          return "head111\nmiddle222\nselected333\nbase444\n";
        }

        if (args.join(" ") === "rev-parse selected333^") {
          return "base444\n";
        }

        if (args.join(" ") === "show --no-patch --format=%s head111") {
          return "Finish feature\n";
        }

        if (args.join(" ") === "show --no-patch --format=%s selected333") {
          return "Start feature\n";
        }

        return "";
      },
      showInputBox,
      showWarningMessage: vi.fn().mockResolvedValue("Continue")
    });

    await expect(service.squashCommits("/repo", ["head111", "selected333"])).resolves.toEqual({
      message: "Squashed 2 commits",
      status: "ok"
    });

    expect(showInputBox).toHaveBeenCalledWith({
      placeHolder: "Enter squashed commit message",
      prompt: "Squash commit message",
      value: "Finish feature\nStart feature"
    });
    expect(calls).toEqual([
      "rev-parse HEAD",
      "rev-list --first-parent HEAD",
      "rev-parse selected333^",
      expect.stringMatching(/^worktree add --detach .* HEAD$/),
      "reset --hard base444",
      "cherry-pick --no-commit selected333",
      "cherry-pick --no-commit head111",
      "commit -m GUI Git History squash preflight",
      "cherry-pick middle222",
      expect.stringMatching(/^worktree remove --force .*/),
      "show --no-patch --format=%s head111",
      "show --no-patch --format=%s selected333",
      "reset --hard base444",
      "cherry-pick --no-commit selected333",
      "cherry-pick --no-commit head111",
      "commit -m Squashed selected work",
      "cherry-pick middle222"
    ]);
  });

  it("runs squash through safety auto-stash handling", async () => {
    const calls: string[] = [];
    let safetyPreference: "ask" | "always" | "never" | undefined;
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "rev-list --first-parent HEAD") {
          return "head111\nmiddle222\nselected333\nbase444\n";
        }

        if (args.join(" ") === "rev-parse selected333^") {
          return "base444\n";
        }

        if (args.join(" ") === "show --no-patch --format=%s head111") {
          return "Finish feature\n";
        }

        if (args.join(" ") === "show --no-patch --format=%s selected333") {
          return "Start feature\n";
        }

        if (args.join(" ") === "status --porcelain") {
          return " M src/file.ts\n";
        }

        return "";
      },
      safetyService: {
        runWithAutoStash: async (repositoryRoot, preference, operation) => {
          safetyPreference = preference;
          calls.push(`safety ${repositoryRoot} ${preference}`);
          return operation();
        }
      },
      settingsService: {
        getSettings: () => ({ autoStashOnPull: "always" })
      },
      showInputBox: vi.fn().mockResolvedValue("Squashed selected work"),
      showWarningMessage: vi.fn().mockResolvedValue("Continue")
    });

    await expect(service.squashCommits("/repo", ["head111", "selected333"])).resolves.toEqual({
      message: "Squashed 2 commits",
      status: "ok"
    });
    expect(safetyPreference).toBe("always");
    expect(calls).toEqual([
      "rev-parse HEAD",
      "rev-list --first-parent HEAD",
      "rev-parse selected333^",
      expect.stringMatching(/^worktree add --detach .* HEAD$/),
      "reset --hard base444",
      "cherry-pick --no-commit selected333",
      "cherry-pick --no-commit head111",
      "commit -m GUI Git History squash preflight",
      "cherry-pick middle222",
      expect.stringMatching(/^worktree remove --force .*/),
      "show --no-patch --format=%s head111",
      "show --no-patch --format=%s selected333",
      "safety /repo always",
      "reset --hard base444",
      "cherry-pick --no-commit selected333",
      "cherry-pick --no-commit head111",
      "commit -m Squashed selected work",
      "cherry-pick middle222"
    ]);
  });

  it("cancels non-consecutive squash before touching the worktree when replay conflicts", async () => {
    const calls: string[] = [];
    let preflightRoot = "";
    const service = createService({
      gitRaw: async (repositoryRoot, args) => {
        calls.push(`${repositoryRoot}: ${args.join(" ")}`);
        if (args.join(" ") === "rev-list --first-parent HEAD") {
          return "head111\nmiddle222\nselected333\nbase444\n";
        }

        if (args.join(" ") === "rev-parse selected333^") {
          return "base444\n";
        }

        if (args.join(" ").startsWith("worktree add --detach ")) {
          preflightRoot = args[3]!;
          return "";
        }

        if (repositoryRoot === preflightRoot && args.join(" ") === "cherry-pick --no-commit head111") {
          throw new Error("CONFLICT (content): could not apply head111");
        }

        return "";
      },
      showWarningMessage: vi.fn().mockResolvedValue("Continue")
    });

    await expect(service.squashCommits("/repo", ["head111", "selected333"])).resolves.toEqual({
      message: "Selected commits cannot be squashed cleanly. Include the dependent commits or resolve the squash manually.",
      status: "cancelled"
    });
    expect(calls.some((call) => call === "/repo: reset --hard base444")).toBe(false);
    expect(calls.some((call) => call === "/repo: cherry-pick --no-commit selected333")).toBe(false);
  });

  it("cancels squash when selected commits are not on the current branch", async () => {
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
      message: "Selected commits are not on the current branch",
      status: "cancelled"
    });
    expect(calls).toEqual(["rev-parse HEAD", "rev-parse abc123^", "rev-list --first-parent HEAD"]);
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
  gitClone?: (targetDirectory: string, url: string, destinationDirectoryName: string) => Promise<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  clipboardWrite?: (text: string) => Thenable<void> | Promise<void>;
  openExternal?: (url: string) => Thenable<void> | Promise<void>;
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
  showOpenDialog?: (options: { canSelectFiles: boolean; canSelectFolders: boolean; canSelectMany: boolean; openLabel: string }) => Thenable<readonly { fsPath: string }[] | undefined> | Promise<readonly { fsPath: string }[] | undefined>;
  showQuickPick?: (
    items: readonly { label: string; value: string }[],
    options: { placeHolder: string }
  ) => Thenable<{ label: string; value: string } | undefined> | Promise<{ label: string; value: string } | undefined>;
  showQuickPickWithInput?: (
    items: readonly { label: string; value: string }[],
    options: { createRemote: string; placeHolder: string }
  ) => Thenable<{ label: string; value: string } | undefined> | Promise<{ label: string; value: string } | undefined>;
  showWarningMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined> | Promise<string | undefined>;
  logger?: {
    debug(message: string, context?: unknown): void;
    info(message: string, context?: unknown): void;
  };
  workspaceFolders?: readonly string[];
}): GitService {
  return new GitService({
    gitClone: input.gitClone,
    gitRaw: input.gitRaw ?? (async () => ""),
    clipboardWrite: input.clipboardWrite,
    openExternal: input.openExternal,
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
    showOpenDialog: input.showOpenDialog,
    showQuickPick: input.showQuickPick,
    showQuickPickWithInput: input.showQuickPickWithInput ?? (
      input.showQuickPick
        ? (items) => input.showQuickPick!(items, { placeHolder: "Select remote branch to push" })
        : undefined
    ),
    showWarningMessage: input.showWarningMessage,
    workspaceFolders: input.workspaceFolders
  });
}
