import type { ExtensionContext } from "vscode";
import { commands as vscodeCommands, ConfigurationTarget, Disposable, extensions, RelativePattern, window, workspace } from "vscode";
import type { FileViewMode } from "../backend/rpc/contract";
import { createGitHistoryRpcHandlers } from "../backend/rpc/gitHistoryRpcHandlers";
import { createRpcRouter } from "../backend/rpc/router";
import { BranchService } from "../backend/git/BranchService";
import { CommitService } from "../backend/git/CommitService";
import { FileService } from "../backend/git/FileService";
import { GraphService } from "../backend/git/GraphService";
import { RepositoryService } from "../backend/git/RepositoryService";
import { LoggerService, type LogLevel } from "../logging/LoggerService";
import { CacheService } from "../state/CacheService";
import { WorkspaceStateService } from "../state/WorkspaceStateService";
import { GitHistoryViewProvider } from "../views/GitHistoryViewProvider";
import { registerGitHistoryCommands } from "./commands";
import { registerGitWatchers, type GitApiLike } from "./watchers";

interface GitExtensionExports {
  getAPI(version: 1): GitApiLike;
}

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
  const graphService = new GraphService({ logger });
  const router = createRpcRouter(
    createGitHistoryRpcHandlers({
      branchService,
      commitService,
      fileService,
      graphService,
      repositoryService
    }),
    logger
  );
  const viewProvider = new GitHistoryViewProvider(context, router);
  const gitExtension = extensions.getExtension<GitExtensionExports>("vscode.git");
  const git = gitExtension?.exports.getAPI(1);

  context.subscriptions.push(
    window.registerWebviewViewProvider(GitHistoryViewProvider.viewType, viewProvider),
    ...registerGitHistoryCommands({
      blame: {
        toggleBlame: () => logger.info("command.toggleBlame.pending")
      },
      executeCommand: vscodeCommands.executeCommand,
      logger,
      registerCommand: vscodeCommands.registerCommand,
      view: viewProvider
    }),
    ...registerGitWatchers({
      createFileSystemWatcher: (pattern) => workspace.createFileSystemWatcher(pattern as RelativePattern),
      createRelativePattern: (folder, pattern) => new RelativePattern(folder.uri.fsPath, pattern),
      git,
      logger,
      onDidChangeActiveTextEditor: window.onDidChangeActiveTextEditor,
      refresh: (reason) => viewProvider.refresh(reason),
      workspaceFolders: workspace.workspaceFolders ?? []
    }),
    outputChannel,
    new Disposable(() => undefined)
  );
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}
