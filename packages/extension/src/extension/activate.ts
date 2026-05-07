import type { ExtensionContext } from "vscode";
import { ConfigurationTarget, Disposable, window, workspace } from "vscode";
import type { FileViewMode } from "../backend/rpc/contract";
import { createGitHistoryRpcHandlers } from "../backend/rpc/gitHistoryRpcHandlers";
import { createRpcRouter } from "../backend/rpc/router";
import { BranchService } from "../backend/git/BranchService";
import { CommitService } from "../backend/git/CommitService";
import { FileService } from "../backend/git/FileService";
import { RepositoryService } from "../backend/git/RepositoryService";
import { LoggerService, type LogLevel } from "../logging/LoggerService";
import { CacheService } from "../state/CacheService";
import { WorkspaceStateService } from "../state/WorkspaceStateService";
import { GitHistoryViewProvider } from "../views/GitHistoryViewProvider";

export function activate(context: ExtensionContext): void {
  const outputChannel = window.createOutputChannel("GUI Git History");
  const logger = new LoggerService({
    level: () => workspace.getConfiguration().get<LogLevel>("guigit.logLevel") ?? "info",
    sink: outputChannel
  });
  logger.info("extension.activate");

  const cache = new CacheService();
  const repositoryState = new WorkspaceStateService();
  const repositoryService = new RepositoryService({
    activeEditorPath: () => window.activeTextEditor?.document.uri.fsPath,
    state: repositoryState,
    workspaceFolders: workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []
  });
  const branchService = new BranchService();
  const commitService = new CommitService({ cache, logger });
  const fileService = new FileService({
    cache,
    configuration: {
      get: (key) => workspace.getConfiguration().get<FileViewMode>(key) ?? "tree",
      update: async (key, value) => {
        await workspace.getConfiguration().update(key, value, ConfigurationTarget.Workspace);
      }
    },
    logger
  });
  const router = createRpcRouter(
    createGitHistoryRpcHandlers({
      branchService,
      commitService,
      fileService,
      repositoryService
    }),
    logger
  );

  context.subscriptions.push(
    window.registerWebviewViewProvider(GitHistoryViewProvider.viewType, new GitHistoryViewProvider(context, router)),
    outputChannel,
    new Disposable(() => undefined)
  );
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}
