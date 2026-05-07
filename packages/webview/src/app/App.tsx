import type { ReactElement } from "react";

export function App(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--vscode-editor-background)] px-4 text-[var(--vscode-editor-foreground)]">
      <h1 className="text-base font-semibold tracking-normal">GUI Git History</h1>
    </main>
  );
}
