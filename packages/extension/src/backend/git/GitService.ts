import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { simpleGit } from "simple-git";
import type { SimpleGitProgressEvent } from "simple-git";
import { commands, env, ProgressLocation, Uri, window } from "vscode";
import type { GitOperationProgressViewModel, GitResetMode, OperationResultViewModel, RpcPayloadByType } from "../rpc/contract";
import type { ConflictResolutionInput, SafetyService } from "./SafetyService";
import type { ProxyService } from "./ProxyService";
import type { SettingsService } from "../../state/SettingsService";
import { WorkspaceStateService } from "../../state/WorkspaceStateService";
import type { Logger } from "../../logging/LoggerService";
import { parseGitFileChanges } from "./FileChangeParser";

interface QuickPickItem {
  label: string;
  value: string;
}

interface QuickPickWithInputOptions {
  createLocal?: boolean;
  createRemote?: string;
  placeHolder: string;
  remotes?: readonly string[];
}

interface ProgressReporter {
  report(value: { message?: string; increment?: number }): void;
}

interface SquashPlan {
  base: string;
  mode: "cherry-pick" | "soft-reset";
  selectedInCommitOrder: readonly string[];
  unselectedInCommitOrder: readonly string[];
}

interface RunGitRawOptions {
  preflight?: boolean;
}

export interface GitServiceInput {
  clipboardWrite?: (text: string) => Thenable<void>;
  executeCommand?: (command: string, ...args: readonly unknown[]) => Thenable<unknown>;
  gitClone?: (
    parentDirectory: string,
    url: string,
    destinationDirectoryName: string,
    onProgress?: (progress: GitOperationProgressViewModel) => void
  ) => Promise<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug" | "info">;
  openExternal?: (url: string) => Thenable<void>;
  postOperationProgress?: (progress: GitOperationProgressViewModel) => void;
  proxyService?: Pick<ProxyService, "runRaw">;
  readTextFile?: (filePath: string) => Promise<string>;
  safetyService: Pick<SafetyService, "abortOperation" | "continueOperation" | "getOperationState" | "runWithAutoStash">;
  settingsService: Pick<SettingsService, "getSettings">;
  stateService?: Pick<WorkspaceStateService, "getAdvancedGitSelection" | "setAdvancedGitSelection">;
  showInformationMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  showInputBox?: (options: { placeHolder?: string; prompt: string; value?: string }) => Thenable<string | undefined>;
  showOpenDialog?: (options: { canSelectFiles: boolean; canSelectFolders: boolean; canSelectMany: boolean; openLabel: string }) => Thenable<readonly { fsPath: string }[] | undefined>;
  showQuickPick?: (items: readonly QuickPickItem[], options: { placeHolder: string }) => Thenable<QuickPickItem | undefined>;
  showQuickPickWithInput?: (items: readonly QuickPickItem[], options: QuickPickWithInputOptions) => Thenable<QuickPickItem | undefined>;
  showWarningMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  withProgress?: <T>(
    options: { cancellable: boolean; location: ProgressLocation; title: string },
    task: (progress: ProgressReporter) => Thenable<T> | Promise<T>
  ) => Thenable<T>;
  workspaceFolders?: readonly string[];
}

export class GitService {
  private readonly clipboardWrite: (text: string) => Thenable<void>;
  private readonly executeCommand: (command: string, ...args: readonly unknown[]) => Thenable<unknown>;
  private readonly gitClone: (
    parentDirectory: string,
    url: string,
    destinationDirectoryName: string,
    onProgress?: (progress: GitOperationProgressViewModel) => void
  ) => Promise<void>;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug" | "info"> | undefined;
  private readonly openExternal: (url: string) => Thenable<void>;
  private readonly postOperationProgress: (progress: GitOperationProgressViewModel) => void;
  private readonly readTextFile: (filePath: string) => Promise<string>;
  private readonly safetyService: Pick<SafetyService, "abortOperation" | "continueOperation" | "getOperationState" | "runWithAutoStash">;
  private readonly settingsService: Pick<SettingsService, "getSettings">;
  private readonly stateService: Pick<WorkspaceStateService, "getAdvancedGitSelection" | "setAdvancedGitSelection">;
  private readonly showInformationMessage: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  private readonly showInputBox: (options: { placeHolder?: string; prompt: string; value?: string }) => Thenable<string | undefined>;
  private readonly showOpenDialog: (options: { canSelectFiles: boolean; canSelectFolders: boolean; canSelectMany: boolean; openLabel: string }) => Thenable<readonly { fsPath: string }[] | undefined>;
  private readonly showQuickPick: (items: readonly QuickPickItem[], options: { placeHolder: string }) => Thenable<QuickPickItem | undefined>;
  private readonly showQuickPickWithInput: (items: readonly QuickPickItem[], options: QuickPickWithInputOptions) => Thenable<QuickPickItem | undefined>;
  private readonly showWarningMessage: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
  private readonly withProgress: <T>(
    options: { cancellable: boolean; location: ProgressLocation; title: string },
    task: (progress: ProgressReporter) => Thenable<T> | Promise<T>
  ) => Thenable<T>;
  private readonly workspaceFolders: readonly string[];

  public constructor(input: GitServiceInput) {
    this.clipboardWrite = input.clipboardWrite ?? ((text) => env.clipboard.writeText(text));
    this.executeCommand =
      input.executeCommand ??
      (async (command, ...args) => {
        await commands.executeCommand(command, ...args);
      });
    this.gitClone = input.gitClone ?? (async (parentDirectory, url, destinationDirectoryName, onProgress) => {
      await simpleGit(parentDirectory, {
        progress: (event: SimpleGitProgressEvent) => {
          onProgress?.(cloneProgressViewModel(event));
        }
      }).clone(url, destinationDirectoryName);
    });
    this.gitRaw = input.gitRaw ?? input.proxyService?.runRaw.bind(input.proxyService) ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.openExternal = input.openExternal ?? (async (url) => {
      await env.openExternal(Uri.parse(url));
    });
    this.postOperationProgress = input.postOperationProgress ?? (() => undefined);
    this.readTextFile = input.readTextFile ?? ((filePath) => readFile(filePath, "utf8"));
    this.safetyService = input.safetyService;
    this.settingsService = input.settingsService;
    this.stateService = input.stateService ?? new WorkspaceStateService();
    this.showInformationMessage =
      input.showInformationMessage ??
      ((message, ...items) => window.showInformationMessage(message, ...items));
    this.showInputBox =
      input.showInputBox ??
      ((options) => window.showInputBox(options));
    this.showOpenDialog =
      input.showOpenDialog ??
      ((options) => window.showOpenDialog(options));
    this.showQuickPick =
      input.showQuickPick ??
      ((items, options) => window.showQuickPick([...items], options));
    this.showQuickPickWithInput =
      input.showQuickPickWithInput ??
      ((items, options) => showQuickPickWithInput(items, options));
    this.showWarningMessage =
      input.showWarningMessage ??
      ((message, ...items) => window.showWarningMessage(message, ...items));
    this.withProgress =
      input.withProgress ??
      ((options, task) => window.withProgress(options, task));
    this.workspaceFolders = input.workspaceFolders ?? [];
  }

  public async pull(repositoryRoot: string): Promise<OperationResultViewModel> {
    if (!(await this.ensureTrackingBranch(repositoryRoot))) {
      return { message: "Pull cancelled", status: "cancelled" };
    }

    return this.runPullWithSafety(repositoryRoot, ["pull", "--no-rebase"], "Pull completed");
  }

  public async advancedPull(repositoryRoot: string): Promise<OperationResultViewModel> {
    const modeItems = preferLastSelection(
      [
        { label: "Merge", value: "merge" },
        { label: "Rebase", value: "rebase" }
      ],
      this.stateService.getAdvancedGitSelection(repositoryRoot, "advancedPullMode")
    );
    const mode = await this.showQuickPick(
      modeItems,
      { placeHolder: "Select pull mode" }
    );
    if (!mode) {
      return { message: "Advanced pull cancelled", status: "cancelled" };
    }
    await this.stateService.setAdvancedGitSelection(repositoryRoot, "advancedPullMode", mode.value);

    const branch = await this.pickRemoteBranch(
      repositoryRoot,
      "Select remote branch to pull",
      this.stateService.getAdvancedGitSelection(repositoryRoot, "advancedPullBranch")
    );
    if (!branch) {
      return { message: "Advanced pull cancelled", status: "cancelled" };
    }
    await this.stateService.setAdvancedGitSelection(repositoryRoot, "advancedPullBranch", branch.value);

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
    void this.promptPullRequestForCurrentBranch(repositoryRoot, args).catch((error: unknown) => {
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
    const branch = await this.pickAdvancedPushTarget(repositoryRoot);
    if (!branch) {
      return { message: "Advanced push cancelled", status: "cancelled" };
    }
    await this.stateService.setAdvancedGitSelection(repositoryRoot, "advancedPushBranch", branch.value);

    const forceModeItems = pushModeItems(this.stateService.getAdvancedGitSelection(repositoryRoot, "advancedPushMode"));
    const forceMode = await this.showQuickPick(
      forceModeItems,
      { placeHolder: "Select push mode" }
    );
    if (!forceMode) {
      return { message: "Advanced push cancelled", status: "cancelled" };
    }
    await this.stateService.setAdvancedGitSelection(repositoryRoot, "advancedPushMode", forceMode.value);

    const remoteTarget = splitRemoteBranch(branch.value);
    if (forceMode.value === "force-with-lease") {
      const confirmed = await this.confirmWithQuickPick(
        `Force push to ${branch.value} with lease?`,
        "Force Push"
      );
      if (!confirmed) {
        return { message: "Advanced push cancelled", status: "cancelled" };
      }
    }

    const args =
      forceMode.value === "force-with-lease"
        ? ["push", "--force-with-lease", remoteTarget.remote, `HEAD:${remoteTarget.branch}`]
        : ["push", remoteTarget.remote, `HEAD:${remoteTarget.branch}`];

    this.logger?.debug("git.advancedPush", { args, repositoryRoot });
    if (forceMode.value === "force-with-lease") {
      await this.runForceWithLeasePush(repositoryRoot, args);
    } else {
      await this.runGitRaw(repositoryRoot, args);
    }
    void this.promptPullRequestForCurrentBranch(repositoryRoot, args).catch((error: unknown) => {
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

  public async clone(): Promise<OperationResultViewModel> {
    const urlInput = await this.showInputBox({
      placeHolder: "https://github.com/owner/repo.git",
      prompt: "Enter repository URL"
    });
    const url = urlInput?.trim();
    if (!url) {
      return { message: "Clone cancelled", status: "cancelled" };
    }
    const destinationDirectoryName = cloneDestinationName(url);
    if (!destinationDirectoryName) {
      return { message: "Clone cancelled", status: "cancelled" };
    }

    const targetDirectories = await this.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Clone Here"
    });
    const targetDirectory = targetDirectories?.[0]?.fsPath;
    if (!targetDirectory) {
      return { message: "Clone cancelled", status: "cancelled" };
    }

    this.logger?.debug("git.clone", { destinationDirectoryName, targetDirectory, url });
    this.logGitCommand(targetDirectory, ["clone", url, destinationDirectoryName]);
    await this.withCloneProgress(destinationDirectoryName, targetDirectory, async (reportProgress) => {
      await this.gitClone(targetDirectory, url, destinationDirectoryName, (progress) => {
        reportProgress(progress);
        this.postOperationProgress(progress);
      });
    });
    await this.promptOpenClonedRepository(join(targetDirectory, destinationDirectoryName), destinationDirectoryName);

    return {
      message: "Clone completed",
      status: "ok"
    };
  }

  public async init(): Promise<OperationResultViewModel> {
    if (this.workspaceFolders.length === 0) {
      return { message: "No workspace folder found", status: "cancelled" };
    }

    const repositoryRoot = await this.pickWorkspaceFolderForInit();
    if (!repositoryRoot) {
      return { message: "Initialize repository cancelled", status: "cancelled" };
    }

    this.logger?.debug("git.init", { repositoryRoot });
    await this.runGitRaw(repositoryRoot, ["init"]);

    return {
      message: `Initialized Git repository in ${basename(repositoryRoot)}`,
      status: "ok"
    };
  }

  public async checkout(repositoryRoot: string): Promise<OperationResultViewModel> {
    const branch = await this.pickCheckoutBranch(repositoryRoot);
    if (!branch) {
      return { message: "Checkout cancelled", status: "cancelled" };
    }

    this.logger?.debug("git.checkout", { branch, repositoryRoot });
    const isNewBranch = branch.value.startsWith(newLocalBranchValuePrefix);
    const branchName = isNewBranch ? branch.value.slice(newLocalBranchValuePrefix.length) : branch.value;
    await this.runGitRaw(repositoryRoot, isNewBranch ? ["checkout", "-b", branchName] : ["checkout", branchName]);

    return {
      message: isNewBranch ? `Created and checked out ${branchName}` : `Checked out ${branchName}`,
      status: "ok"
    };
  }

  private async pickWorkspaceFolderForInit(): Promise<string | undefined> {
    if (this.workspaceFolders.length === 1) {
      return this.workspaceFolders[0];
    }

    const workspaceFolder = await this.showQuickPick(
      this.workspaceFolders.map((folder) => ({
        label: basename(folder),
        value: folder
      })),
      { placeHolder: "Select workspace folder to initialize" }
    );

    return workspaceFolder?.value;
  }

  private async promptOpenClonedRepository(repositoryRoot: string, repositoryName: string): Promise<void> {
    const openInCurrentWindow = "Open in Current Window";
    const openInNewWindow = "Open in New Window";
    const choice = await this.showInformationMessage(
      `Clone completed: ${repositoryName}. Open cloned repository?`,
      openInCurrentWindow,
      openInNewWindow
    );

    if (!choice) {
      return;
    }

    await this.executeCommand("vscode.openFolder", Uri.file(repositoryRoot), {
      forceNewWindow: choice === openInNewWindow
    });
  }

  private async withCloneProgress<T>(
    repositoryName: string,
    targetDirectory: string,
    task: (reportProgress: (progress: GitOperationProgressViewModel) => void) => Promise<T>
  ): Promise<T> {
    return this.withProgress(
      {
        cancellable: false,
        location: ProgressLocation.Notification,
        title: `Cloning ${repositoryName}`
      },
      async (progress) => {
        progress.report({ message: `Preparing clone into ${targetDirectory}` });
        return task((value) => {
          progress.report({ message: cloneProgressMessage(value) });
        });
      }
    );
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

    const mode = await this.showQuickPick(pushModeItems(), { placeHolder: "Select push mode" });
    if (!mode) {
      return { message: "Push commits cancelled", status: "cancelled" };
    }

    const forceWithLease = mode.value === "force-with-lease";
    const shortHash = hash.slice(0, 8);
    const confirmMessage = forceWithLease
      ? `Force push commits up to ${shortHash} to ${target} with lease?`
      : `Push commits up to ${shortHash} to ${target}?`;
    const confirmLabel = forceWithLease ? "Force Push" : "Push Commits";
    if (!(await this.confirmWithQuickPick(confirmMessage, confirmLabel))) {
      return { message: "Push commits cancelled", status: "cancelled" };
    }

    const remoteTarget = splitRemoteBranch(target);
    const args = forceWithLease
      ? ["push", "--force-with-lease", remoteTarget.remote, `${hash}:refs/heads/${remoteTarget.branch}`]
      : ["push", remoteTarget.remote, `${hash}:refs/heads/${remoteTarget.branch}`];
    if (forceWithLease) {
      await this.runForceWithLeasePush(repositoryRoot, args);
    } else {
      await this.runGitRaw(repositoryRoot, args);
    }
    return {
      message: forceWithLease ? `Force pushed commits to ${target}` : `Pushed commits to ${target}`,
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

    const plan = await this.buildSquashPlan(repositoryRoot, hashes);
    if (!plan) {
      return {
        message: "Selected commits are not on the current branch",
        status: "cancelled"
      };
    }

    if (!(await this.verifySquashPlanAppliesCleanly(repositoryRoot, plan))) {
      return {
        message: "Selected commits cannot be squashed cleanly. Include the dependent commits or resolve the squash manually.",
        status: "cancelled"
      };
    }

    if (!(await this.confirmCommitOperation(`Squash ${hashes.length} commits into one?`))) {
      return { message: "Squash cancelled", status: "cancelled" };
    }

    const defaultMessage = await this.squashCommitMessage(repositoryRoot, hashes);
    const message = await this.showInputBox({
      placeHolder: "Enter squashed commit message",
      prompt: "Squash commit message",
      value: defaultMessage
    });
    if (!message) {
      return { message: "Squash cancelled", status: "cancelled" };
    }

    return this.safetyService.runWithAutoStash(repositoryRoot, this.settingsService.getSettings().autoStashOnPull, async () => {
      await this.runSquashPlan(repositoryRoot, plan, message.trim());

      return {
        message: `Squashed ${hashes.length} commits`,
        status: "ok"
      };
    });
  }

  private async runSquashPlan(repositoryRoot: string, plan: SquashPlan, message: string): Promise<void> {
    if (plan.mode === "soft-reset") {
      await this.runGitRaw(repositoryRoot, ["reset", "--soft", plan.base]);
    } else {
      await this.runGitRaw(repositoryRoot, ["reset", "--hard", plan.base]);
      for (const hash of plan.selectedInCommitOrder) {
        await this.runGitRaw(repositoryRoot, ["cherry-pick", "--no-commit", hash]);
      }
    }

    await this.runGitRaw(repositoryRoot, ["commit", "-m", message]);
    for (const hash of plan.unselectedInCommitOrder) {
      await this.runGitRaw(repositoryRoot, ["cherry-pick", hash]);
    }
  }

  private async squashCommitMessage(repositoryRoot: string, hashes: readonly string[]): Promise<string> {
    const messages = await Promise.all(
      hashes.map(async (hash) => (await this.runGitRaw(repositoryRoot, ["show", "--no-patch", "--format=%s", hash])).trim())
    );
    return messages.join("\n");
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
    await this.ensureGitLfsAvailable(repositoryRoot);
    const preference = this.settingsService.getSettings().autoStashOnPull;
    const conflict = getPullConflictResolution(args);
    return this.safetyService.runWithAutoStash(repositoryRoot, preference, async () => {
      this.logger?.debug("git.pull", { args, repositoryRoot });
      await this.runGitRaw(repositoryRoot, args, { preflight: false });

      return {
        message,
        status: "ok"
      };
    }, conflict);
  }

  private async buildSquashPlan(repositoryRoot: string, hashes: readonly string[]): Promise<SquashPlan | undefined> {
    if (await this.isSquashableHeadRange(repositoryRoot, hashes)) {
      const oldestHash = hashes.at(-1)!;
      return {
        base: (await this.runGitRaw(repositoryRoot, ["rev-parse", `${oldestHash}^`])).trim(),
        mode: "soft-reset",
        selectedInCommitOrder: [],
        unselectedInCommitOrder: []
      };
    }

    const firstParentHistory = parseLines(await this.runGitRaw(repositoryRoot, ["rev-list", "--first-parent", "HEAD"]));
    const selectedIndexes = hashes.map((hash) => firstParentHistory.indexOf(hash));
    if (selectedIndexes.includes(-1)) {
      return undefined;
    }

    const oldestSelectedIndex = Math.max(...selectedIndexes);
    const commitsInCommitOrder = firstParentHistory.slice(0, oldestSelectedIndex + 1).reverse();
    const selectedHashes = new Set(hashes);
    const selectedInCommitOrder = commitsInCommitOrder.filter((hash) => selectedHashes.has(hash));
    const unselectedInCommitOrder = commitsInCommitOrder.filter((hash) => !selectedHashes.has(hash));

    return {
      base: (await this.runGitRaw(repositoryRoot, ["rev-parse", `${commitsInCommitOrder[0]!}^`])).trim(),
      mode: "cherry-pick",
      selectedInCommitOrder,
      unselectedInCommitOrder
    };
  }

  private async verifySquashPlanAppliesCleanly(repositoryRoot: string, plan: SquashPlan): Promise<boolean> {
    if (plan.mode === "soft-reset") {
      return true;
    }

    const preflightRoot = await mkdtemp(join(tmpdir(), "guigit-squash-"));
    try {
      await this.runGitRaw(repositoryRoot, ["worktree", "add", "--detach", preflightRoot, "HEAD"]);
      await this.runSquashPlan(preflightRoot, plan, "GUI Git History squash preflight");
      return true;
    } catch {
      return false;
    } finally {
      await this.runGitRaw(repositoryRoot, ["worktree", "remove", "--force", preflightRoot]);
      await rm(preflightRoot, { force: true, recursive: true });
    }
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

  private async pickRemoteBranch(
    repositoryRoot: string,
    placeHolder: string,
    lastSelection: string | undefined = undefined
  ): Promise<QuickPickItem | undefined> {
    const branches = parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"]));
    return this.showQuickPick(
      preferLastSelection(
        preferMainBranches(branches).map((branch) => ({ label: branch, value: branch })),
        lastSelection
      ),
      { placeHolder }
    );
  }

  private async pickAdvancedPushTarget(repositoryRoot: string): Promise<QuickPickItem | undefined> {
    const remoteBranches = parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"]));
    const createRemote = await this.getDefaultCreateRemote(repositoryRoot, remoteBranches);
    const remotes = remoteNamesFromBranches(remoteBranches);
    const lastSelection = this.stateService.getAdvancedGitSelection(repositoryRoot, "advancedPushBranch");
    const target = await this.showQuickPickWithInput(
      [
        ...advancedPushTargets(remoteBranches, lastSelection),
        { label: "+ Create new remote branch", value: "__create__" }
      ],
      { createRemote, placeHolder: "Select remote branch to push", remotes }
    );
    if (!target || target.value !== "__create__") {
      return target;
    }

    const currentBranch = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const branch = await this.showInputBox({
      placeHolder: currentBranch,
      prompt: `Enter new branch name for ${createRemote}`
    });
    if (!branch) {
      return undefined;
    }

    const trimmedBranch = branch.trim();
    const remoteBranch = createRemoteBranchItem(createRemote, trimmedBranch, remotes).value;
    return {
      label: remoteBranch,
      value: remoteBranch
    };
  }

  private async getDefaultCreateRemote(repositoryRoot: string, remoteBranches: readonly string[]): Promise<string> {
    const firstRemoteBranch = remoteBranches[0];
    if (firstRemoteBranch) {
      return splitRemoteBranch(firstRemoteBranch).remote;
    }

    const remotes = await this.getRemotes(repositoryRoot);
    return remotes[0]!;
  }

  private async pickCheckoutBranch(repositoryRoot: string): Promise<QuickPickItem | undefined> {
    const branches = (await this.runGitRaw(repositoryRoot, ["branch", "--all", "--format=%(refname:short)"]))
      .split("\n")
      .map((branch) => branch.trim())
      .filter((branch) => branch.length > 0);
    return this.showQuickPickWithInput(
      preferMainBranches(branches).map((branch) => ({ label: branch, value: branch })),
      { createLocal: true, placeHolder: "Select branch to checkout" }
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
    const remoteBranches = preferMainBranches(parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"])));
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
    const remoteBranches = preferMainBranches(parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"])));
    const createRemote = await this.getDefaultCreateRemote(repositoryRoot, remoteBranches);
    const remotes = remoteNamesFromBranches(remoteBranches);
    const target = await this.showQuickPickWithInput(
      [
        ...remoteBranches.map((branch) => ({ label: branch, value: branch })),
        { label: "+ Create new remote branch", value: "__create__" }
      ],
      { createRemote, placeHolder: "Select target remote branch", remotes }
    );
    if (!target) {
      return undefined;
    }

    if (target.value !== "__create__") {
      return target.value;
    }

    const branch = await this.showInputBox({
      placeHolder: `${createRemote}/feature-branch`,
      prompt: "Enter new remote branch name"
    });
    if (!branch) {
      return undefined;
    }

    return createRemoteBranchItem(createRemote, branch.trim(), remotes).value;
  }

  private async promptPullRequestForCurrentBranch(repositoryRoot: string, pushArgs: readonly string[]): Promise<void> {
    const branch = (await this.runGitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (branch !== "main" && branch !== "master") {
      const action = await this.pickQuickPickAction(`Pushed ${branch}. Create a pull request?`, [
        { label: "Open Pull Request", value: "open-pull-request" },
        { label: "Dismiss", value: "dismiss" }
      ]);
      if (action === "open-pull-request") {
        const remote = remoteFromPushArgs(pushArgs);
        const remoteUrl = (await this.runGitRaw(repositoryRoot, ["remote", "get-url", remote])).trim();
        await this.openExternal(pullRequestUrl(remoteUrl, branch));
      }
    }
  }

  private async runGitRaw(repositoryRoot: string, args: readonly string[], options: RunGitRawOptions = {}): Promise<string> {
    if (options.preflight !== false && requiresGitLfsPreflight(args)) {
      await this.ensureGitLfsAvailable(repositoryRoot);
    }

    this.logGitCommand(repositoryRoot, args);
    try {
      return await this.gitRaw(repositoryRoot, args);
    } catch (error) {
      if (requiresGitLfsPreflight(args) && isGitLfsMissingError(error)) {
        throw new Error(gitLfsMissingMessage);
      }

      throw error;
    }
  }

  private async ensureGitLfsAvailable(repositoryRoot: string): Promise<void> {
    if (!(await this.repositoryUsesGitLfs(repositoryRoot))) {
      return;
    }

    try {
      await this.gitRaw(repositoryRoot, ["lfs", "version"]);
    } catch {
      throw new Error(gitLfsMissingMessage);
    }
  }

  private async repositoryUsesGitLfs(repositoryRoot: string): Promise<boolean> {
    const hasLfsAttributes = await this.hasGitLfsAttributes(repositoryRoot);
    return hasLfsAttributes === true ||
      (hasLfsAttributes === undefined && await this.hasGitLfsFilterConfig(repositoryRoot)) ||
      await this.hasGitLfsPrePushHook(repositoryRoot);
  }

  private async hasGitLfsAttributes(repositoryRoot: string): Promise<boolean | undefined> {
    const attributes = await this.tryReadTextFile(join(repositoryRoot, ".gitattributes"));
    if (attributes !== undefined) {
      return gitLfsAttributePattern.test(attributes);
    }

    try {
      const infoAttributesPath = (await this.gitRaw(repositoryRoot, ["rev-parse", "--git-path", "info/attributes"])).trim();
      const infoAttributes = await this.readTextFile(isAbsolute(infoAttributesPath) ? infoAttributesPath : join(repositoryRoot, infoAttributesPath));
      return gitLfsAttributePattern.test(infoAttributes);
    } catch {
      return undefined;
    }
  }

  private async hasGitLfsFilterConfig(repositoryRoot: string): Promise<boolean> {
    try {
      const filterConfig = await this.gitRaw(repositoryRoot, ["config", "--get-regexp", "^filter\\.lfs\\."]);
      return gitLfsFilterConfigPattern.test(filterConfig);
    } catch {
      return false;
    }
  }

  private async hasGitLfsPrePushHook(repositoryRoot: string): Promise<boolean> {
    const defaultHookContent = await this.tryReadTextFile(join(repositoryRoot, ".git", "hooks", "pre-push"));
    if (defaultHookContent !== undefined) {
      return gitLfsHookPattern.test(defaultHookContent);
    }

    try {
      const hookPath = await this.prePushHookPath(repositoryRoot);
      const hookContent = await this.readTextFile(hookPath);
      return gitLfsHookPattern.test(hookContent);
    } catch {
      return false;
    }
  }

  private async tryReadTextFile(filePath: string): Promise<string | undefined> {
    try {
      return await this.readTextFile(filePath);
    } catch {
      return undefined;
    }
  }

  private async prePushHookPath(repositoryRoot: string): Promise<string> {
    const hooksPath = await this.getConfiguredHooksPath(repositoryRoot);
    if (hooksPath) {
      return join(isAbsolute(hooksPath) ? hooksPath : join(repositoryRoot, hooksPath), "pre-push");
    }

    const hookPath = (await this.gitRaw(repositoryRoot, ["rev-parse", "--git-path", "hooks/pre-push"])).trim();
    return isAbsolute(hookPath) ? hookPath : join(repositoryRoot, hookPath);
  }

  private async getConfiguredHooksPath(repositoryRoot: string): Promise<string | undefined> {
    try {
      const hooksPath = (await this.gitRaw(repositoryRoot, ["config", "--path", "--get", "core.hookspath"])).trim();
      return hooksPath || undefined;
    } catch {
      return undefined;
    }
  }

  private async runForceWithLeasePush(repositoryRoot: string, args: readonly string[]): Promise<void> {
    try {
      await this.runGitRaw(repositoryRoot, args);
    } catch (error) {
      if (isForceWithLeaseStaleInfoError(error)) {
        throw new Error(forceWithLeaseStaleInfoMessage);
      }

      throw error;
    }
  }

  private logGitCommand(repositoryRoot: string, args: readonly string[]): void {
    this.logger?.info("git.command", {
      command: `git -C ${repositoryRoot} ${args.join(" ")}`
    });
  }

  private async confirmWithQuickPick(placeHolder: string, confirmLabel: string): Promise<boolean> {
    return (await this.pickQuickPickAction(placeHolder, [
      { label: confirmLabel, value: "confirm" },
      { label: "Cancel", value: "cancel" }
    ])) === "confirm";
  }

  private async pickQuickPickAction(placeHolder: string, items: readonly QuickPickItem[]): Promise<string | undefined> {
    return (await this.showQuickPick(items, { placeHolder }))?.value;
  }
}

function parseRemoteBranches(output: string): readonly string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes("HEAD ->"));
}

function showQuickPickWithInput(
  items: readonly QuickPickItem[],
  options: QuickPickWithInputOptions
): Thenable<QuickPickItem | undefined> {
  return new Promise((resolve) => {
    const quickPick = window.createQuickPick<QuickPickItem>();
    quickPick.items = [...items];
    quickPick.placeholder = options.placeHolder;

    let settled = false;
    const settle = (selection: QuickPickItem | undefined) => {
      if (settled) {
        return;
      }

      settled = true;
      disposables.forEach((disposable) => {
        disposable.dispose();
      });
      quickPick.dispose();
      resolve(selection);
    };
    const disposables = [
      quickPick.onDidAccept(() => {
        const input = quickPick.value.trim();
        const existingItem = items.find((item) => inputMatchesItem(item.value, input, options));
        const typedBranch = input
          ? existingItem ?? createBranchItemForInput(input, options)
          : quickPick.selectedItems[0] ?? quickPick.activeItems[0];
        settle(typedBranch);
      }),
      quickPick.onDidHide(() => settle(undefined))
    ];

    quickPick.show();
  });
}

function splitRemoteBranch(branch: string): { branch: string; remote: string } {
  const separatorIndex = branch.indexOf("/");
  return {
    branch: branch.slice(separatorIndex + 1),
    remote: branch.slice(0, separatorIndex)
  };
}

function parseLines(output: string): readonly string[] {
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function preferLastSelection<T extends QuickPickItem>(items: readonly T[], lastSelection: string | undefined): readonly T[] {
  const selectionIndex = items.findIndex((item) => item.value === lastSelection);
  if (selectionIndex <= 0) {
    return items;
  }

  return [
    items[selectionIndex]!,
    ...items.slice(0, selectionIndex),
    ...items.slice(selectionIndex + 1)
  ];
}

function advancedPushTargets(remoteBranches: readonly string[], lastSelection: string | undefined): readonly QuickPickItem[] {
  const orderedRemoteBranches = preferMainBranches(remoteBranches);
  const items = orderedRemoteBranches.map((branch) => ({ label: branch, value: branch }));
  if (!lastSelection || remoteBranches.includes(lastSelection)) {
    return preferLastSelection(items, lastSelection);
  }

  return [
    { label: lastSelection, value: lastSelection },
    ...items
  ];
}

function pushModeItems(lastSelection?: string): readonly QuickPickItem[] {
  return preferLastSelection(
    [
      { label: "Normal", value: "normal" },
      { label: "Force with lease", value: "force-with-lease" }
    ],
    lastSelection
  );
}

function remoteNamesFromBranches(remoteBranches: readonly string[]): readonly string[] {
  return [...new Set(remoteBranches.map((branch) => splitRemoteBranch(branch).remote))];
}

function preferMainBranches(branches: readonly string[]): readonly string[] {
  return [...branches].sort((left, right) => primaryBranchRank(left) - primaryBranchRank(right));
}

function primaryBranchRank(branch: string): number {
  const shortBranch = branch.slice(branch.indexOf("/") + 1);
  if (shortBranch === "main") {
    return 0;
  }

  return shortBranch === "master" ? 1 : 2;
}

function itemMatchesInput(value: string, input: string): boolean {
  const remoteTarget = splitRemoteBranch(value);
  return value === input || remoteTarget.branch === input;
}

function inputMatchesItem(value: string, input: string, options: QuickPickWithInputOptions): boolean {
  return options.createLocal ? value === input : itemMatchesInput(value, input);
}

function createRemoteBranchItem(remote: string, input: string, remotes: readonly string[]): QuickPickItem {
  const remotePrefix = `${remote}/`;
  const separatorIndex = input.indexOf("/");
  const inputRemote = separatorIndex > 0 ? input.slice(0, separatorIndex) : "";
  const branch = input.startsWith(remotePrefix) || remotes.includes(inputRemote)
    ? input
    : `${remote}/${input}`;
  return {
    label: branch,
    value: branch
  };
}

const newLocalBranchValuePrefix = "__create_local_branch__:";

function createBranchItemForInput(input: string, options: QuickPickWithInputOptions): QuickPickItem {
  if (options.createLocal) {
    return {
      label: input,
      value: `${newLocalBranchValuePrefix}${input}`
    };
  }

  const createRemote = options.createRemote;
  if (!createRemote) {
    return {
      label: input,
      value: input
    };
  }

  return createRemoteBranchItem(createRemote, input, options.remotes ?? [createRemote]);
}

const forceWithLeaseStaleInfoMessage = "Force push was rejected because the remote branch changed or your local remote-tracking information is stale. Fetch first, review the remote changes, then retry force push if you still want to overwrite the remote branch.";
const gitLfsMissingMessage = "This repository uses Git LFS, but git-lfs is not available to Git. Install Git LFS or make git-lfs available on VS Code's PATH, then retry. If this repository should no longer use Git LFS, remove the repository's Git LFS attributes/hook configuration instead of bypassing hooks.";
const gitLfsAttributePattern = /filter=lfs/i;
const gitLfsFilterConfigPattern = /filter\.lfs\./i;
const gitLfsHookPattern = /git[- ]lfs/i;

function requiresGitLfsPreflight(args: readonly string[]): boolean {
  return args[0] === "pull" || args[0] === "push";
}

function isForceWithLeaseStaleInfoError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("stale info") || message.includes("fetch first");
}

function isGitLfsMissingError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("git-lfs") && (
    message.includes("not found") ||
    message.includes("command not found") ||
    message.includes("is not a git command")
  );
}

function cloneDestinationName(url: string): string | undefined {
  const normalizedUrl = url.replace(/[?#].*$/, "").replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    normalizedUrl.lastIndexOf("/"),
    normalizedUrl.lastIndexOf("\\"),
    normalizedUrl.lastIndexOf(":")
  );
  const directoryName = normalizedUrl
    .slice(separatorIndex + 1)
    .replace(/\.git$/i, "");

  return directoryName && directoryName !== "." && directoryName !== ".."
    ? directoryName
    : undefined;
}

function cloneProgressViewModel(event: SimpleGitProgressEvent): GitOperationProgressViewModel {
  return {
    message: cloneProgressMessage({
      progress: event.progress,
      stage: event.stage
    }),
    operation: "git.clone",
    processed: event.processed,
    progress: event.progress,
    stage: event.stage,
    total: event.total
  };
}

function cloneProgressMessage(progress: Pick<GitOperationProgressViewModel, "progress" | "stage">): string {
  const stage = progress.stage ? titleCaseProgressStage(progress.stage) : "Cloning";

  return typeof progress.progress === "number"
    ? `${stage} ${progress.progress}%`
    : stage;
}

function titleCaseProgressStage(stage: string): string {
  return stage
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function remoteFromPushArgs(args: readonly string[]): string {
  const refspecIndex = args.findIndex((arg) => arg.startsWith("HEAD:"));
  return args[refspecIndex - 1]!;
}

function pullRequestUrl(remoteUrl: string, branch: string): string {
  const repositoryUrl = repositoryWebUrl(remoteUrl);
  if (repositoryUrl.includes("github.com/")) {
    return `${repositoryUrl}/pull/new/${encodeURIComponent(branch)}`;
  }

  if (repositoryUrl.includes("gitlab.com/")) {
    return `${repositoryUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(branch)}`;
  }

  if (repositoryUrl.includes("bitbucket.org/")) {
    return `${repositoryUrl}/pull-requests/new?source=${encodeURIComponent(branch)}`;
  }

  return repositoryUrl;
}

function repositoryWebUrl(remoteUrl: string): string {
  const trimmedUrl = remoteUrl.trim().replace(/\.git$/, "");
  const sshMatch = /^git@([^:]+):(.+)$/.exec(trimmedUrl);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  const sshUrlMatch = /^ssh:\/\/git@([^/]+)\/(.+)$/.exec(trimmedUrl);
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  }

  return trimmedUrl;
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
