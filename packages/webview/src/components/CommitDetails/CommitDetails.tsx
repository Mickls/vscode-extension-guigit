import type { ReactElement } from "react";
import type { CommitDetailsViewModel } from "../../app/rpcContract.generated";
import { FileChanges } from "../FileChanges/FileChanges";

const sampleCommit: CommitDetailsViewModel = {
  author: "Mickls",
  body: "Keep Marketplace identity compatible while the rewrite moves into the new workspace.",
  canEditMessage: true,
  date: "Today",
  email: "mickls@example.com",
  files: [
    {
      binary: false,
      deletions: 2,
      insertions: 12,
      path: "packages/extension/package.json",
      status: "modified"
    },
    {
      binary: false,
      deletions: 0,
      insertions: 8,
      path: "docs/implementation-plan.md",
      status: "modified"
    }
  ],
  hash: "8f9d5c2b4a1e0d7c6b5a49382716151413121110",
  message: "Preserve extension identity",
  refs: [
    { name: "HEAD", type: "head" },
    { name: "main", type: "local" }
  ]
};

export interface CommitDetailsProps {
  commit?: CommitDetailsViewModel;
}

export function CommitDetails({ commit = sampleCommit }: CommitDetailsProps): ReactElement {
  return (
    <div className="space-y-4 p-4 text-xs">
      <section className="space-y-1 border-b border-[var(--vscode-panel-border)] pb-3">
        <div className="font-mono text-[11px] text-[var(--vscode-descriptionForeground)]">
          {commit.hash.slice(0, 7)}
        </div>
        <h2 className="text-sm font-semibold">{commit.message}</h2>
        <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
          {commit.author} - {commit.date}
        </div>
        <p className="max-w-[72ch] text-[11px] leading-5 text-[var(--vscode-descriptionForeground)]">
          {commit.body}
        </p>
      </section>
      <FileChanges files={commit.files} mode="list" />
    </div>
  );
}
