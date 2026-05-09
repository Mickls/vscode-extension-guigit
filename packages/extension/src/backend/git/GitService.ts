import { simpleGit } from "simple-git";
import { window } from "vscode";
import type { OperationResultViewModel } from "../rpc/contract";
import type { ConflictResolutionInput, SafetyService } from "./SafetyService";
import type { SettingsService } from "../../state/SettingsService";
import type { Logger } from "../../logging/LoggerService";

interface QuickPickItem {
  label: string;
  value: string;
}

export interface GitServiceInput {
  gitClone?: (targetDirectory: string, url: string) => Promise<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug" | "info">;
  safetyService: Pick<SafetyService, "abortOperation" | "continueOperation" | "getOperationState" | "runWithAutoStash">;
  settingsService: Pick<SettingsService, "getSettings">;
  showInformationMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  showQuickPick?: (items: readonly QuickPickItem[], options: { placeHolder: string }) => Thenable<QuickPickItem | undefined>;
}

export class GitService {
  private readonly gitClone: (targetDirectory: string, url: string) => Promise<void>;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug" | "info"> | undefined;
  private readonly safetyService: Pick<SafetyService, "abortOperation" | "continueOperation" | "getOperationState" | "runWithAutoStash">;
  private readonly settingsService: Pick<SettingsService, "getSettings">;
  private readonly showInformationMessage: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  private readonly showQuickPick: (items: readonly QuickPickItem[], options: { placeHolder: string }) => Thenable<QuickPickItem | undefined>;

  public constructor(input: GitServiceInput) {
    this.gitClone = input.gitClone ?? (async (targetDirectory, url) => {
      await simpleGit(targetDirectory).clone(url, ".");
    });
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.safetyService = input.safetyService;
    this.settingsService = input.settingsService;
    this.showInformationMessage =
      input.showInformationMessage ??
      ((message, ...items) => window.showInformationMessage(message, ...items));
    this.showQuickPick =
      input.showQuickPick ??
      ((items, options) => window.showQuickPick([...items], options));
  }

  public async pull(repositoryRoot: string): Promise<OperationResultViewModel> {
    if (!(await this.ensureTrackingBranch(repositoryRoot))) {
      return { message: "Pull cancelled", status: "cancelled" };
    }

    return this.runPullWithSafety(repositoryRoot, ["pull", "--no-rebase"], "Pull completed");
  }

  public async advancedPull(repositoryRoot: string): Promise<OperationResultViewModel> {
    const mode = await this.showQuickPick(
      [
        { label: "Merge", value: "merge" },
        { label: "Rebase", value: "rebase" }
      ],
      { placeHolder: "Select pull mode" }
    );
    if (!mode) {
      return { message: "Advanced pull cancelled", status: "cancelled" };
    }

    const branch = await this.pickRemoteBranch(repositoryRoot, "Select remote branch to pull");
    if (!branch) {
      return { message: "Advanced pull cancelled", status: "cancelled" };
    }

    const remoteTarget = splitRemoteBranch(branch.value);
    const args = mode.value === "rebase"
      ? ["pull", "--rebase", remoteTarget.remote, remoteTarget.branch]
      : ["pull", "--no-rebase", remoteTarget.remote, remoteTarget.branch];

    return this.runPullWithSafety(repositoryRoot, args, "Advanced pull completed");
  }

  public async push(repositoryRoot: string): Promise<OperationResultViewModel> {
    this.logger?.debug("git.push", { repositoryRoot });
    await this.runGitRaw(repositoryRoot, await this.getPushArgs(repositoryRoot));
    void this.promptPullRequestForCurrentBranch(repositoryRoot).catch((error: unknown) => {
      this.logger?.debug("git.pullRequestPrompt.failed", {
        error: error instanceof Error ? error.message : String(error),
        repositoryRoot
      });
    });

    return {
      message: "Push completed",
      status: "ok"
    };
  }

  public async advancedPush(repositoryRoot: string): Promise<OperationResultViewModel> {
    const branch = await this.pickRemoteBranch(repositoryRoot, "Select remote branch to push");
    if (!branch) {
      return { message: "Advanced push cancelled", status: "cancelled" };
    }

    const forceMode = await this.showQuickPick(
      [
        { label: "Normal", value: "normal" },
        { label: "Force with lease", value: "force-with-lease" }
      ],
      { placeHolder: "Select push mode" }
    );
    if (!forceMode) {
      return { message: "Advanced push cancelled", status: "cancelled" };
    }

    const remoteTarget = splitRemoteBranch(branch.value);
    if (forceMode.value === "force-with-lease") {
      const confirmation = await this.showInformationMessage(
        `Force push to ${branch.value} with lease?`,
        "Force Push",
        "Cancel"
      );
      if (confirmation !== "Force Push") {
        return { message: "Advanced push cancelled", status: "cancelled" };
      }
    }

    const args =
      forceMode.value === "force-with-lease"
        ? ["push", "--force-with-lease", remoteTarget.remote, `HEAD:${remoteTarget.branch}`]
        : ["push", remoteTarget.remote, `HEAD:${remoteTarget.branch}`];

    this.logger?.debug("git.advancedPush", { args, repositoryRoot });
    await this.runGitRaw(repositoryRoot, args);
    void this.promptPullRequestForCurrentBranch(repositoryRoot).catch((error: unknown) => {
      this.logger?.debug("git.pullRequestPrompt.failed", {
        error: error instanceof Error ? error.message : String(error),
        repositoryRoot
      });
    });

    return {
      message: "Advanced push completed",
      status: "ok"
    };
  }

  public async fetch(repositoryRoot: string): Promise<OperationResultViewModel> {
    this.logger?.debug("git.fetch", { repositoryRoot });
    await this.runGitRaw(repositoryRoot, ["fetch", "--all", "--prune"]);

    return {
      message: "Fetch completed",
      status: "ok"
    };
  }

  public async clone(targetDirectory: string, url: string): Promise<OperationResultViewModel> {
    this.logger?.debug("git.clone", { targetDirectory, url });
    this.logGitCommand(targetDirectory, ["clone", url, "."]);
    await this.gitClone(targetDirectory, url);

    return {
      message: "Clone completed",
      status: "ok"
    };
  }

  public async checkout(repositoryRoot: string, branch: string): Promise<OperationResultViewModel> {
    this.logger?.debug("git.checkout", { branch, repositoryRoot });
    await this.runGitRaw(repositoryRoot, ["checkout", branch]);

    return {
      message: `Checked out ${branch}`,
      status: "ok"
    };
  }

  public async continueOperation(repositoryRoot: string): Promise<OperationResultViewModel> {
    return this.safetyService.continueOperation(repositoryRoot);
  }

  public async abortOperation(repositoryRoot: string): Promise<OperationResultViewModel> {
    return this.safetyService.abortOperation(repositoryRoot);
  }

  public async getOperationState(repositoryRoot: string): Promise<OperationResultViewModel> {
    return this.safetyService.getOperationState(repositoryRoot);
  }

  private async runPullWithSafety(
    repositoryRoot: string,
    args: readonly string[],
    message: string
  ): Promise<OperationResultViewModel> {
    const preference = this.settingsService.getSettings().autoStashOnPull;
    const conflict = getPullConflictResolution(args);
    return this.safetyService.runWithAutoStash(repositoryRoot, preference, async () => {
      this.logger?.debug("git.pull", { args, repositoryRoot });
      await this.runGitRaw(repositoryRoot, args);

      return {
        message,
        status: "ok"
      };
    }, conflict);
  }

  private async pickRemoteBranch(repositoryRoot: string, placeHolder: string): Promise<QuickPickItem | undefined> {
    const branches = parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"]));
    return this.showQuickPick(
      branches.map((branch) => ({ label: branch, value: branch })),
      { placeHolder }
    );
  }

  private async ensureTrackingBranch(repositoryRoot: string): Promise<boolean> {
    try {
      await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
      return true;
    } catch (error) {
      this.logger?.debug("git.pull.missingUpstream", {
        error: error instanceof Error ? error.message : String(error),
        repositoryRoot
      });
    }

    const currentBranch = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const branch = await this.pickRemoteBranch(repositoryRoot, `Select upstream branch for ${currentBranch}`);
    if (!branch) {
      return false;
    }

    await this.runGitRaw(repositoryRoot, ["branch", "--set-upstream-to", branch.value, currentBranch]);
    return true;
  }

  private async getPushArgs(repositoryRoot: string): Promise<readonly string[]> {
    try {
      const upstream = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])).trim();
      const remoteTarget = splitRemoteBranch(upstream);
      return ["push", remoteTarget.remote, `HEAD:${remoteTarget.branch}`];
    } catch (error) {
      this.logger?.debug("git.push.missingUpstream", {
        error: error instanceof Error ? error.message : String(error),
        repositoryRoot
      });
    }

    const currentBranch = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const remote = await this.pickRemote(repositoryRoot, `Select remote to publish ${currentBranch}`);
    if (!remote) {
      throw new Error("Push cancelled");
    }

    return ["push", "-u", remote.value, currentBranch];
  }

  private async pickRemote(repositoryRoot: string, placeHolder: string): Promise<QuickPickItem | undefined> {
    const remotes = (await this.runGitRaw(repositoryRoot, ["remote"]))
      .split("\n")
      .map((remote) => remote.trim())
      .filter((remote) => remote.length > 0);
    return this.showQuickPick(
      remotes.map((remote) => ({ label: remote, value: remote })),
      { placeHolder }
    );
  }

  private async promptPullRequestForCurrentBranch(repositoryRoot: string): Promise<void> {
    const branch = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (branch !== "main" && branch !== "master") {
      await this.showInformationMessage(`Pushed ${branch}. Create a pull request?`, "Create Pull Request", "Dismiss");
    }
  }

  private async runGitRaw(repositoryRoot: string, args: readonly string[]): Promise<string> {
    this.logGitCommand(repositoryRoot, args);
    return this.gitRaw(repositoryRoot, args);
  }

  private logGitCommand(repositoryRoot: string, args: readonly string[]): void {
    this.logger?.info("git.command", {
      command: `git -C ${repositoryRoot} ${args.join(" ")}`
    });
  }
}

function parseRemoteBranches(output: string): readonly string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes("HEAD ->"));
}

function splitRemoteBranch(branch: string): { branch: string; remote: string } {
  const separatorIndex = branch.indexOf("/");
  return {
    branch: branch.slice(separatorIndex + 1),
    remote: branch.slice(0, separatorIndex)
  };
}

function getPullConflictResolution(args: readonly string[]): ConflictResolutionInput {
  if (args.includes("--rebase")) {
    return {
      abortArgs: ["rebase", "--abort"],
      continueArgs: ["rebase", "--continue"],
      operationKind: "rebase",
      operationName: "Rebase"
    };
  }

  return {
    abortArgs: ["merge", "--abort"],
    continueArgs: ["commit", "--no-edit"],
    operationKind: "merge",
    operationName: "Pull"
  };
}
