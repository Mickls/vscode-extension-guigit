import type { ExtensionContext } from "vscode";
import { Disposable } from "vscode";

export function activate(context: ExtensionContext): void {
  context.subscriptions.push(new Disposable(() => undefined));
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}
