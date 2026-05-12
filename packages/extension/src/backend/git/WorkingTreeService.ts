import { simpleGit } from "simple-git";
import type { OperationResultViewModel, StashEntryViewModel, WorkingTreeViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";
import { parsePorcelainStatus, parseStashFiles, parseStashList } from "./WorkingTreeParser";

export interface WorkingTreeServiceInput {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Logger;
  showWarningMessage?: (message: string, options: { modal: boolean }, ...items: readonly string[]) => Thenable<string | undefined>;
}

export class WorkingTreeService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger?: Logger;
  private readonly showWarningMessage: (message: string, options: { modal: boolean }, ...items: readonly string[]) => Thenable<string | undefined>;

  public constructor(input: WorkingTreeServiceInput = {}) {
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.showWarningMessage =
      input.showWarningMessage ??
      (() => Promise.resolve(undefined));
  }

  public async load(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeViewModel> {
    const [branchOutput, statusOutput, stashOutput] = await Promise.all([
      this.gitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      this.gitRaw(repositoryRoot, ["status", "--porcelain=v1"]),
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
    return this.withResult(repositoryId, repositoryRoot, ["stash", "apply", stashRef], "Applied stash");
  }

  public async popStash(repositoryId: string, repositoryRoot: string, stashRef: string): Promise<WorkingTreeActionResult> {
    const confirmation = await this.showWarningMessage(`Pop stash ${stashRef}?`, { modal: true }, "Pop Stash");
    if (confirmation !== "Pop Stash") {
      return this.cancelledResult(repositoryId, repositoryRoot, "Pop stash cancelled");
    }

    return this.withResult(repositoryId, repositoryRoot, ["stash", "pop", stashRef], "Popped stash");
  }

  public async dropStash(repositoryId: string, repositoryRoot: string, stashRef: string): Promise<WorkingTreeActionResult> {
    const confirmation = await this.showWarningMessage(`Drop stash ${stashRef}?`, { modal: true }, "Drop Stash");
    if (confirmation !== "Drop Stash") {
      return this.cancelledResult(repositoryId, repositoryRoot, "Drop stash cancelled");
    }

    return this.withResult(repositoryId, repositoryRoot, ["stash", "drop", stashRef], "Dropped stash");
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
