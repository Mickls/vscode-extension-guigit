import type { MouseEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackendNotification,
  CommitDetailsViewModel,
  CommitListItemViewModel,
  FileChangeViewModel,
  FileViewMode,
  GitResetMode,
  GraphLayoutViewModel,
  RpcRequest,
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
type PrimaryGitOperationType = "git.advancedPull" | "git.advancedPush" | "git.fetch" | "git.pull" | "git.push";
type ConflictGitOperationType = "git.abortOperation" | "git.continueOperation" | "git.operationState";
type ContextGitOperationType =
  | "git.cherryPick"
  | "git.compareCommits"
  | "git.copyHash"
  | "git.createBranchFromCommit"
  | "git.editCommitMessage"
  | "git.pushAllCommitsToHere"
  | "git.reset"
  | "git.revert"
  | "git.squashCommits";
type DistributiveOmit<T, TKey extends PropertyKey> = T extends unknown ? Omit<T, TKey> : never;
type ContextGitOperationRequest = DistributiveOmit<Extract<RpcRequest, { type: ContextGitOperationType }>, "id">;

const gitOperationLabels = {
  "git.advancedPull": "Advanced Pull",
  "git.advancedPush": "Advanced Push",
  "git.fetch": "Fetch",
  "git.pull": "Pull",
  "git.push": "Push"
} as const satisfies Record<PrimaryGitOperationType, string>;

const contextGitOperationLabels = {
  "git.cherryPick": "Cherry Pick",
  "git.compareCommits": "Compare Commits",
  "git.copyHash": "Copy Hash",
  "git.createBranchFromCommit": "Create Branch",
  "git.editCommitMessage": "Edit Commit Message",
  "git.pushAllCommitsToHere": "Push Commits",
  "git.reset": "Reset",
  "git.revert": "Revert",
  "git.squashCommits": "Squash Commits"
} as const satisfies Record<ContextGitOperationType, string>;

export interface AppProps {
  rpcClient?: RpcClient;
}

interface HistoryRequestMeta {
  append: boolean;
  preserveSelection: boolean;
  probeHash?: string;
  revealHash?: string;
  repositoryId?: string;
}

interface OperationNotification {
  message: string;
  state: "error" | "running" | "success" | "warning";
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
  const [operationNotification, setOperationNotification] = useState<OperationNotification | undefined>();
  const [activeGitOperation, setActiveGitOperation] = useState<ConflictGitOperationType | ContextGitOperationType | PrimaryGitOperationType | undefined>();
  const [conflictOperation, setConflictOperation] = useState<OperationNotification | undefined>();
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
    hash: undefined as string | undefined,
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
    if (!operationNotification || operationNotification.state === "running") {
      return;
    }

    const timeout = window.setTimeout(() => setOperationNotification(undefined), 3500);
    return () => window.clearTimeout(timeout);
  }, [operationNotification]);

  useEffect(() => {
    if (!conflictOperation) {
      return;
    }

    const interval = window.setInterval(() => {
      sendConflictOperation("git.operationState");
    }, 2500);
    return () => window.clearInterval(interval);
  }, [conflictOperation]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<BackendNotification | RpcResponse>) => {
      const response = event.data;
      if (isBackendNotification(response)) {
        if (response.type === "history.changed") {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            preserveSelection: response.reason === "watcher",
            repositoryId: selectedRepositoryIdRef.current
          });
        }

        if (response.type === "history.revealCommit") {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            repositoryId: selectedRepositoryIdRef.current,
            revealHash: response.hash
          });
        }

        return;
      }

      if (!response.ok) {
        if (isGitOperationType(response.type)) {
          setActiveGitOperation(undefined);
        }
        setOperationNotification({ message: response.error.message, state: "error" });
        return;
      }

      if (response.type === "history.load") {
        const historyRequest = pendingHistoryRequestsRef.current.get(response.id);
        pendingHistoryRequestsRef.current.delete(response.id);
        loadingMoreRef.current = false;

        if (historyRequest?.probeHash) {
          return;
        }

        const nextCommits = historyRequest?.append
          ? [...commitsRef.current, ...response.payload.commits]
          : response.payload.commits;
        const repositoryId = historyRequest?.repositoryId ?? response.payload.repositories[0]?.id;
        const selectedHash = selectedCommitHashRef.current;
        const targetHash = historyRequest?.revealHash ?? selectedHash;
        const commit = selectCommitAfterHistoryLoad(
          nextCommits,
          targetHash,
          (historyRequest?.preserveSelection ?? false) || Boolean(historyRequest?.revealHash)
        );
        const shouldProbeSelectedHash = !historyRequest?.append && selectedHash && historyRequest?.preserveSelection && !commit;
        if (shouldProbeSelectedHash) {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            probeHash: selectedHash,
            repositoryId,
            search: selectedHash
          });
        }

        commitsRef.current = nextCommits;
        hasMoreRef.current = response.payload.hasMore;
        nextCursorRef.current = response.payload.nextCursor;
        selectedRepositoryIdRef.current = repositoryId;
        setCommits(nextCommits);
        if (nextCommits.length === 0) {
          setGraph(emptyGraph);
        }
        setSelectedRepositoryId(repositoryId);

        if (historyRequest?.revealHash && !commit && response.payload.hasMore && response.payload.nextCursor) {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            append: true,
            cursor: response.payload.nextCursor,
            repositoryId,
            revealHash: historyRequest.revealHash
          });
        }

        if ((historyRequest?.revealHash && commit) || (!historyRequest?.append && !shouldProbeSelectedHash)) {
          setSelectedCommitHash(commit?.hash);
          selectedCommitHashRef.current = commit?.hash;
          if (!commit) {
            showCommitDetails(undefined);
          } else if (commitDetailsRef.current?.hash !== commit.hash) {
            showCommitDetails(createPendingCommitDetails(commit));
          }
        }

        if (repositoryId && commit && (!historyRequest?.append || historyRequest.revealHash)) {
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

      if (isPrimaryGitOperationResponse(response)) {
        setActiveGitOperation(undefined);
        if (response.payload.status === "conflict") {
          setConflictOperation({ message: response.payload.message, state: "warning" });
          setOperationNotification({ message: response.payload.message, state: "warning" });
          return;
        }

        setConflictOperation(undefined);
        setOperationNotification({
          message: response.payload.message,
          state: response.payload.status === "ok" ? "success" : "warning"
        });
        if (response.payload.status === "ok") {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            preserveSelection: true,
            repositoryId: selectedRepositoryIdRef.current
          });
        }
      }

      if (isConflictGitOperationResponse(response)) {
        setActiveGitOperation(undefined);
        if (response.payload.status === "conflict") {
          setConflictOperation({ message: response.payload.message, state: "warning" });
          setOperationNotification({ message: response.payload.message, state: "warning" });
          return;
        }

        setConflictOperation(undefined);
        setOperationNotification({
          message: response.payload.message,
          state: response.payload.status === "ok" ? "success" : "warning"
        });
        requestHistory(client, pendingHistoryRequestsRef.current, {
          preserveSelection: true,
          repositoryId: selectedRepositoryIdRef.current
        });
      }

      if (isContextGitOperationResponse(response)) {
        setActiveGitOperation(undefined);
        setOperationNotification({
          message: response.payload.message,
          state: response.payload.status === "ok" ? "success" : "warning"
        });
        if (response.payload.status === "ok" && response.type !== "git.copyHash" && response.type !== "git.compareCommits") {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            preserveSelection: true,
            repositoryId: selectedRepositoryIdRef.current
          });
        }
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
    setContextMenu({
      hash: commit.hash,
      visible: true,
      x: event.clientX,
      y: event.clientY
    });
  };

  const handleContextMenuAction = (action: ContextMenuAction) => {
    const contextHash = contextMenu.hash;
    const selectedPair = getSelectedPair(selectedCommitHashRef.current, contextHash);
    setContextMenu((current) => ({ ...current, visible: false }));

    if (!selectedRepositoryIdRef.current || !contextHash || activeGitOperation || conflictOperation) {
      return;
    }

    if (action === "compare") {
      startContextOperation({
        hashes: selectedPair,
        repositoryId: selectedRepositoryIdRef.current,
        type: "git.compareCommits"
      });
      setCompareOverlayOpen(true);
      return;
    }

    const request = contextActionRequest(action, selectedRepositoryIdRef.current, contextHash, selectedPair);
    if (request) {
      startContextOperation(request);
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

  const openWorkingFile = (filePath: string) => {
    if (!selectedRepositoryIdRef.current) {
      return;
    }

    client?.post({
      filePath,
      id: crypto.randomUUID(),
      repositoryId: selectedRepositoryIdRef.current,
      type: "files.openWorkingFile"
    });
  };

  const openFileHistory = (filePath: string) => {
    if (!selectedRepositoryIdRef.current) {
      return;
    }

    client?.post({
      filePath,
      id: crypto.randomUUID(),
      repositoryId: selectedRepositoryIdRef.current,
      type: "files.openHistory"
    });
  };

  const openCompareFileDiff = (filePath: string) => {
    const [fromHash, toHash] = getSelectedPair(selectedCommitHashRef.current, contextMenu.hash);
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

  const startGitOperation = (type: PrimaryGitOperationType) => {
    if (!selectedRepositoryIdRef.current || activeGitOperation || conflictOperation) {
      return;
    }

    const label = gitOperationLabels[type];
    setActiveGitOperation(type);
    setOperationNotification({ message: `${label} is running...`, state: "running" });
    client?.post({
      id: crypto.randomUUID(),
      repositoryId: selectedRepositoryIdRef.current,
      type
    });
  };

  const sendConflictOperation = (type: ConflictGitOperationType) => {
    if (!selectedRepositoryIdRef.current || activeGitOperation) {
      return;
    }

    if (type !== "git.operationState") {
      setActiveGitOperation(type);
    }
    client?.post({
      id: crypto.randomUUID(),
      repositoryId: selectedRepositoryIdRef.current,
      type
    });
  };

  const startContextOperation = (request: ContextGitOperationRequest) => {
    if (activeGitOperation || conflictOperation) {
      return;
    }

    const label = contextGitOperationLabels[request.type];
    setActiveGitOperation(request.type);
    setOperationNotification({ message: `${label} is running...`, state: "running" });
    client?.post({
      ...request,
      id: crypto.randomUUID()
    });
  };

  return (
    <main className="flex h-screen overflow-hidden flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      <Header
        gitOperationBusy={Boolean(activeGitOperation || conflictOperation)}
        graphVisible={graphVisible}
        onAdvancedPull={() => startGitOperation("git.advancedPull")}
        onAdvancedPush={() => startGitOperation("git.advancedPush")}
        onGraphToggle={() => setGraphVisible((visible) => !visible)}
        onFetch={() => startGitOperation("git.fetch")}
        onPull={() => startGitOperation("git.pull")}
        onPush={() => startGitOperation("git.push")}
        onRefresh={() => {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            preserveSelection: true,
            repositoryId: selectedRepositoryIdRef.current
          });
        }}
        onSettingsClick={() => {
          setContextMenu((current) => ({ ...current, visible: false }));
          setSettingsMenuOpen((open) => !open);
        }}
        settingsOpen={settingsMenuOpen}
      />
      {conflictOperation ? (
        <ConflictBanner
          message={conflictOperation.message}
          onAbort={() => sendConflictOperation("git.abortOperation")}
          onContinue={() => sendConflictOperation("git.continueOperation")}
        />
      ) : null}
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
            onOpenFile={openWorkingFile}
            onOpenFileDiff={openCommitFileDiff}
            onOpenFileHistory={openFileHistory}
          />
        }
      />
      <ContextMenu
        canEditCommitMessage={commits.find((commit) => commit.hash === contextMenu.hash)?.canEditMessage ?? false}
        onAction={handleContextMenuAction}
        selectedCommitCount={getSelectedPair(selectedCommitHash, contextMenu.hash).length}
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
        fromHash={getSelectedPair(selectedCommitHash, contextMenu.hash)[0] ?? ""}
        onClose={() => setCompareOverlayOpen(false)}
        onOpenFileDiff={openCompareFileDiff}
        open={compareOverlayOpen}
        toHash={getSelectedPair(selectedCommitHash, contextMenu.hash)[1] ?? ""}
      />
      {operationNotification ? (
        <OperationToast message={operationNotification.message} state={operationNotification.state} />
      ) : null}
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
    preserveSelection?: boolean;
    probeHash?: string;
    revealHash?: string;
    repositoryId?: string;
    search?: string;
  } = {}
): void {
  const id = crypto.randomUUID();
  pendingRequests.set(id, {
    append: options.append ?? false,
    preserveSelection: options.preserveSelection ?? false,
    probeHash: options.probeHash,
    revealHash: options.revealHash,
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

function isPrimaryGitOperationResponse(
  response: RpcResponse
): response is Extract<RpcResponse, { type: PrimaryGitOperationType }> {
  return isPrimaryGitOperationType(response.type);
}

function isConflictGitOperationResponse(
  response: RpcResponse
): response is Extract<RpcResponse, { type: ConflictGitOperationType }> {
  return (
    response.type === "git.abortOperation" ||
    response.type === "git.continueOperation" ||
    response.type === "git.operationState"
  );
}

function isContextGitOperationResponse(
  response: RpcResponse
): response is Extract<RpcResponse, { type: ContextGitOperationType }> {
  return isContextGitOperationType(response.type);
}

function isGitOperationType(type: string): type is ConflictGitOperationType | ContextGitOperationType | PrimaryGitOperationType {
  return (
    isPrimaryGitOperationType(type) ||
    isContextGitOperationType(type) ||
    type === "git.abortOperation" ||
    type === "git.continueOperation" ||
    type === "git.operationState"
  );
}

function isContextGitOperationType(type: string): type is ContextGitOperationType {
  return (
    type === "git.cherryPick" ||
    type === "git.compareCommits" ||
    type === "git.copyHash" ||
    type === "git.createBranchFromCommit" ||
    type === "git.editCommitMessage" ||
    type === "git.pushAllCommitsToHere" ||
    type === "git.reset" ||
    type === "git.revert" ||
    type === "git.squashCommits"
  );
}

function isPrimaryGitOperationType(type: string): type is PrimaryGitOperationType {
  return (
    type === "git.advancedPull" ||
    type === "git.advancedPush" ||
    type === "git.fetch" ||
    type === "git.pull" ||
    type === "git.push"
  );
}

function getSelectedPair(selectedHash: string | undefined, contextHash: string | undefined): readonly string[] {
  if (!selectedHash || !contextHash) {
    return [];
  }

  if (selectedHash === contextHash) {
    return [contextHash];
  }

  return [selectedHash, contextHash];
}

function contextActionRequest(
  action: ContextMenuAction,
  repositoryId: string,
  hash: string,
  selectedPair: readonly string[]
): ContextGitOperationRequest | undefined {
  if (action === "copyHash") {
    return { hash, repositoryId, type: "git.copyHash" };
  }

  if (action === "cherryPick") {
    return { hash, repositoryId, type: "git.cherryPick" };
  }

  if (action === "revert") {
    return { hash, repositoryId, type: "git.revert" };
  }

  if (action === "squash") {
    return { hashes: selectedPair, repositoryId, type: "git.squashCommits" };
  }

  if (action === "createBranch") {
    return { hash, repositoryId, type: "git.createBranchFromCommit" };
  }

  if (action === "pushToCommit") {
    return { hash, repositoryId, type: "git.pushAllCommitsToHere" };
  }

  if (action === "editCommitMessage") {
    return { hash, repositoryId, type: "git.editCommitMessage" };
  }

  const resetMode = resetModeFromContextAction(action);
  if (resetMode) {
    return { hash, mode: resetMode, repositoryId, type: "git.reset" };
  }

  return undefined;
}

function resetModeFromContextAction(action: ContextMenuAction): GitResetMode | undefined {
  if (action === "resetSoft") {
    return "soft";
  }

  if (action === "resetMixed") {
    return "mixed";
  }

  if (action === "resetHard") {
    return "hard";
  }

  return undefined;
}

function OperationToast({ message, state }: { message: string; state: OperationNotification["state"] }): ReactElement {
  const stateClass = {
    error: "border-l-4 border-l-[var(--vscode-errorForeground)]",
    running: "border-l-4 border-l-[var(--vscode-progressBar-background)]",
    success: "border-l-4 border-l-[var(--vscode-testing-iconPassed)]",
    warning: "border-l-4 border-l-[var(--vscode-editorWarning-foreground)]"
  }[state];

  return (
    <div
      className={`fixed bottom-4 right-4 flex max-w-[360px] items-center gap-2 rounded-[4px] border border-[var(--vscode-notifications-border)] bg-[var(--vscode-notifications-background)] px-3 py-2 text-xs text-[var(--vscode-notifications-foreground)] shadow-lg ${stateClass}`}
      role="status"
    >
      {state === "running" ? (
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-[var(--vscode-progressBar-background)] border-t-transparent" />
      ) : null}
      {message}
    </div>
  );
}

function ConflictBanner({
  message,
  onAbort,
  onContinue
}: {
  message: string;
  onAbort: () => void;
  onContinue: () => void;
}): ReactElement {
  return (
    <section
      aria-label="Git Conflict"
      className="flex shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-notifications-background)] px-3 py-2 text-xs text-[var(--vscode-notifications-foreground)]"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        className="h-7 whitespace-nowrap rounded-[3px] border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] px-2 text-xs text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
        onClick={onContinue}
        type="button"
      >
        Resolved and Staged
      </button>
      <button
        className="h-7 whitespace-nowrap rounded-[3px] border border-[var(--vscode-button-secondaryBorder,transparent)] bg-[var(--vscode-button-secondaryBackground)] px-2 text-xs text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
        onClick={onAbort}
        type="button"
      >
        Abort
      </button>
    </section>
  );
}

function selectCommitAfterHistoryLoad(
  commits: readonly CommitListItemViewModel[],
  selectedHash: string | undefined,
  preserveSelection: boolean
): CommitListItemViewModel | undefined {
  const selectedCommit = selectedHash
    ? commits.find((commit) => commit.hash.toLowerCase().startsWith(selectedHash.toLowerCase()))
    : undefined;
  if (preserveSelection && selectedHash) {
    return selectedCommit;
  }

  return selectedCommit ?? commits[0];
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
