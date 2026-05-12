import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { commands as vscodeCommands, ConfigurationTarget, Disposable, env, extensions, MarkdownString, Range, RelativePattern, window, workspace } from "vscode";
import type { FileViewMode } from "../backend/rpc/contract";
import { CommitMessageAiService } from "../backend/git/CommitMessageAiService";
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
import { WorkingTreeService } from "../backend/git/WorkingTreeService";
import { LanguageService } from "../backend/i18n/LanguageService";
import { LanguageModelCommitMessageProvider } from "../backend/vscode/LanguageModelCommitMessageProvider";
import { OpenAICompatibleCommitMessageProvider } from "../backend/git/OpenAICompatibleCommitMessageProvider";
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
  const guigitConfiguration = () => workspace.getConfiguration("guigit");
  const outputChannel = window.createOutputChannel("GUI Git History", "guigit-log");
  const logger = new LoggerService({
    level: () => guigitConfiguration().get<LogLevel>("logLevel") ?? "info",
    sink: outputChannel
  });
  logger.info("extension.activate");

  const cache = new CacheService();
  const repositoryState = new WorkspaceStateService({
    storage: context.workspaceState
  });
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
      get: (key) => guigitConfiguration().get<FileViewMode>(key) ?? "tree",
      update: async (key, value) => {
        await guigitConfiguration().update(key, value, ConfigurationTarget.Workspace);
      }
    },
    logger
  });
  const settingsService = new SettingsService({
    configuration: {
      get: (key) => guigitConfiguration().get(key),
      update: async (key: SettingsConfigurationKey, value) => {
        await guigitConfiguration().update(key, value, ConfigurationTarget.Workspace);
      }
    },
    secretStorage: {
      delete: async (key) => {
        await context.secrets.delete(key);
      },
      get: async (key) => context.secrets.get(key),
      store: async (key, value) => {
        await context.secrets.store(key, value);
      }
    },
    showInputBox: (options) => window.showInputBox(options),
    showQuickPick: (items, options) => window.showQuickPick([...items], options)
  });
  const languageModelProvider = new LanguageModelCommitMessageProvider({
    selectChatModels: async () => {
      const models = await ((vscode as unknown as {
        lm: {
          selectChatModels(selector: Record<string, unknown>): Promise<
            readonly {
              sendRequest(messages: readonly unknown[]): Promise<{
                stream: AsyncIterable<unknown>;
              }>;
            }[]
          >;
        };
        LanguageModelChatMessage: {
          User(content: string): unknown;
        };
      }).lm.selectChatModels({}));

      return models.map((model) => ({
        sendRequest: async (messages: readonly string[]) => {
          const response = await model.sendRequest(
            messages.map((message) =>
              (vscode as unknown as {
                LanguageModelChatMessage: {
                  User(content: string): unknown;
                };
              }).LanguageModelChatMessage.User(message)
            )
          );
          let content = "";
          for await (const part of response.stream) {
            if (typeof part === "string") {
              content += part;
              continue;
            }

            if (part && typeof part === "object" && "value" in part) {
              content += (part as { value?: string }).value ?? "";
            }
          }

          return content;
        }
      }));
    }
  });
  const openAICompatibleProvider = new OpenAICompatibleCommitMessageProvider();
  const commitMessageAiService = new CommitMessageAiService({
    gitRaw: (repositoryRoot, args) => proxyService.runRaw(repositoryRoot, args),
    languageModelProvider,
    openAICompatibleProvider,
    settingsService
  });
  const languageService = new LanguageService({
    settingsService,
    showQuickPick: (items, options) => window.showQuickPick([...items], options),
    uiLanguage: () => env.language
  });
  const graphService = new GraphService({ logger });
  const proxyService = new ProxyService({
    settingsService,
    showInputBox: (options) => window.showInputBox(options),
    showQuickPick: (items, options) => window.showQuickPick([...items], options),
    vscodeProxy: () => workspace.getConfiguration("http").get<string>("proxy")
  });
  const remoteService = new RemoteService();
  const workingTreeService = new WorkingTreeService({
    gitRaw: (repositoryRoot, args) => proxyService.runRaw(repositoryRoot, args),
    showWarningMessage: (message, options, ...items) => window.showWarningMessage(message, options, ...items)
  });
  const diffService = new DiffService({ logger });
  const safetyService = new SafetyService({ logger });
  const gitService = new GitService({
    logger,
    proxyService,
    safetyService,
    settingsService,
    stateService: repositoryState
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
        color: "rgba(127, 127, 127, 0.72)",
        fontStyle: "italic",
        margin: "0 0 0 3em"
      }
    }),
    createMarkdownString: (value) => new MarkdownString(value),
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
      commitMessageAiService,
      languageService,
      proxyService,
      remoteService,
      repositoryService,
      settingsService,
      workingTreeService
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
      writeClipboardText: (value) => env.clipboard.writeText(value),
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
