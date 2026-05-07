import type { ExtensionContext, Webview, WebviewView, WebviewViewProvider } from "vscode";
import { randomUUID } from "node:crypto";
import { Uri } from "vscode";
import type { BackendNotification, RpcRequest } from "../backend/rpc/contract";
import { createRpcRouter, type RpcRouter } from "../backend/rpc/router";
import { createWebviewShellHtml } from "./webviewShellHtml";

export class GitHistoryViewProvider implements WebviewViewProvider {
  public static readonly viewType = "guigit.historyView";
  private pendingNotifications: BackendNotification[] = [];
  private webviewView: WebviewView | undefined;

  public constructor(
    private readonly context: ExtensionContext,
    private readonly router: RpcRouter = createRpcRouter({})
  ) {}

  public resolveWebviewView(webviewView: WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.webviewDistUri()]
    };

    webviewView.webview.html = this.createHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((request: RpcRequest) => {
      void this.router.dispatch(request).then((response) => webviewView.webview.postMessage(response));
    });
    this.flushPendingNotifications();
  }

  public refresh(reason: "command" | "watcher" | "operation" = "command"): void {
    void this.postNotification({
      reason,
      type: "history.changed"
    });
  }

  public revealCommit(hash: string): void {
    void this.postNotification({
      hash,
      type: "history.revealCommit"
    });
  }

  public showFileHistoryForUri(resource?: Uri): Promise<void> {
    void resource;
    this.refresh("command");
    return Promise.resolve();
  }

  private async postNotification(notification: BackendNotification): Promise<void> {
    if (!this.webviewView) {
      this.pendingNotifications.push(notification);
      return;
    }

    await this.webviewView.webview.postMessage(notification);
  }

  private flushPendingNotifications(): void {
    const notifications = this.pendingNotifications;
    this.pendingNotifications = [];
    for (const notification of notifications) {
      void this.postNotification(notification);
    }
  }

  private createHtml(webview: Webview): string {
    const scriptUri = webview.asWebviewUri(Uri.joinPath(this.webviewDistUri(), "assets", "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(this.webviewDistUri(), "assets", "index.css"));

    return createWebviewShellHtml({
      cspSource: webview.cspSource,
      nonce: randomUUID(),
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString()
    });
  }

  private webviewDistUri(): Uri {
    return Uri.joinPath(this.context.extensionUri, "webview-dist");
  }
}
