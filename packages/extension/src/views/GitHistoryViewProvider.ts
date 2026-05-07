import type { ExtensionContext, Webview, WebviewView, WebviewViewProvider } from "vscode";
import { randomUUID } from "node:crypto";
import { Uri } from "vscode";
import type { RpcRequest } from "../backend/rpc/contract";
import { createRpcRouter, type RpcRouter } from "../backend/rpc/router";
import { createWebviewShellHtml } from "./webviewShellHtml";

export class GitHistoryViewProvider implements WebviewViewProvider {
  public static readonly viewType = "guigit.historyView";

  public constructor(
    private readonly context: ExtensionContext,
    private readonly router: RpcRouter = createRpcRouter({})
  ) {}

  public resolveWebviewView(webviewView: WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.webviewDistUri()]
    };

    webviewView.webview.html = this.createHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((request: RpcRequest) => {
      void this.router.dispatch(request).then((response) => webviewView.webview.postMessage(response));
    });
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
    return Uri.joinPath(this.context.extensionUri, "..", "webview", "dist");
  }
}
