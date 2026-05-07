import type { MouseEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackendNotification,
  CommitDetailsViewModel,
  CommitListItemViewModel,
  FileChangeViewModel,
  GraphLayoutViewModel,
  RemoteViewModel,
  RpcResponse
} from "./rpcContract.generated";
import type { RpcClient } from "./rpcClient";
import { CompareOverlay } from "../components/CompareOverlay/CompareOverlay";
import { CommitDetails } from "../components/CommitDetails/CommitDetails";
import { CommitList } from "../components/CommitList/CommitList";
import { ContextMenu, type ContextMenuAction } from "../components/ContextMenu/ContextMenu";
import { Header } from "../components/Header/Header";
import { SplitPanels } from "../components/Layout/SplitPanels";
import { RemoteManager } from "../components/RemoteManager/RemoteManager";
import { SettingsMenu, type SettingsMenuAction } from "../components/SettingsMenu/SettingsMenu";

const emptyGraph: GraphLayoutViewModel = {
  edges: [],
  nodes: []
};

const emptyRemotes: readonly RemoteViewModel[] = [];
const emptyCompareFiles: readonly FileChangeViewModel[] = [];

export interface AppProps {
  rpcClient?: RpcClient;
}

export function App({ rpcClient }: AppProps): ReactElement {
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [remoteManagerOpen, setRemoteManagerOpen] = useState(false);
  const [compareOverlayOpen, setCompareOverlayOpen] = useState(false);
  const [commits, setCommits] = useState<readonly CommitListItemViewModel[]>([]);
  const [graph, setGraph] = useState<GraphLayoutViewModel>(emptyGraph);
  const [graphVisible, setGraphVisible] = useState(true);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | undefined>();
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | undefined>();
  const [commitDetails, setCommitDetails] = useState<CommitDetailsViewModel | undefined>();
  const selectedCommitHashRef = useRef<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0
  });

  const client = useMemo(() => rpcClient, [rpcClient]);

  useEffect(() => {
    requestHistory(client);
  }, [client]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<BackendNotification | RpcResponse>) => {
      const response = event.data;
      if (isBackendNotification(response)) {
        if (response.type === "history.changed") {
          requestHistory(client);
        }

        if (response.type === "history.revealCommit") {
          requestHistory(client, response.hash);
        }

        return;
      }

      if (!response.ok) {
        return;
      }

      if (response.type === "history.load") {
        setCommits(response.payload.commits);
        setGraph(emptyGraph);

        const repositoryId = response.payload.repositories[0]?.id;
        const commit = response.payload.commits[0];
        setSelectedRepositoryId(repositoryId);
        setSelectedCommitHash(commit?.hash);
        selectedCommitHashRef.current = commit?.hash;
        setCommitDetails(undefined);

        if (repositoryId && commit) {
          requestCommitDetails(client, repositoryId, commit.hash);
        }

        if (repositoryId && response.payload.commits.length > 0) {
          requestGraphLayout(
            client,
            repositoryId,
            response.payload.commits.map((historyCommit) => historyCommit.hash)
          );
        }
      }

      if (response.type === "commits.getDetails" && response.payload.commit.hash === selectedCommitHashRef.current) {
        setCommitDetails(response.payload.commit);
      }

      if (response.type === "graph.getLayout") {
        setGraph(response.payload.graph);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, [client]);

  const selectCommit = (commit: CommitListItemViewModel) => {
    setSelectedCommitHash(commit.hash);
    selectedCommitHashRef.current = commit.hash;
    setCommitDetails(undefined);

    if (selectedRepositoryId) {
      requestCommitDetails(client, selectedRepositoryId, commit.hash);
    }
  };

  const selectGraphNode = (hash: string) => {
    const commit = commits.find((candidate) => candidate.hash === hash);
    if (commit) {
      selectCommit(commit);
    }
  };

  const openCommitContextMenu = (event: MouseEvent<HTMLElement>, commit: CommitListItemViewModel) => {
    event.preventDefault();
    setSettingsMenuOpen(false);
    setSelectedCommitHash(commit.hash);
    selectedCommitHashRef.current = commit.hash;
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
        graphVisible={graphVisible}
        onGraphToggle={() => setGraphVisible((visible) => !visible)}
        onSettingsClick={() => {
          setContextMenu((current) => ({ ...current, visible: false }));
          setSettingsMenuOpen((open) => !open);
        }}
        settingsOpen={settingsMenuOpen}
      />
      <SplitPanels
        left={
          <CommitList
            commits={commits}
            graph={graph}
            graphVisible={graphVisible}
            onCommitContextMenu={openCommitContextMenu}
            onCommitSelect={selectCommit}
            onGraphNodeSelect={selectGraphNode}
            selectedHash={selectedCommitHash}
          />
        }
        right={<CommitDetails commit={commitDetails} />}
      />
      <ContextMenu
        canEditCommitMessage={commits.find((commit) => commit.hash === selectedCommitHash)?.canEditMessage ?? false}
        onAction={handleContextMenuAction}
        selectedCommitCount={selectedCommitHash ? Math.min(commits.length, 2) : 0}
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
      />
      <SettingsMenu onAction={handleSettingsMenuAction} visible={settingsMenuOpen} x={0} y={44} />
      <RemoteManager
        onClose={() => setRemoteManagerOpen(false)}
        open={remoteManagerOpen}
        remotes={emptyRemotes}
      />
      <CompareOverlay
        files={emptyCompareFiles}
        fromHash={commits[0]?.hash ?? ""}
        onClose={() => setCompareOverlayOpen(false)}
        open={compareOverlayOpen}
        toHash={commits[1]?.hash ?? ""}
      />
    </main>
  );
}

function requestCommitDetails(client: RpcClient | undefined, repositoryId: string, hash: string): void {
  client?.post({
    hash,
    id: crypto.randomUUID(),
    repositoryId,
    type: "commits.getDetails"
  });
}

function requestHistory(client: RpcClient | undefined, search?: string): void {
  client?.post({
    id: crypto.randomUUID(),
    pageSize: 50,
    search,
    type: "history.load"
  });
}

function requestGraphLayout(client: RpcClient | undefined, repositoryId: string, hashes: readonly string[]): void {
  client?.post({
    hashes,
    id: crypto.randomUUID(),
    repositoryId,
    type: "graph.getLayout"
  });
}

function isBackendNotification(message: BackendNotification | RpcResponse): message is BackendNotification {
  return !("ok" in message);
}
