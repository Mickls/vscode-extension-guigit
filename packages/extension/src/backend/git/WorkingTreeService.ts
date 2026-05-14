import { simpleGit } from "simple-git";
import type { OperationResultViewModel, StashEntryViewModel, WorkingTreeViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";
import { parsePorcelainStatus, parseStashFiles, parseStashList } from "./WorkingTreeParser";

const defaultWorkingTreeMessages: Record<string, string> = {
  "changes.dropStash": "Drop Stash",
  "changes.popStash": "Pop Stash",
  "workingTree.appliedStash": "Applied stash",
  "workingTree.createdStash": "Stashed changes",
  "workingTree.manualStashMessage": "GUI Git History manual stash",
  "workingTree.dropStashCancelled": "Drop stash cancelled",
  "workingTree.dropStashConfirmation": "Drop stash?",
  "workingTree.droppedStash": "Dropped stash",
  "workingTree.popStashCancelled": "Pop stash cancelled",
  "workingTree.popStashConfirmation": "Pop stash?",
  "workingTree.poppedStash": "Popped stash"
};
const workingTreeStatusArgs = ["status", "--porcelain=v1", "--untracked-files=all"] as const;

export interface WorkingTreeServiceInput {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Logger;
  showWarningMessage?: (message: string, options: { modal: boolean }, ...items: readonly string[]) => Thenable<string | undefined>;
  t?: (key: string, ...args: readonly unknown[]) => string;
}

export class WorkingTreeService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger?: Logger;
  private readonly showWarningMessage: (message: string, options: { modal: boolean }, ...items: readonly string[]) => Thenable<string | undefined>;
  private readonly t: (key: string, ...args: readonly unknown[]) => string;

  public constructor(input: WorkingTreeServiceInput = {}) {
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.showWarningMessage =
      input.showWarningMessage ??
      (() => Promise.resolve(undefined));
    this.t = input.t ?? defaultTranslate;
  }

  public async load(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeViewModel> {
    const [branchOutput, statusOutput, stashOutput] = await Promise.all([
      this.getCurrentBranch(repositoryRoot),
      this.gitRaw(repositoryRoot, workingTreeStatusArgs),
      this.gitRaw(repositoryRoot, ["stash", "list"])
    ]);
    const status = parsePorcelainStatus(statusOutput);

    return {
      branch: branchOutput.trim(),
      repositoryId,
      repositoryRoot,
      staged: status.staged,
      stashes: parseStashList(stashOutput),
      unstaged: status.unstaged
    };
  }

  private async getCurrentBranch(repositoryRoot: string): Promise<string> {
    try {
      return await this.gitRaw(repositoryRoot, ["symbolic-ref", "--short", "HEAD"]);
    } catch {
      return "HEAD";
    }
  }

  public async stageFile(repositoryId: string, repositoryRoot: string, filePath: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["add", "--", filePath], "Staged file");
  }

  public async stageAll(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["add", "--all"], "Staged all changes");
  }

  public async unstageFile(repositoryId: string, repositoryRoot: string, filePath: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["restore", "--staged", "--", filePath], "Unstaged file");
  }

  public async unstageAll(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["restore", "--staged", "--", "."], "Unstaged all changes");
  }

  public async commit(repositoryId: string, repositoryRoot: string, message: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["commit", "-m", message], "Commit completed");
  }

  public async discardFile(repositoryId: string, repositoryRoot: string, filePath: string): Promise<WorkingTreeActionResult> {
    const confirmation = await this.showWarningMessage(`Discard changes in ${filePath}?`, { modal: true }, "Discard");
    if (confirmation !== "Discard") {
      return this.cancelledResult(repositoryId, repositoryRoot, "Discard cancelled");
    }

    const status = parsePorcelainStatus(await this.gitRaw(repositoryRoot, ["status", "--porcelain=v1", "--", filePath]));
    const isUntracked = status.unstaged.some((file) => file.area === "untracked" && file.path === filePath);
    const args = isUntracked ? ["clean", "-f", "--", filePath] : ["restore", "--worktree", "--", filePath];

    return this.withResult(repositoryId, repositoryRoot, args, "Discarded file");
  }

  public async applyStash(repositoryId: string, repositoryRoot: string, stashRef: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["stash", "apply", stashRef], this.t("workingTree.appliedStash"));
  }

  public async createStash(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeActionResult> {
    return this.withResult(
      repositoryId,
      repositoryRoot,
      ["stash", "push", "--include-untracked", "-m", this.t("workingTree.manualStashMessage")],
      this.t("workingTree.createdStash")
    );
  }

  public async popStash(repositoryId: string, repositoryRoot: string, stashRef: string): Promise<WorkingTreeActionResult> {
    const confirmLabel = this.t("changes.popStash");
    const confirmation = await this.showWarningMessage(this.t("workingTree.popStashConfirmation"), { modal: true }, confirmLabel);
    if (confirmation !== confirmLabel) {
      return this.cancelledResult(repositoryId, repositoryRoot, this.t("workingTree.popStashCancelled"));
    }

    return this.withResult(repositoryId, repositoryRoot, ["stash", "pop", stashRef], this.t("workingTree.poppedStash"));
  }

  public async dropStash(repositoryId: string, repositoryRoot: string, stashRef: string): Promise<WorkingTreeActionResult> {
    const confirmLabel = this.t("changes.dropStash");
    const confirmation = await this.showWarningMessage(this.t("workingTree.dropStashConfirmation"), { modal: true }, confirmLabel);
    if (confirmation !== confirmLabel) {
      return this.cancelledResult(repositoryId, repositoryRoot, this.t("workingTree.dropStashCancelled"));
    }

    return this.withResult(repositoryId, repositoryRoot, ["stash", "drop", stashRef], this.t("workingTree.droppedStash"));
  }

  public async getStashDetails(repositoryRoot: string, stashRef: string): Promise<StashEntryViewModel> {
    const [stashListOutput, nameStatusOutput, numstatOutput] = await Promise.all([
      this.gitRaw(repositoryRoot, ["stash", "list"]),
      this.gitRaw(repositoryRoot, ["stash", "show", "--include-untracked", "--name-status", stashRef]),
      this.gitRaw(repositoryRoot, ["stash", "show", "--include-untracked", "--numstat", stashRef])
    ]);
    const stash = parseStashList(stashListOutput).find((entry) => entry.ref === stashRef)!;

    return {
      ...stash,
      files: parseStashFiles(nameStatusOutput, numstatOutput)
    };
  }

  private async withResult(
    repositoryId: string,
    repositoryRoot: string,
    args: readonly string[],
    message: string
  ): Promise<WorkingTreeActionResult> {
    const command = formatGitCommand(repositoryRoot, args);
    this.logger?.info("git.command", {
      command
    });
    try {
      await this.gitRaw(repositoryRoot, args);
    } catch (error: unknown) {
      this.logger?.info("git.result", {
        command,
        message: error instanceof Error ? error.message : String(error),
        status: "error"
      });
      throw error;
    }
    this.logger?.info("git.result", {
      command,
      message,
      status: "ok"
    });

    return {
      result: {
        message,
        status: "ok"
      },
      workingTree: await this.load(repositoryId, repositoryRoot)
    };
  }

  private async cancelledResult(
    repositoryId: string,
    repositoryRoot: string,
    message: string
  ): Promise<WorkingTreeActionResult> {
    return {
      result: {
        message,
        status: "cancelled"
      },
      workingTree: await this.load(repositoryId, repositoryRoot)
    };
  }
}

export interface WorkingTreeActionResult {
  result: OperationResultViewModel;
  workingTree: WorkingTreeViewModel;
}

function formatGitCommand(repositoryRoot: string, args: readonly string[]): string {
  return `git -C ${repositoryRoot} ${args.join(" ")}`;
}

function defaultTranslate(key: string): string {
  return defaultWorkingTreeMessages[key] ?? key;
}
