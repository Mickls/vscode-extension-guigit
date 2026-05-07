import type { ExtensionContext } from "vscode";
import { Disposable, window } from "vscode";
import { GitHistoryViewProvider } from "../views/GitHistoryViewProvider";

export function activate(context: ExtensionContext): void {
  context.subscriptions.push(
    window.registerWebviewViewProvider(GitHistoryViewProvider.viewType, new GitHistoryViewProvider(context)),
    new Disposable(() => undefined)
  );
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}
