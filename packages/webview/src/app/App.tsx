import type { MouseEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackendNotification,
  CommitDetailsViewModel,
  CommitListItemViewModel,
  FileChangeViewModel,
  FileViewMode,
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
  nodes: [],
  width: 120
};

const emptyRemotes: readonly RemoteViewModel[] = [];
const emptyCompareFiles: readonly FileChangeViewModel[] = [];
const pageSize = 50;
const defaultFileViewMode: FileViewMode = "list";

export interface AppProps {
  rpcClient?: RpcClient;
}

interface HistoryRequestMeta {
  append: boolean;
  repositoryId?: string;
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
  const [fileViewMode, setFileViewMode] = useState<FileViewMode>(defaultFileViewMode);
  const commitsRef = useRef<readonly CommitListItemViewModel[]>([]);
  const hasMoreRef = useRef(false);
  const nextCursorRef = useRef<string | undefined>(undefined);
  const pendingHistoryRequestsRef = useRef(new Map<string, HistoryRequestMeta>());
  const selectedRepositoryIdRef = useRef<string | undefined>(undefined);
  const loadingMoreRef = useRef(false);
  const selectedCommitHashRef = useRef<string | undefined>(undefined);
  const commitDetailsRef = useRef<CommitDetailsViewModel | undefined>(undefined);
  const latestGraphRequestIdRef = useRef<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0
  });

  const client = useMemo(() => rpcClient, [rpcClient]);
  const showCommitDetails = (details: CommitDetailsViewModel | undefined) => {
    commitDetailsRef.current = details;
    setCommitDetails(details);
  };

  useEffect(() => {
    requestHistory(client, pendingHistoryRequestsRef.current);
    requestSettings(client);
  }, [client]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<BackendNotification | RpcResponse>) => {
      const response = event.data;
      if (isBackendNotification(response)) {
        if (response.type === "history.changed") {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            repositoryId: selectedRepositoryIdRef.current
          });
        }

        if (response.type === "history.revealCommit") {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            repositoryId: selectedRepositoryIdRef.current,
            search: response.hash
          });
        }

        return;
      }

      if (!response.ok) {
        return;
      }

      if (response.type === "history.load") {
        const historyRequest = pendingHistoryRequestsRef.current.get(response.id);
        pendingHistoryRequestsRef.current.delete(response.id);
        loadingMoreRef.current = false;

        const nextCommits = historyRequest?.append
          ? [...commitsRef.current, ...response.payload.commits]
          : response.payload.commits;
        const repositoryId = historyRequest?.repositoryId ?? response.payload.repositories[0]?.id;
        const commit = selectCommitAfterHistoryLoad(nextCommits, selectedCommitHashRef.current);
        commitsRef.current = nextCommits;
        hasMoreRef.current = response.payload.hasMore;
        nextCursorRef.current = response.payload.nextCursor;
        selectedRepositoryIdRef.current = repositoryId;
        setCommits(nextCommits);
        if (nextCommits.length === 0) {
          setGraph(emptyGraph);
        }
        setSelectedRepositoryId(repositoryId);

        if (!historyRequest?.append) {
          setSelectedCommitHash(commit?.hash);
          selectedCommitHashRef.current = commit?.hash;
          if (!commit) {
            showCommitDetails(undefined);
          } else if (commitDetailsRef.current?.hash !== commit.hash) {
            showCommitDetails(createPendingCommitDetails(commit));
          }
        }

        if (repositoryId && commit && !historyRequest?.append) {
          requestCommitDetails(client, repositoryId, commit.hash);
        }

        if (repositoryId && nextCommits.length > 0) {
          latestGraphRequestIdRef.current = requestGraphLayout(
            client,
            repositoryId,
            nextCommits.map((historyCommit) => historyCommit.hash)
          );
        }
      }

      if (response.type === "commits.getDetails" && response.payload.commit.hash === selectedCommitHashRef.current) {
        showCommitDetails(response.payload.commit);
      }

      if (response.type === "graph.getLayout") {
        if (response.id === latestGraphRequestIdRef.current) {
          setGraph(response.payload.graph);
        }
      }

      if (response.type === "settings.get" || response.type === "settings.update") {
        setFileViewMode(response.payload.settings.fileViewMode);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, [client]);

  const selectCommit = (commit: CommitListItemViewModel) => {
    setSelectedCommitHash(commit.hash);
    selectedCommitHashRef.current = commit.hash;
    showCommitDetails(createPendingCommitDetails(commit));

    if (selectedRepositoryId) {
      requestCommitDetails(client, selectedRepositoryId, commit.hash);
    }
  };

  const loadMoreCommits = () => {
    if (!selectedRepositoryIdRef.current || !hasMoreRef.current || !nextCursorRef.current || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    requestHistory(client, pendingHistoryRequestsRef.current, {
      append: true,
      cursor: nextCursorRef.current,
      repositoryId: selectedRepositoryIdRef.current
    });
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

  const openCommitFileDiff = (filePath: string) => {
    if (!selectedRepositoryIdRef.current || !selectedCommitHashRef.current) {
      return;
    }

    client?.post({
      filePath,
      hash: selectedCommitHashRef.current,
      id: crypto.randomUUID(),
      repositoryId: selectedRepositoryIdRef.current,
      type: "diff.openCommitFile"
    });
  };

  const openCompareFileDiff = (filePath: string) => {
    const fromHash = commits[0]?.hash;
    const toHash = commits[1]?.hash;
    if (!selectedRepositoryIdRef.current || !fromHash || !toHash) {
      return;
    }

    client?.post({
      filePath,
      fromHash,
      id: crypto.randomUUID(),
      repositoryId: selectedRepositoryIdRef.current,
      toHash,
      type: "diff.openCompareFile"
    });
  };

  const updateFileViewMode = (mode: FileViewMode) => {
    setFileViewMode(mode);
    client?.post({
      id: crypto.randomUUID(),
      settings: {
        fileViewMode: mode
      },
      type: "settings.update"
    });
  };

  return (
    <main className="flex h-screen overflow-hidden flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
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
            onLoadMore={loadMoreCommits}
            selectedHash={selectedCommitHash}
          />
        }
        right={
          <CommitDetails
            commit={commitDetails}
            fileViewMode={fileViewMode}
            onFileViewModeChange={updateFileViewMode}
            onOpenFileDiff={openCommitFileDiff}
          />
        }
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
        onOpenFileDiff={openCompareFileDiff}
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

function requestSettings(client: RpcClient | undefined): void {
  client?.post({
    id: crypto.randomUUID(),
    type: "settings.get"
  });
}

function requestHistory(
  client: RpcClient | undefined,
  pendingRequests: Map<string, HistoryRequestMeta>,
  options: {
    append?: boolean;
    cursor?: string;
    repositoryId?: string;
    search?: string;
  } = {}
): void {
  const id = crypto.randomUUID();
  pendingRequests.set(id, {
    append: options.append ?? false,
    repositoryId: options.repositoryId
  });
  client?.post({
    cursor: options.cursor,
    id,
    pageSize,
    repositoryId: options.repositoryId,
    search: options.search,
    type: "history.load"
  });
}

function requestGraphLayout(client: RpcClient | undefined, repositoryId: string, hashes: readonly string[]): string {
  const id = crypto.randomUUID();
  client?.post({
    hashes,
    id,
    repositoryId,
    type: "graph.getLayout"
  });
  return id;
}

function isBackendNotification(message: BackendNotification | RpcResponse): message is BackendNotification {
  return !("ok" in message);
}

function selectCommitAfterHistoryLoad(
  commits: readonly CommitListItemViewModel[],
  selectedHash: string | undefined
): CommitListItemViewModel | undefined {
  return commits.find((commit) => commit.hash === selectedHash) ?? commits[0];
}

function createPendingCommitDetails(commit: CommitListItemViewModel): CommitDetailsViewModel {
  return {
    author: commit.author,
    body: "",
    canEditMessage: commit.canEditMessage,
    date: commit.date,
    email: "",
    files: [],
    hash: commit.hash,
    message: commit.message,
    refs: commit.refs
  };
}
