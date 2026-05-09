import type { ExtensionContext } from "vscode";
import { commands as vscodeCommands, ConfigurationTarget, Disposable, extensions, Range, RelativePattern, window, workspace } from "vscode";
import type { FileViewMode } from "../backend/rpc/contract";
import { createGitHistoryRpcHandlers } from "../backend/rpc/gitHistoryRpcHandlers";
import { createRpcRouter } from "../backend/rpc/router";
import { BranchService } from "../backend/git/BranchService";
import { CommitService } from "../backend/git/CommitService";
import { FileService } from "../backend/git/FileService";
import { GitService } from "../backend/git/GitService";
import { GraphService } from "../backend/git/GraphService";
import { RemoteService } from "../backend/git/RemoteService";
import { RepositoryService } from "../backend/git/RepositoryService";
import { SafetyService } from "../backend/git/SafetyService";
import { ProxyService } from "../backend/git/ProxyService";
import { DiffService } from "../backend/vscode/DiffService";
import { BlameController } from "../backend/vscode/BlameController";
import { FileHistoryPanel } from "../backend/vscode/FileHistoryPanel";
import { LoggerService, type LogLevel } from "../logging/LoggerService";
import { CacheService } from "../state/CacheService";
import { SettingsService, type SettingsConfigurationKey } from "../state/SettingsService";
import { WorkspaceStateService } from "../state/WorkspaceStateService";
import { GitHistoryViewProvider } from "../views/GitHistoryViewProvider";
import { registerGitHistoryCommands } from "./commands";
import { registerGitWatchers, type GitApiLike } from "./watchers";

interface GitExtensionExports {
  getAPI(version: 1): GitApiLike;
}

export function activate(context: ExtensionContext): void {
  const outputChannel = window.createOutputChannel("GUI Git History", "guigit-log");
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
  const settingsService = new SettingsService({
    configuration: {
      get: (key) => workspace.getConfiguration().get(key),
      update: async (key: SettingsConfigurationKey, value) => {
        await workspace.getConfiguration().update(key, value, ConfigurationTarget.Workspace);
      }
    }
  });
  const graphService = new GraphService({ logger });
  const proxyService = new ProxyService({
    settingsService,
    vscodeProxy: () => workspace.getConfiguration("http").get<string>("proxy")
  });
  const remoteService = new RemoteService();
  const diffService = new DiffService({ logger });
  const safetyService = new SafetyService({ logger });
  const gitService = new GitService({
    logger,
    proxyService,
    safetyService,
    settingsService
  });
  const fileHistoryPanel = new FileHistoryPanel({
    activeEditorUri: () => window.activeTextEditor?.document.uri,
    logger,
    repositoryService
  });
  const blameController = new BlameController({
    activeEditor: () => window.activeTextEditor as never,
    createDecorationType: () => window.createTextEditorDecorationType({
      after: {
        color: "editorCodeLens.foreground",
        fontStyle: "italic",
        margin: "0 0 0 3em"
      }
    }),
    createRange: (startLine, startCharacter, endLine, endCharacter) => new Range(startLine, startCharacter, endLine, endCharacter),
    gitRaw: (repositoryRoot, args) => proxyService.runRaw(repositoryRoot, args),
    onDidChangeActiveTextEditor: (listener) => window.onDidChangeActiveTextEditor(listener as never),
    onDidChangeConfiguration: (listener) => workspace.onDidChangeConfiguration(listener),
    onDidChangeTextDocument: (listener) => workspace.onDidChangeTextDocument(listener as never),
    onDidChangeTextEditorSelection: (listener) => window.onDidChangeTextEditorSelection(listener as never),
    repositoryService,
    settingsService,
    updateBlameEnabled: async (enabled) => {
      await workspace.getConfiguration().update("guigit.blame.enabled", enabled, ConfigurationTarget.Global);
    }
  });
  const router = createRpcRouter(
    createGitHistoryRpcHandlers({
      branchService,
      commitService,
      diffService,
      fileHistoryPanel,
      fileService,
      gitService,
      graphService,
      remoteService,
      repositoryService,
      settingsService
    }),
    logger
  );
  const viewProvider = new GitHistoryViewProvider(context, router, fileHistoryPanel);
  const gitExtension = extensions.getExtension<GitExtensionExports>("vscode.git");
  const git = gitExtension?.exports.getAPI(1);

  context.subscriptions.push(
    window.registerWebviewViewProvider(GitHistoryViewProvider.viewType, viewProvider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    ...registerGitHistoryCommands({
      blame: {
        toggleBlame: () => {
          void blameController.toggleBlame();
        }
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
      initialActiveTextEditor: () => window.activeTextEditor,
      logger,
      onDidChangeActiveTextEditor: window.onDidChangeActiveTextEditor,
      refresh: (reason) => viewProvider.refresh(reason),
      workspaceFolders: workspace.workspaceFolders ?? []
    }),
    outputChannel,
    blameController,
    new Disposable(() => undefined)
  );
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}
