import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileHistoryPanel } from "../../src/backend/vscode/FileHistoryPanel";

const vscodeExtensions = vi.hoisted(() => ({
  all: [] as { packageJSON: unknown }[]
}));

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn()
  },
  extensions: vscodeExtensions,
  languages: {
    setTextDocumentLanguage: vi.fn()
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, toString: () => path })
  },
  ViewColumn: {
    One: 1,
    Two: 2
  },
  window: {
    activeTextEditor: undefined,
    createWebviewPanel: vi.fn(),
    showTextDocument: vi.fn()
  },
  workspace: {
    openTextDocument: vi.fn()
  }
}));

describe("FileHistoryPanel", () => {
  beforeEach(() => {
    vscodeExtensions.all = [];
  });

  it("opens working files by repository-relative path", async () => {
    const executeCommand = vi.fn();
    const panel = new FileHistoryPanel({
      executeCommand,
      fileExists: () => true,
      repositoryService: createRepositoryService()
    });

    await expect(panel.openWorkingFile("/repo", "src/file.ts")).resolves.toEqual({
      message: "Opened src/file.ts",
      status: "ok"
    });

    expect(executeCommand).toHaveBeenCalledWith("vscode.open", expect.objectContaining({ fsPath: "/repo/src/file.ts" }), {
      preview: false,
      viewColumn: 1
    });
  });

  it("opens existing working files directly even when a commit hash is provided", async () => {
    const executeCommand = vi.fn();
    const gitRaw = vi.fn();
    const virtualDocuments = {
      createDocument: vi.fn()
    };
    const panel = new FileHistoryPanel({
      executeCommand,
      fileExists: () => true,
      gitRaw,
      repositoryService: createRepositoryService(),
      virtualDocuments
    });

    await panel.openWorkingFile("/repo", "src/file.ts", "abc1234567890abcdef");

    expect(gitRaw).not.toHaveBeenCalled();
    expect(virtualDocuments.createDocument).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalledWith("vscode.open", expect.objectContaining({ fsPath: "/repo/src/file.ts" }), {
      preview: false,
      viewColumn: 1
    });
  });

  it("opens missing working files as locked commit snapshots with a short hash in the tab name", async () => {
    const executeCommand = vi.fn();
    const setTextDocumentLanguage = vi.fn(async (document) => document);
    const showTextDocument = vi.fn();
    const virtualDocuments = {
      createDocument: vi.fn((content: string, fileName: string) => `${fileName}:${content}`)
    };
    const panel = new FileHistoryPanel({
      executeCommand,
      fileExists: () => false,
      gitRaw: async () => "historical content",
      languageIdForPath: () => "typescript",
      openTextDocument: async (uri) => ({ uri }),
      repositoryService: createRepositoryService(),
      setTextDocumentLanguage,
      showTextDocument,
      virtualDocuments
    });

    await expect(panel.openWorkingFile("/repo", "src/deleted.ts", "abc1234567890abcdef")).resolves.toEqual({
      message: "Opened src/deleted.ts",
      status: "ok"
    });

    expect(virtualDocuments.createDocument).toHaveBeenCalledWith("historical content", "src/deleted.ts (abc1234)");
    expect(setTextDocumentLanguage).toHaveBeenCalledWith({ uri: "src/deleted.ts (abc1234):historical content" }, "typescript");
    expect(showTextDocument).toHaveBeenCalledWith({ uri: "src/deleted.ts (abc1234):historical content" }, {
      preview: false,
      viewColumn: 1
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("detects snapshot language from the original changed file path", async () => {
    vscodeExtensions.all = [
      {
        packageJSON: {
          contributes: {
            languages: [
              {
                extensions: [".ts"],
                id: "typescript"
              }
            ]
          }
        }
      }
    ];
    const setTextDocumentLanguage = vi.fn(async (document) => document);
    const showTextDocument = vi.fn();
    const panel = new FileHistoryPanel({
      executeCommand: vi.fn(),
      fileExists: () => false,
      gitRaw: async () => "const value = 1;",
      openTextDocument: async (uri) => ({ uri }),
      repositoryService: createRepositoryService(),
      setTextDocumentLanguage,
      showTextDocument,
      virtualDocuments: {
        createDocument: (content, fileName) => `${fileName}:${content}`
      }
    });

    await panel.openWorkingFile("/repo", "src/deleted.ts", "abc1234567890abcdef");

    expect(setTextDocumentLanguage).toHaveBeenCalledWith({ uri: "src/deleted.ts (abc1234):const value = 1;" }, "typescript");
    expect(showTextDocument).toHaveBeenCalledWith({ uri: "src/deleted.ts (abc1234):const value = 1;" }, {
      preview: false,
      viewColumn: 1
    });
  });

  it("does not open editable file buffers for missing files without a commit hash", async () => {
    const executeCommand = vi.fn();
    const panel = new FileHistoryPanel({
      executeCommand,
      fileExists: () => false,
      repositoryService: createRepositoryService()
    });

    await expect(panel.openWorkingFile("/repo", "app.txt.bak")).resolves.toEqual({
      message: "Cannot open missing file app.txt.bak without a commit snapshot",
      status: "cancelled"
    });

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("opens deleted commit file snapshots from the first parent", async () => {
    const executeCommand = vi.fn();
    const showTextDocument = vi.fn();
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args[1] === "abc1234567890abcdef:src/deleted.ts") {
        throw new Error("path does not exist in commit");
      }

      if (args[3] === "abc1234567890abcdef") {
        return "parent123";
      }

      return "deleted content";
    });
    const virtualDocuments = {
      createDocument: vi.fn((content: string, fileName: string) => `${fileName}:${content}`)
    };
    const panel = new FileHistoryPanel({
      executeCommand,
      fileExists: () => false,
      gitRaw,
      openTextDocument: async (uri) => ({ uri }),
      repositoryService: createRepositoryService(),
      showTextDocument,
      virtualDocuments
    });

    await panel.openWorkingFile("/repo", "src/deleted.ts", "abc1234567890abcdef");

    expect(gitRaw).toHaveBeenCalledWith("/repo", ["show", "abc1234567890abcdef:src/deleted.ts"]);
    expect(gitRaw).toHaveBeenCalledWith("/repo", ["show", "--no-patch", "--pretty=%P", "abc1234567890abcdef"]);
    expect(gitRaw).toHaveBeenCalledWith("/repo", ["show", "parent123:src/deleted.ts"]);
    expect(virtualDocuments.createDocument).toHaveBeenCalledWith("deleted content", "src/deleted.ts (abc1234)");
    expect(showTextDocument).toHaveBeenCalledWith({ uri: "src/deleted.ts (abc1234):deleted content" }, {
      preview: false,
      viewColumn: 1
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("opens deleted root files with their short hash suffix", async () => {
    const executeCommand = vi.fn();
    const showTextDocument = vi.fn();
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args[1] === "c8f1b322cca8ca928eab15180b9f386fcd9df921:app.txt.bak") {
        throw new Error("path does not exist in commit");
      }

      if (args[3] === "c8f1b322cca8ca928eab15180b9f386fcd9df921") {
        return "2638564d4898d01a5b3373c0a1ac1da03aee71cc";
      }

      return "sda";
    });
    const virtualDocuments = {
      createDocument: vi.fn((content: string, fileName: string) => `${fileName}:${content}`)
    };
    const panel = new FileHistoryPanel({
      executeCommand,
      fileExists: () => false,
      gitRaw,
      openTextDocument: async (uri) => ({ uri }),
      repositoryService: createRepositoryService(),
      showTextDocument,
      virtualDocuments
    });

    await panel.openWorkingFile("/Users/jiangcheng/code/github/it-tools", "app.txt.bak", "c8f1b322cca8ca928eab15180b9f386fcd9df921");

    expect(virtualDocuments.createDocument).toHaveBeenCalledWith("sda", "app.txt.bak (c8f1b32)");
    expect(showTextDocument).toHaveBeenCalledWith({ uri: "app.txt.bak (c8f1b32):sda" }, {
      preview: false,
      viewColumn: 1
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });


  it("renders file history and reveals commits from panel clicks", async () => {
    const executeCommand = vi.fn();
    let receivedMessage: ((message: unknown) => void) | undefined;
    const panelLike = {
      webview: {
        html: "",
        onDidReceiveMessage: (callback: (message: unknown) => void) => {
          receivedMessage = callback;
          return { dispose: vi.fn() };
        }
      }
    };
    const panel = new FileHistoryPanel({
      createWebviewPanel: vi.fn(() => panelLike),
      executeCommand,
      gitRaw: async () => "abc1234567890abcdef\u001fabc1234\u001fAda\u001f2026-05-08 13:00:00 +0800\u001fUpdate file\n",
      repositoryService: createRepositoryService()
    });

    await expect(panel.openHistory("/repo", "src/file.ts")).resolves.toEqual({
      message: "Opened history for src/file.ts",
      status: "ok"
    });

    expect(panelLike.webview.html).toContain("File History: src/file.ts");
    expect(panelLike.webview.html).toContain("Update file");

    receivedMessage?.({ hash: "abc1234567890abcdef", type: "revealCommit" });

    expect(executeCommand).toHaveBeenCalledWith("guigit.showCommitDetails", "abc1234567890abcdef");
  });

  it("opens file history from explorer or editor resources", async () => {
    const gitRaw = vi.fn(async () => "");
    const panel = new FileHistoryPanel({
      createWebviewPanel: vi.fn(() => ({
        webview: {
          html: "",
          onDidReceiveMessage: vi.fn()
        }
      })),
      gitRaw,
      repositoryService: createRepositoryService()
    });

    await panel.openHistoryForUri({ fsPath: "/repo/src/file.ts", toString: () => "/repo/src/file.ts" });

    expect(gitRaw).toHaveBeenCalledWith("/repo", [
      "log",
      "--follow",
      "--date=iso",
      "--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s",
      "--",
      "src/file.ts"
    ]);
  });
});

function createRepositoryService() {
  return {
    discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }]
  };
}
