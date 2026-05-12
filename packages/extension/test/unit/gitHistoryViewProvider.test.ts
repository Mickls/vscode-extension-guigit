import { describe, expect, it, vi } from "vitest";
import { GitHistoryViewProvider } from "../../src/views/GitHistoryViewProvider";

vi.mock("vscode", () => ({
  Uri: {
    joinPath: (...parts: Array<{ path?: string } | string>) => ({
      path: parts.map((part) => (typeof part === "string" ? part : part.path)).join("/"),
      toString: () => parts.map((part) => (typeof part === "string" ? part : part.path)).join("/")
    })
  }
}));

describe("GitHistoryViewProvider notifications", () => {
  it("posts history, working tree, and reveal notifications to the resolved webview", () => {
    const postMessage = vi.fn();
    const webviewView = createWebviewView(postMessage);
    const provider = new GitHistoryViewProvider(
      {
        extensionUri: { path: "/extension" }
      } as never,
      {
        dispatch: async (request) => ({
          id: request.id,
          ok: true,
          payload: {},
          type: request.type
        })
      } as never
    );

    provider.resolveWebviewView(webviewView);
    provider.refresh("command");
    provider.refresh({
      reason: "watcher",
      repositoryId: "/repo",
      type: "workingTree"
    });
    provider.revealCommit("abc1234");

    expect(webviewView.webview.options).toEqual({
      enableScripts: true,
      localResourceRoots: [{ path: "/extension/webview-dist", toString: expect.any(Function) }]
    });
    expect(postMessage).toHaveBeenCalledWith({
      reason: "command",
      type: "history.changed"
    });
    expect(postMessage).toHaveBeenCalledWith({
      reason: "watcher",
      repositoryId: "/repo",
      type: "workingTree.changed"
    });
    expect(postMessage).toHaveBeenCalledWith({
      hash: "abc1234",
      type: "history.revealCommit"
    });
  });

  it("queues working tree and reveal notifications until the webview is resolved", () => {
    const postMessage = vi.fn();
    const provider = new GitHistoryViewProvider({ extensionUri: { path: "/extension" } } as never);

    provider.refresh({
      reason: "watcher",
      repositoryId: "/repo",
      type: "workingTree"
    });
    provider.revealCommit("abc1234");
    provider.resolveWebviewView(createWebviewView(postMessage));

    expect(postMessage).toHaveBeenCalledWith({
      reason: "watcher",
      repositoryId: "/repo",
      type: "workingTree.changed"
    });
    expect(postMessage).toHaveBeenCalledWith({
      hash: "abc1234",
      type: "history.revealCommit"
    });
  });
});

function createWebviewView(postMessage: ReturnType<typeof vi.fn>) {
  return {
    webview: {
      asWebviewUri: (uri: { toString(): string }) => uri,
      cspSource: "vscode-webview:",
      html: "",
      onDidReceiveMessage: vi.fn(),
      options: {},
      postMessage
    }
  } as never;
}
