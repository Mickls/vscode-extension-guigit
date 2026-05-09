import { simpleGit } from "simple-git";
import { env, window } from "vscode";
import type { GitResetMode, OperationResultViewModel, RpcPayloadByType } from "../rpc/contract";
import type { ConflictResolutionInput, SafetyService } from "./SafetyService";
import type { ProxyService } from "./ProxyService";
import type { SettingsService } from "../../state/SettingsService";
import type { Logger } from "../../logging/LoggerService";
import { parseGitFileChanges } from "./FileChangeParser";

interface QuickPickItem {
  label: string;
  value: string;
}

export interface GitServiceInput {
  clipboardWrite?: (text: string) => Thenable<void>;
  gitClone?: (targetDirectory: string, url: string) => Promise<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug" | "info">;
  proxyService?: Pick<ProxyService, "runRaw">;
  safetyService: Pick<SafetyService, "abortOperation" | "continueOperation" | "getOperationState" | "runWithAutoStash">;
  settingsService: Pick<SettingsService, "getSettings">;
  showInformationMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  showInputBox?: (options: { placeHolder?: string; prompt: string; value?: string }) => Thenable<string | undefined>;
  showQuickPick?: (items: readonly QuickPickItem[], options: { placeHolder: string }) => Thenable<QuickPickItem | undefined>;
  showWarningMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
}

export class GitService {
  private readonly clipboardWrite: (text: string) => Thenable<void>;
  private readonly gitClone: (targetDirectory: string, url: string) => Promise<void>;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug" | "info"> | undefined;
  private readonly safetyService: Pick<SafetyService, "abortOperation" | "continueOperation" | "getOperationState" | "runWithAutoStash">;
  private readonly settingsService: Pick<SettingsService, "getSettings">;
  private readonly showInformationMessage: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  private readonly showInputBox: (options: { placeHolder?: string; prompt: string; value?: string }) => Thenable<string | undefined>;
  private readonly showQuickPick: (items: readonly QuickPickItem[], options: { placeHolder: string }) => Thenable<QuickPickItem | undefined>;
  private readonly showWarningMessage: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;

  public constructor(input: GitServiceInput) {
    this.clipboardWrite = input.clipboardWrite ?? ((text) => env.clipboard.writeText(text));
    this.gitClone = input.gitClone ?? (async (targetDirectory, url) => {
      await simpleGit(targetDirectory).clone(url, ".");
    });
    this.gitRaw = input.gitRaw ?? input.proxyService?.runRaw.bind(input.proxyService) ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.safetyService = input.safetyService;
    this.settingsService = input.settingsService;
    this.showInformationMessage =
      input.showInformationMessage ??
      ((message, ...items) => window.showInformationMessage(message, ...items));
    this.showInputBox =
      input.showInputBox ??
      ((options) => window.showInputBox(options));
    this.showQuickPick =
      input.showQuickPick ??
      ((items, options) => window.showQuickPick([...items], options));
    this.showWarningMessage =
      input.showWarningMessage ??
      ((message, ...items) => window.showWarningMessage(message, ...items));
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
    const args = await this.getPushArgs(repositoryRoot);
    if (!args) {
      return { message: "Push cancelled", status: "cancelled" };
    }

    await this.runGitRaw(repositoryRoot, args);
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

  public async copyHash(hash: string): Promise<OperationResultViewModel> {
    await this.clipboardWrite(hash);

    return {
      message: `Copied ${hash.slice(0, 8)}`,
      status: "ok"
    };
  }

  public async cherryPick(repositoryRoot: string, hash: string): Promise<OperationResultViewModel> {
    if (!(await this.confirmCommitOperation(`Cherry-pick commit ${hash.slice(0, 8)}?`))) {
      return { message: "Cherry-pick cancelled", status: "cancelled" };
    }

    await this.runGitRaw(repositoryRoot, ["cherry-pick", hash]);
    return {
      message: "Cherry-pick completed",
      status: "ok"
    };
  }

  public async revert(repositoryRoot: string, hash: string): Promise<OperationResultViewModel> {
    if (!(await this.confirmCommitOperation(`Revert commit ${hash.slice(0, 8)}?`))) {
      return { message: "Revert cancelled", status: "cancelled" };
    }

    await this.runGitRaw(repositoryRoot, ["revert", "--no-edit", hash]);
    return {
      message: "Revert completed",
      status: "ok"
    };
  }

  public async reset(repositoryRoot: string, hash: string, mode: GitResetMode): Promise<OperationResultViewModel> {
    if (!(await this.confirmCommitOperation(`Reset --${mode} to commit ${hash.slice(0, 8)}?`))) {
      return { message: `Reset ${mode} cancelled`, status: "cancelled" };
    }

    await this.runGitRaw(repositoryRoot, ["reset", `--${mode}`, hash]);
    return {
      message: `Reset ${mode} completed`,
      status: "ok"
    };
  }

  public async compareCommits(repositoryRoot: string, hashes: readonly string[]): Promise<RpcPayloadByType["git.compareCommits"]> {
    if (hashes.length !== 2) {
      return {
        files: [],
        result: { message: "Select exactly 2 commits to compare", status: "cancelled" }
      };
    }

    const [numstatOutput, nameStatusOutput] = await Promise.all([
      this.runGitRaw(repositoryRoot, ["diff", "--numstat", hashes[0]!, hashes[1]!]),
      this.runGitRaw(repositoryRoot, ["diff", "--name-status", hashes[0]!, hashes[1]!])
    ]);

    return {
      files: parseGitFileChanges(numstatOutput, nameStatusOutput),
      result: {
        message: `Compared ${hashes[0]!.slice(0, 8)} and ${hashes[1]!.slice(0, 8)}`,
        status: "ok"
      }
    };
  }

  public async createBranchFromCommit(repositoryRoot: string, hash: string): Promise<OperationResultViewModel> {
    const branchName = await this.showInputBox({
      placeHolder: "feature/new-branch",
      prompt: "Enter new branch name"
    });
    if (!branchName) {
      return { message: "Create branch cancelled", status: "cancelled" };
    }

    const trimmedBranchName = branchName.trim();
    await this.runGitRaw(repositoryRoot, ["branch", trimmedBranchName, hash]);
    const checkoutChoice = await this.showInformationMessage(
      `Created branch ${trimmedBranchName}`,
      "Checkout branch",
      "Stay on current branch"
    );
    if (checkoutChoice === "Checkout branch") {
      await this.runGitRaw(repositoryRoot, ["checkout", trimmedBranchName]);
      return {
        message: `Created and checked out branch ${trimmedBranchName}`,
        status: "ok"
      };
    }

    return {
      message: `Created branch ${trimmedBranchName}`,
      status: "ok"
    };
  }

  public async pushAllCommitsToHere(repositoryRoot: string, hash: string): Promise<OperationResultViewModel> {
    const target = await this.pickPushAllCommitsTarget(repositoryRoot);
    if (!target) {
      return { message: "Push commits cancelled", status: "cancelled" };
    }

    if (!(await this.confirmCommitOperation(`Push commits up to ${hash.slice(0, 8)} to ${target}?`))) {
      return { message: "Push commits cancelled", status: "cancelled" };
    }

    const remoteTarget = splitRemoteBranch(target);
    await this.runGitRaw(repositoryRoot, ["push", remoteTarget.remote, `${hash}:refs/heads/${remoteTarget.branch}`]);
    return {
      message: `Pushed commits to ${target}`,
      status: "ok"
    };
  }

  public async editCommitMessage(repositoryRoot: string, hash: string): Promise<OperationResultViewModel> {
    const currentMessage = (await this.runGitRaw(repositoryRoot, ["show", "--no-patch", "--format=%s", hash])).trim();
    const message = await this.showInputBox({
      placeHolder: "Enter new commit message",
      prompt: "Edit commit message",
      value: currentMessage
    });
    if (!message || message.trim() === currentMessage) {
      return { message: "Edit commit message cancelled", status: "cancelled" };
    }

    const head = (await this.runGitRaw(repositoryRoot, ["rev-parse", "HEAD"])).trim();
    if (head !== hash) {
      throw new Error("Only the current HEAD commit message can be edited");
    }

    await this.runGitRaw(repositoryRoot, ["commit", "--amend", "-m", message.trim()]);
    return {
      message: "Commit message updated",
      status: "ok"
    };
  }

  public async squashCommits(repositoryRoot: string, hashes: readonly string[]): Promise<OperationResultViewModel> {
    if (hashes.length < 2) {
      return { message: "Select at least 2 commits to squash", status: "cancelled" };
    }

    if (!(await this.isSquashableHeadRange(repositoryRoot, hashes))) {
      return {
        message: "Selected commits are not a consecutive range ending at HEAD",
        status: "cancelled"
      };
    }

    if (!(await this.confirmCommitOperation(`Squash ${hashes.length} commits into one?`))) {
      return { message: "Squash cancelled", status: "cancelled" };
    }

    const message = await this.showInputBox({
      placeHolder: "Enter squashed commit message",
      prompt: "Squash commit message"
    });
    if (!message) {
      return { message: "Squash cancelled", status: "cancelled" };
    }

    const oldestHash = hashes.at(-1)!;
    const parent = (await this.runGitRaw(repositoryRoot, ["rev-parse", `${oldestHash}^`])).trim();
    await this.runGitRaw(repositoryRoot, ["reset", "--soft", parent]);
    await this.runGitRaw(repositoryRoot, ["commit", "-m", message.trim()]);
    return {
      message: `Squashed ${hashes.length} commits`,
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

  private async isSquashableHeadRange(repositoryRoot: string, hashes: readonly string[]): Promise<boolean> {
    const head = (await this.runGitRaw(repositoryRoot, ["rev-parse", "HEAD"])).trim();
    if (head !== hashes[0]) {
      return false;
    }

    for (let index = 0; index < hashes.length - 1; index += 1) {
      const parent = (await this.runGitRaw(repositoryRoot, ["rev-parse", `${hashes[index]!}^`])).trim();
      if (parent !== hashes[index + 1]) {
        return false;
      }
    }

    return true;
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

  private async getPushArgs(repositoryRoot: string): Promise<readonly string[] | undefined> {
    let upstream: string | undefined;
    try {
      upstream = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])).trim();
    } catch (error) {
      this.logger?.debug("git.push.missingUpstream", {
        error: error instanceof Error ? error.message : String(error),
        repositoryRoot
      });
    }

    const currentBranch = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (upstream) {
      const remoteTarget = splitRemoteBranch(upstream);
      if (remoteTarget.branch === currentBranch) {
        return ["push", remoteTarget.remote, `HEAD:${remoteTarget.branch}`];
      }
    }

    return this.pickPushTarget(repositoryRoot, currentBranch, upstream);
  }

  private async pickPushTarget(
    repositoryRoot: string,
    currentBranch: string,
    upstream: string | undefined
  ): Promise<readonly string[] | undefined> {
    const remotes = await this.getRemotes(repositoryRoot);
    const remoteBranches = parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"]));
    const items: QuickPickItem[] = [
      ...(upstream ? [{ label: `Push to upstream ${upstream}`, value: `upstream:${upstream}` }] : []),
      ...remotes.map((remote) => ({
        label: `Create or update ${remote}/${currentBranch}`,
        value: `same-name:${remote}`
      })),
      ...remoteBranches
        .filter((branch) => branch !== upstream)
        .map((branch) => ({
          label: `Push to ${branch}`,
          value: `branch:${branch}`
        }))
    ];
    const target = await this.showQuickPick(items, { placeHolder: `Select push target for ${currentBranch}` });
    if (!target) {
      return undefined;
    }

    if (target.value.startsWith("same-name:")) {
      const remote = target.value.slice("same-name:".length);
      return ["push", "-u", remote, `HEAD:${currentBranch}`];
    }

    const remoteBranch = target.value.startsWith("upstream:")
      ? target.value.slice("upstream:".length)
      : target.value.slice("branch:".length);
    const remoteTarget = splitRemoteBranch(remoteBranch);
    return target.value.startsWith("upstream:")
      ? ["push", remoteTarget.remote, `HEAD:${remoteTarget.branch}`]
      : ["push", "-u", remoteTarget.remote, `HEAD:${remoteTarget.branch}`];
  }

  private async getRemotes(repositoryRoot: string): Promise<readonly string[]> {
    return (await this.runGitRaw(repositoryRoot, ["remote"]))
      .split("\n")
      .map((remote) => remote.trim())
      .filter((remote) => remote.length > 0);
  }

  private async confirmCommitOperation(message: string): Promise<boolean> {
    return (await this.showWarningMessage(message, "Continue", "Cancel")) === "Continue";
  }

  private async pickPushAllCommitsTarget(repositoryRoot: string): Promise<string | undefined> {
    const remoteBranches = parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"]));
    const target = await this.showQuickPick(
      [
        ...remoteBranches.map((branch) => ({ label: branch, value: branch })),
        { label: "+ Create new remote branch", value: "__create__" }
      ],
      { placeHolder: "Select target remote branch" }
    );
    if (!target) {
      return undefined;
    }

    if (target.value !== "__create__") {
      return target.value;
    }

    return this.showInputBox({
      placeHolder: "origin/feature-branch",
      prompt: "Enter new remote branch name"
    });
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
