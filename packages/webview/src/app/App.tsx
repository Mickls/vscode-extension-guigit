import type { MouseEvent, ReactElement } from "react";
import { useState } from "react";
import type { FileChangeViewModel, RemoteViewModel } from "./rpcContract.generated";
import { CompareOverlay } from "../components/CompareOverlay/CompareOverlay";
import { CommitDetails } from "../components/CommitDetails/CommitDetails";
import { CommitList } from "../components/CommitList/CommitList";
import { ContextMenu, type ContextMenuAction } from "../components/ContextMenu/ContextMenu";
import { Header } from "../components/Header/Header";
import { SplitPanels } from "../components/Layout/SplitPanels";
import { RemoteManager } from "../components/RemoteManager/RemoteManager";
import { SettingsMenu, type SettingsMenuAction } from "../components/SettingsMenu/SettingsMenu";

const sampleRemotes: readonly RemoteViewModel[] = [
  {
    fetchUrl: "git@github.com:Mickls/vscode-extension-guigit.git",
    name: "origin",
    pushUrl: "git@github.com:Mickls/vscode-extension-guigit.git"
  }
];

const sampleCompareFiles: readonly FileChangeViewModel[] = [
  {
    binary: false,
    deletions: 2,
    insertions: 5,
    path: "packages/extension/src/extension/activate.ts",
    status: "modified"
  }
];

export function App(): ReactElement {
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [remoteManagerOpen, setRemoteManagerOpen] = useState(false);
  const [compareOverlayOpen, setCompareOverlayOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0
  });

  const openCommitContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setSettingsMenuOpen(false);
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY
    });
  };

  const handleContextMenuAction = (action: ContextMenuAction) => {
    setContextMenu((current) => ({ ...current, visible: false }));

    if (action === "compare") {
      setCompareOverlayOpen(true);
    }
  };

  const handleSettingsMenuAction = (action: SettingsMenuAction) => {
    setSettingsMenuOpen(false);

    if (action === "manageRemotes") {
      setRemoteManagerOpen(true);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      <Header
        onSettingsClick={() => {
          setContextMenu((current) => ({ ...current, visible: false }));
          setSettingsMenuOpen((open) => !open);
        }}
        settingsOpen={settingsMenuOpen}
      />
      <SplitPanels left={<CommitList onCommitContextMenu={openCommitContextMenu} />} right={<CommitDetails />} />
      <ContextMenu
        canEditCommitMessage
        onAction={handleContextMenuAction}
        selectedCommitCount={2}
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
      />
      <SettingsMenu onAction={handleSettingsMenuAction} visible={settingsMenuOpen} x={0} y={44} />
      <RemoteManager
        onClose={() => setRemoteManagerOpen(false)}
        open={remoteManagerOpen}
        remotes={sampleRemotes}
      />
      <CompareOverlay
        files={sampleCompareFiles}
        fromHash="8f9d5c2b4a1e0d7c6b5a49382716151413121110"
        onClose={() => setCompareOverlayOpen(false)}
        open={compareOverlayOpen}
        toHash="72ea7564a1e0d7c6b5a49382716151413121110"
      />
    </main>
  );
}
