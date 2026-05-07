import type { ReactElement } from "react";
import { CommitDetails } from "../components/CommitDetails/CommitDetails";
import { CommitList } from "../components/CommitList/CommitList";
import { Header } from "../components/Header/Header";
import { SplitPanels } from "../components/Layout/SplitPanels";

export function App(): ReactElement {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      <Header />
      <SplitPanels left={<CommitList />} right={<CommitDetails />} />
    </main>
  );
}
