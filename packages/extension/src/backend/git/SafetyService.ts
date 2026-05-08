import { simpleGit } from "simple-git";
import { window } from "vscode";
import type { AutoStashPreference, OperationResultViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";

const stashMessage = "GUI Git History auto stash";
const stashAndContinue = "Stash and Continue";
const continueOperation = "Resolved and Staged";
const abortOperation = "Abort";
const cancel = "Cancel";

export interface ConflictResolutionInput {
  abortArgs: readonly string[];
  continueArgs: readonly string[];
  operationKind: "merge" | "rebase";
  operationName: string;
}

export interface SafetyServiceInput {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug" | "info">;
  showWarningMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
}

export class SafetyService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug" | "info"> | undefined;
  private readonly showWarningMessage: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;

  public constructor(input: SafetyServiceInput = {}) {
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.showWarningMessage =
      input.showWarningMessage ??
      ((message, ...items) => window.showWarningMessage(message, ...items));
  }

  public async hasUncommittedChanges(repositoryRoot: string): Promise<boolean> {
    const status = await this.gitRaw(repositoryRoot, ["status", "--porcelain"]);
    return status.trim().length > 0;
  }

  public async runWithAutoStash(
    repositoryRoot: string,
    preference: AutoStashPreference,
    operation: () => Promise<OperationResultViewModel>,
    conflict?: ConflictResolutionInput
  ): Promise<OperationResultViewModel> {
    if (!(await this.hasUncommittedChanges(repositoryRoot))) {
      return this.runOperation(repositoryRoot, operation, conflict, false);
    }

    if (preference === "never") {
      this.logger?.debug("safety.autoStash.cancelled", { preference, repositoryRoot });
      return {
        message: "Uncommitted changes detected",
        status: "cancelled"
      };
    }

    if (preference === "ask") {
      const choice = await this.showWarningMessage(
        "Uncommitted changes detected. Stash them before continuing?",
        stashAndContinue,
        cancel
      );
      if (choice !== stashAndContinue) {
        this.logger?.debug("safety.autoStash.cancelled", { preference, repositoryRoot });
        return {
          message: "Auto stash cancelled",
          status: "cancelled"
        };
      }
    }

    this.logger?.debug("safety.autoStash.push", { repositoryRoot });
    await this.runLoggedGit(repositoryRoot, ["stash", "push", "--include-untracked", "-m", stashMessage]);
    return this.runOperation(repositoryRoot, operation, conflict, true);
  }

  private async runOperation(
    repositoryRoot: string,
    operation: () => Promise<OperationResultViewModel>,
    conflict: ConflictResolutionInput | undefined,
    autoStashed: boolean
  ): Promise<OperationResultViewModel> {
    try {
      const result = await operation();
      if (autoStashed) {
        await this.restoreAutoStash(repositoryRoot);
      }

      return result;
    } catch (error) {
      if (conflict && (await this.getConflictState(repositoryRoot, conflict.operationKind)) !== "none") {
        this.logger?.debug("safety.conflict.detected", {
          operationName: conflict.operationName,
          repositoryRoot
        });
        return this.resolveConflict(repositoryRoot, conflict, autoStashed);
      }

      throw error;
    }
  }

  private async resolveConflict(
    repositoryRoot: string,
    conflict: ConflictResolutionInput,
    autoStashed: boolean
  ): Promise<OperationResultViewModel> {
    let prompt = this.getConflictPrompt(conflict.operationName, autoStashed);
    while (true) {
      const choice = await this.showWarningMessage(
        prompt,
        continueOperation,
        abortOperation
      );

      if (choice === abortOperation) {
        await this.runLoggedGit(repositoryRoot, conflict.abortArgs);
        if (autoStashed) {
          await this.restoreAutoStash(repositoryRoot);
        }

        return {
          message: autoStashed
            ? `${conflict.operationName} aborted and stashed changes restored`
            : `${conflict.operationName} aborted`,
          status: "cancelled"
        };
      }

      if (choice !== continueOperation) {
        return {
          message: `${conflict.operationName} still has conflicts`,
          status: "cancelled"
        };
      }

      if (choice === continueOperation) {
        try {
          await this.runLoggedGit(repositoryRoot, conflict.continueArgs);
          if (autoStashed) {
            await this.restoreAutoStash(repositoryRoot);
          }

          return {
            message: `${conflict.operationName} conflicts resolved`,
            status: "ok"
          };
        } catch (error) {
          const conflictState = await this.getConflictState(repositoryRoot, conflict.operationKind);
          if (conflictState !== "none") {
            this.logger?.debug("safety.conflict.continueFailed", {
              error: error instanceof Error ? error.message : String(error),
              operationName: conflict.operationName,
              repositoryRoot
            });
            prompt = this.getContinueFailedPrompt(conflict.operationName, conflictState);
            continue;
          }

          throw error;
        }
      }
    }
  }

  private async restoreAutoStash(repositoryRoot: string): Promise<void> {
    this.logger?.debug("safety.autoStash.pop", { repositoryRoot });
    await this.runLoggedGit(repositoryRoot, ["stash", "pop"]);
  }

  private async hasUnmergedConflicts(repositoryRoot: string): Promise<boolean> {
    const status = await this.gitRaw(repositoryRoot, ["status", "--porcelain"]);
    const unmergedStatuses = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
    return status
      .split("\n")
      .some((line) => unmergedStatuses.has(line.slice(0, 2)));
  }

  private async hasGitOperationInProgress(
    repositoryRoot: string,
    operationKind: ConflictResolutionInput["operationKind"]
  ): Promise<boolean> {
    const status = await this.gitRaw(repositoryRoot, ["status", "--untracked-files=no"]);
    if (operationKind === "rebase") {
      return status.includes("rebase in progress") || status.includes("currently rebasing");
    }

    return status.includes("still merging") || status.includes("merge in progress");
  }

  private async getConflictState(
    repositoryRoot: string,
    operationKind: ConflictResolutionInput["operationKind"]
  ): Promise<"inProgress" | "none" | "unresolved"> {
    if (await this.hasUnmergedConflicts(repositoryRoot)) {
      return "unresolved";
    }

    if (await this.hasGitOperationInProgress(repositoryRoot, operationKind)) {
      return "inProgress";
    }

    return "none";
  }

  private getConflictPrompt(operationName: string, autoStashed: boolean): string {
    if (autoStashed) {
      return `${operationName} has conflicts. Resolve all conflicted files, stage them, then continue here. GUI Git History will finish ${operationName} and restore your stashed changes. Do not create a manual commit.`;
    }

    return `${operationName} has conflicts. Resolve all conflicted files, stage them, then continue here. Do not create a manual commit.`;
  }

  private getContinueFailedPrompt(
    operationName: string,
    conflictState: "inProgress" | "unresolved"
  ): string {
    if (conflictState === "unresolved") {
      return `${operationName} still has unresolved conflicts. Resolve all conflicted files and stage them, then continue.`;
    }

    return `${operationName} is still in progress. Do not create a manual commit; resolve conflicts, stage the files, then continue from here.`;
  }

  private async runLoggedGit(repositoryRoot: string, args: readonly string[]): Promise<string> {
    this.logger?.info("git.command", {
      command: `git -C ${repositoryRoot} ${args.join(" ")}`
    });
    return this.gitRaw(repositoryRoot, args);
  }
}
