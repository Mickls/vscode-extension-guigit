import type { Disposable, Uri } from "vscode";
import type { Logger } from "../logging/LoggerService";

export interface GitHistoryCommandView {
  refresh(reason: "command"): void;
  revealCommit(hash: string): void;
  showFileHistoryForUri(resource?: Uri): Promise<void>;
}

export interface GitHistoryCommandInput {
  blame: {
    toggleBlame(): void;
  };
  executeCommand(command: string): Thenable<unknown>;
  logger: Pick<Logger, "debug" | "info">;
  registerCommand(command: string, callback: (...args: readonly unknown[]) => unknown): Disposable;
  view: GitHistoryCommandView;
}

export function registerGitHistoryCommands(input: GitHistoryCommandInput): readonly Disposable[] {
  return [
    input.registerCommand("guigit.showHistory", async () => {
      input.logger.debug("command.showHistory");
      await input.executeCommand("workbench.view.extension.guigit");
    }),
    input.registerCommand("guigit.refresh", () => {
      input.logger.debug("command.refresh");
      input.view.refresh("command");
    }),
    input.registerCommand("guigit.viewFileHistory", async (resource) => {
      input.logger.debug("command.viewFileHistory");
      await input.view.showFileHistoryForUri(resource as Uri | undefined);
    }),
    input.registerCommand("guigit.toggleBlame", () => {
      input.logger.debug("command.toggleBlame");
      input.blame.toggleBlame();
    }),
    input.registerCommand("guigit.showCommitDetails", async (hash) => {
      input.logger.debug("command.showCommitDetails", { hash });
      await input.executeCommand("workbench.view.extension.guigit");
      input.view.revealCommit(hash as string);
    })
  ];
}
