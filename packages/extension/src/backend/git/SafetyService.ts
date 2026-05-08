import { simpleGit } from "simple-git";
import { window } from "vscode";
import type { AutoStashPreference, OperationResultViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";

const stashMessage = "GUI Git History auto stash";
const stashAndContinue = "Stash and Continue";
const cancel = "Cancel";

export interface ConflictResolutionInput {
  abortArgs: readonly string[];
  continueArgs: readonly string[];
  operationKind: "merge" | "rebase";
  operationName: string;
}

interface ConflictSession {
  autoStashed: boolean;
  conflict: ConflictResolutionInput;
}

export interface SafetyServiceInput {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug" | "info">;
  showWarningMessage?: (message: string, ...items: readonly string[]) => Thenable<string | undefined>;
}

export class SafetyService {
  private readonly conflictSessions = new Map<string, ConflictSession>();
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

  public async continueOperation(repositoryRoot: string): Promise<OperationResultViewModel> {
    const session = this.conflictSessions.get(repositoryRoot);
    if (!session) {
      return {
        message: "No active git conflict to continue",
        status: "cancelled"
      };
    }

    try {
      await this.runLoggedGit(repositoryRoot, session.conflict.continueArgs);
      if (session.autoStashed) {
        await this.restoreAutoStash(repositoryRoot);
      }

      this.conflictSessions.delete(repositoryRoot);
      return {
        message: `${session.conflict.operationName} conflicts resolved`,
        status: "ok"
      };
    } catch (error) {
      const conflictState = await this.getConflictState(repositoryRoot, session.conflict.operationKind);
      if (conflictState !== "none") {
        this.logger?.debug("safety.conflict.continueFailed", {
          error: error instanceof Error ? error.message : String(error),
          operationName: session.conflict.operationName,
          repositoryRoot
        });
        return {
          message: this.getContinueFailedPrompt(session.conflict.operationName, conflictState),
          status: "conflict"
        };
      }

      throw error;
    }
  }

  public async abortOperation(repositoryRoot: string): Promise<OperationResultViewModel> {
    const session = this.conflictSessions.get(repositoryRoot);
    if (!session) {
      return {
        message: "No active git conflict to abort",
        status: "cancelled"
      };
    }

    await this.runLoggedGit(repositoryRoot, session.conflict.abortArgs);
    if (session.autoStashed) {
      await this.restoreAutoStash(repositoryRoot);
    }

    this.conflictSessions.delete(repositoryRoot);
    return {
      message: session.autoStashed
        ? `${session.conflict.operationName} aborted and stashed changes restored`
        : `${session.conflict.operationName} aborted`,
      status: "cancelled"
    };
  }

  private async runOperation(
    repositoryRoot: string,
    operation: () => Promise<OperationResultViewModel>,
    conflict: ConflictResolutionInput | undefined,
    autoStashed: boolean
  ): Promise<OperationResultViewModel> {
    try {
      const result = await operation();
      if (conflict && (await this.getConflictState(repositoryRoot, conflict.operationKind)) !== "none") {
        return this.startConflictSession(repositoryRoot, conflict, autoStashed);
      }

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
        return this.startConflictSession(repositoryRoot, conflict, autoStashed);
      }

      throw error;
    }
  }

  private startConflictSession(
    repositoryRoot: string,
    conflict: ConflictResolutionInput,
    autoStashed: boolean
  ): OperationResultViewModel {
    this.conflictSessions.set(repositoryRoot, {
      autoStashed,
      conflict
    });
    return {
      message: this.getConflictPrompt(conflict.operationName),
      status: "conflict"
    };
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

  private getConflictPrompt(operationName: string): string {
    return `${operationName} has conflicts. Resolve all conflicted files, stage them, then continue from GUI Git History.`;
  }

  private getContinueFailedPrompt(
    operationName: string,
    conflictState: "inProgress" | "unresolved"
  ): string {
    if (conflictState === "unresolved") {
      return `${operationName} still has unresolved conflicts. Resolve all conflicted files and stage them, then continue.`;
    }

    return `${operationName} is still in progress. Do not create a manual commit; resolve conflicts, stage the files, then continue from GUI Git History.`;
  }

  private async runLoggedGit(repositoryRoot: string, args: readonly string[]): Promise<string> {
    this.logger?.info("git.command", {
      command: `git -C ${repositoryRoot} ${args.join(" ")}`
    });
    return this.gitRaw(repositoryRoot, args);
  }
}
