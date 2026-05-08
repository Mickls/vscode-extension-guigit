import { describe, expect, it, vi } from "vitest";
import { FileHistoryPanel } from "../../src/backend/vscode/FileHistoryPanel";

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn()
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
    createWebviewPanel: vi.fn()
  }
}));

describe("FileHistoryPanel", () => {
  it("opens working files by repository-relative path", async () => {
    const executeCommand = vi.fn();
    const panel = new FileHistoryPanel({
      executeCommand,
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
