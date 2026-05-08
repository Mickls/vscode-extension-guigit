import { simpleGit } from "simple-git";
import { window } from "vscode";
import type { AutoStashPreference, OperationResultViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";

const stashMessage = "GUI Git History auto stash";
const stashAndContinue = "Stash and Continue";
const cancel = "Cancel";

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
    operation: () => Promise<OperationResultViewModel>
  ): Promise<OperationResultViewModel> {
    if (!(await this.hasUncommittedChanges(repositoryRoot))) {
      return operation();
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
    try {
      return await operation();
    } finally {
      this.logger?.debug("safety.autoStash.pop", { repositoryRoot });
      await this.runLoggedGit(repositoryRoot, ["stash", "pop"]);
    }
  }

  private async runLoggedGit(repositoryRoot: string, args: readonly string[]): Promise<string> {
    this.logger?.info("git.command", {
      command: `git -C ${repositoryRoot} ${args.join(" ")}`
    });
    return this.gitRaw(repositoryRoot, args);
  }
}
