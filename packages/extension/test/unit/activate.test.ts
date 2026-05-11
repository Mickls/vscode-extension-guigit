import type { Disposable, ExtensionContext } from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHistoryViewProvider } from "../../src/views/GitHistoryViewProvider";

const vscodeMocks = vi.hoisted(() => {
  const providerDisposable = { dispose: vi.fn() };

  return {
    createFileSystemWatcher: vi.fn(() => ({
      dispose: vi.fn(),
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn()
    })),
    executeCommand: vi.fn(),
    getExtension: vi.fn(() => ({
      exports: {
        getAPI: vi.fn(() => ({
          onDidOpenRepository: vi.fn(() => ({ dispose: vi.fn() })),
          repositories: []
        }))
      }
    })),
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    providerDisposable,
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    outputChannel: {
      appendLine: vi.fn()
    },
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn()
    })),
    createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
    clipboardWriteText: vi.fn(),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => providerDisposable)
  };
});

const workspaceConfiguration = {
  get: vi.fn((key: string) => {
    if (key === "fileViewMode") {
      return "tree";
    }

    if (key === "language") {
      return "en";
    }

    return undefined;
  }),
  update: vi.fn()
};

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vscodeMocks.executeCommand,
    registerCommand: vscodeMocks.registerCommand
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2
  },
  Disposable: class {
    public constructor(public readonly dispose: () => void) {}
  },
  env: {
    clipboard: {
      writeText: vscodeMocks.clipboardWriteText
    },
    language: "en"
  },
  extensions: {
    getExtension: vscodeMocks.getExtension
  },
  RelativePattern: class {
    public constructor(
      public readonly folder: unknown,
      public readonly pattern: string
    ) {}
  },
  Range: class {
    public constructor(
      public readonly startLine: number,
      public readonly startCharacter: number,
      public readonly endLine: number,
      public readonly endCharacter: number
    ) {}
  },
  MarkdownString: class {
    public isTrusted = false;

    public constructor(public readonly value: string) {}
  },
  Uri: {
    joinPath: vi.fn((base: { path: string }, ...paths: readonly string[]) => ({
      path: [base.path, ...paths].join("/")
    }))
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel: vscodeMocks.createOutputChannel,
    createTextEditorDecorationType: vscodeMocks.createTextEditorDecorationType,
    onDidChangeActiveTextEditor: vscodeMocks.onDidChangeActiveTextEditor,
    onDidChangeTextEditorSelection: vscodeMocks.onDidChangeTextEditorSelection,
    registerWebviewViewProvider: vscodeMocks.registerWebviewViewProvider
  },
  workspace: {
    createFileSystemWatcher: vscodeMocks.createFileSystemWatcher,
    getConfiguration: vi.fn(() => workspaceConfiguration),
    onDidChangeConfiguration: vscodeMocks.onDidChangeConfiguration,
    onDidChangeTextDocument: vscodeMocks.onDidChangeTextDocument,
    workspaceFolders: []
  }
}));

describe("activate", () => {
  beforeEach(() => {
    vscodeMocks.createFileSystemWatcher.mockClear();
    vscodeMocks.createOutputChannel.mockClear();
    vscodeMocks.getExtension.mockClear();
    vscodeMocks.onDidChangeActiveTextEditor.mockClear();
    vscodeMocks.registerCommand.mockClear();
    vscodeMocks.registerWebviewViewProvider.mockClear();
    workspaceConfiguration.get.mockClear();
    workspaceConfiguration.update.mockClear();
  });

  it("registers the Git history webview provider", async () => {
    const { activate } = await import("../../src/extension/activate");
    const subscriptions: Disposable[] = [];
    const context = {
      extensionUri: { path: "/extension" },
      subscriptions
    } as ExtensionContext;

    activate(context);

    expect(vscodeMocks.registerWebviewViewProvider).toHaveBeenCalledWith(
      GitHistoryViewProvider.viewType,
      expect.any(GitHistoryViewProvider),
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    );
    expect(vscodeMocks.registerCommand).toHaveBeenCalledTimes(6);
    expect(vscodeMocks.onDidChangeActiveTextEditor).toHaveBeenCalled();
    expect(vscodeMocks.createOutputChannel).toHaveBeenCalledWith("GUI Git History", "guigit-log");
    expect(subscriptions).toContain(vscodeMocks.providerDisposable);
  });

  it("updates file view mode through the registered guigit configuration section", async () => {
    const { activate } = await import("../../src/extension/activate");
    const subscriptions: Disposable[] = [];
    const context = {
      extensionUri: { path: "/extension" },
      subscriptions
    } as ExtensionContext;
    let onDidReceiveMessage: ((request: unknown) => void) | undefined;

    activate(context);
    const provider = vscodeMocks.registerWebviewViewProvider.mock.calls[0]![1] as GitHistoryViewProvider;
    provider.resolveWebviewView({
      webview: {
        asWebviewUri: (uri: { path: string }) => uri,
        cspSource: "vscode-webview:",
        onDidReceiveMessage: (callback: (request: unknown) => void) => {
          onDidReceiveMessage = callback;
        },
        postMessage: vi.fn()
      }
    } as never);

    onDidReceiveMessage!({
      id: "settings-1",
      settings: {
        fileViewMode: "list"
      },
      type: "settings.update"
    });

    await vi.waitFor(() => {
      expect(workspaceConfiguration.update).toHaveBeenCalledWith("fileViewMode", "list", 2);
    });
  });
});
