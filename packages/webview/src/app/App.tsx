import type { MouseEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackendNotification,
  BranchesViewModel,
  CommitDetailsViewModel,
  CommitListItemViewModel,
  CurrentUserViewModel,
  FileChangeViewModel,
  FileViewMode,
  GitResetMode,
  GraphLayoutViewModel,
  I18nMessages,
  OperationResultViewModel,
  RepositoryViewModel,
  RpcRequest,
  RemoteViewModel,
  RpcResponse
} from "./rpcContract.generated";
import type { RpcClient } from "./rpcClient";
import { createTranslator } from "./i18n";
import { CompareOverlay } from "../components/CompareOverlay/CompareOverlay";
import { CommitDetails } from "../components/CommitDetails/CommitDetails";
import { CommitList, type CommitSelectionIntent } from "../components/CommitList/CommitList";
import { ContextMenu, type ContextMenuAction } from "../components/ContextMenu/ContextMenu";
import { Header } from "../components/Header/Header";
import { SplitPanels } from "../components/Layout/SplitPanels";
import { NotificationCenter, type NotificationHistoryItem, type NotificationState } from "../components/NotificationCenter/NotificationCenter";
import { RemoteManager } from "../components/RemoteManager/RemoteManager";
import { SettingsMenu, type SettingsMenuAction } from "../components/SettingsMenu/SettingsMenu";

const emptyGraph: GraphLayoutViewModel = {
  edges: [],
  nodes: [],
  width: 120
};

const emptyBranches: BranchesViewModel = {
  locals: [],
  remotes: []
};

const emptyRemotes: readonly RemoteViewModel[] = [];
const emptyRepositories: readonly RepositoryViewModel[] = [];
const emptyCompareFiles: readonly FileChangeViewModel[] = [];
const pageSize = 50;
const minimumGraphViewportWidth = 120;
const maximumGraphViewportWidth = 240;
const defaultFileViewMode: FileViewMode = "list";
const emptyI18nMessages: I18nMessages = {};
const notificationHistoryStorageKey = "guigit.notificationHistory";
const notificationCountVisibilityStorageKey = "guigit.notificationCountVisible";
const notificationRetentionMs = 7 * 24 * 60 * 60 * 1000;
type PrimaryGitOperationType = "git.advancedPull" | "git.advancedPush" | "git.fetch" | "git.pull" | "git.push";
type PromptGitOperationType = "git.checkout" | "git.clone";
type ConflictGitOperationType = "git.abortOperation" | "git.continueOperation" | "git.operationState";
type RemoteOperationType = "remotes.add" | "remotes.delete" | "remotes.update";
type SettingsOperationType = "settings.changeLanguage" | "settings.resetAutoStash";
type ProxyOperationType = "proxy.configure" | "proxy.refresh";
type FileOperationType = "diff.openCommitFile" | "diff.openCompareFile" | "files.openHistory" | "files.openWorkingFile";
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

const settingsMenuRequests = {
  changeLanguage: "settings.changeLanguage",
  configureProxy: "proxy.configure",
  refreshProxy: "proxy.refresh",
  resetStash: "settings.resetAutoStash"
} as const satisfies Partial<Record<SettingsMenuAction, SettingsOperationType | ProxyOperationType>>;

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
  state: NotificationState;
}

export function App({ rpcClient }: AppProps): ReactElement {
  const [settingsMenu, setSettingsMenu] = useState({
    visible: false,
    x: 0,
    y: 44
  });
  const [remoteManagerOpen, setRemoteManagerOpen] = useState(false);
  const [compareOverlayOpen, setCompareOverlayOpen] = useState(false);
  const [commits, setCommits] = useState<readonly CommitListItemViewModel[]>([]);
  const [branches, setBranches] = useState<BranchesViewModel>(emptyBranches);
  const [graph, setGraph] = useState<GraphLayoutViewModel>(emptyGraph);
  const [graphVisible, setGraphVisible] = useState(true);
  const [repositories, setRepositories] = useState<readonly RepositoryViewModel[]>(emptyRepositories);
  const [currentUser, setCurrentUser] = useState<CurrentUserViewModel | undefined>();
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | undefined>();
  const [selectedBranches, setSelectedBranches] = useState<readonly string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | undefined>();
  const [selectedCommitHashes, setSelectedCommitHashes] = useState<readonly string[]>([]);
  const [commitDetails, setCommitDetails] = useState<CommitDetailsViewModel | undefined>();
  const [fileViewMode, setFileViewMode] = useState<FileViewMode>(defaultFileViewMode);
  const [i18nMessages, setI18nMessages] = useState<I18nMessages>(emptyI18nMessages);
  const [compareFiles, setCompareFiles] = useState<readonly FileChangeViewModel[]>(emptyCompareFiles);
  const [compareHashes, setCompareHashes] = useState<readonly [string, string] | undefined>();
  const [remotes, setRemotes] = useState<readonly RemoteViewModel[]>(emptyRemotes);
  const [remoteStatus, setRemoteStatus] = useState<OperationNotification | undefined>();
  const [operationNotification, setOperationNotification] = useState<OperationNotification | undefined>();
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<readonly NotificationHistoryItem[]>(() =>
    loadNotificationHistory(Date.now())
  );
  const [showNotificationCount, setShowNotificationCount] = useState(() => loadNotificationCountVisibility());
  const [activeGitOperation, setActiveGitOperation] = useState<ConflictGitOperationType | ContextGitOperationType | PrimaryGitOperationType | PromptGitOperationType | undefined>();
  const [conflictOperation, setConflictOperation] = useState<OperationNotification | undefined>();
  const commitsRef = useRef<readonly CommitListItemViewModel[]>([]);
  const hasMoreRef = useRef(false);
  const nextCursorRef = useRef<string | undefined>(undefined);
  const pendingHistoryRequestsRef = useRef(new Map<string, HistoryRequestMeta>());
  const selectedRepositoryIdRef = useRef<string | undefined>(undefined);
  const selectedBranchesRef = useRef<readonly string[]>([]);
  const searchQueryRef = useRef("");
  const authorQueryRef = useRef("");
  const loadingMoreRef = useRef(false);
  const selectedCommitHashRef = useRef<string | undefined>(undefined);
  const selectedCommitHashesRef = useRef<readonly string[]>([]);
  const commitDetailsRef = useRef<CommitDetailsViewModel | undefined>(undefined);
  const latestGraphRequestIdRef = useRef<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState({
    hash: undefined as string | undefined,
    visible: false,
    x: 0,
    y: 0
  });

  const client = useMemo(() => rpcClient, [rpcClient]);
  const t = useMemo(() => createTranslator(i18nMessages), [i18nMessages]);
  const tx = (key: string, fallback: string, ...args: readonly unknown[]): string => {
    const value = t(key, ...args);
    return value === key ? formatMessage(fallback, args) : value;
  };
  const primaryGitOperationLabels = {
    "git.advancedPull": tx("gitOperations.advancedPull", "Advanced Pull"),
    "git.advancedPush": tx("gitOperations.advancedPush", "Advanced Push"),
    "git.fetch": tx("gitOperations.fetch", "Fetch"),
    "git.pull": tx("gitOperations.pull", "Pull"),
    "git.push": tx("gitOperations.push", "Push")
  } as const satisfies Record<PrimaryGitOperationType, string>;
  const promptGitOperationLabels = {
    "git.checkout": tx("gitOperations.checkout", "Checkout"),
    "git.clone": tx("gitOperations.clone", "Clone")
  } as const satisfies Record<PromptGitOperationType, string>;
  const contextGitOperationLabels = {
    "git.cherryPick": tx("contextMenu.cherryPick", "Cherry Pick"),
    "git.compareCommits": tx("contextMenu.compareSelected", "Compare Commits"),
    "git.copyHash": tx("contextMenu.copyHash", "Copy Hash"),
    "git.createBranchFromCommit": tx("contextMenu.createBranch", "Create Branch"),
    "git.editCommitMessage": tx("contextMenu.editCommitMessage", "Edit Commit Message"),
    "git.pushAllCommitsToHere": tx("contextMenu.pushToCommit", "Push Commits"),
    "git.reset": tx("contextMenu.reset", "Reset"),
    "git.revert": tx("contextMenu.revert", "Revert"),
    "git.squashCommits": tx("contextMenu.squashCommits", "Squash Commits")
  } as const satisfies Record<ContextGitOperationType, string>;
  const primaryGitOperationLabelsRef = useRef(primaryGitOperationLabels);
  const promptGitOperationLabelsRef = useRef(promptGitOperationLabels);
  const contextGitOperationLabelsRef = useRef(contextGitOperationLabels);
  const graphHeaderWidth = Math.min(Math.max(graph.width, minimumGraphViewportWidth), maximumGraphViewportWidth);
  const showCommitDetails = (details: CommitDetailsViewModel | undefined) => {
    commitDetailsRef.current = details;
    setCommitDetails(details);
  };
  const updateSelectedCommitHashes = (hashes: readonly string[]) => {
    selectedCommitHashesRef.current = hashes;
    setSelectedCommitHashes(hashes);
  };
  const updateSelectedBranches = (branchNames: readonly string[]) => {
    selectedBranchesRef.current = branchNames;
    setSelectedBranches(branchNames);
  };
  const updateSelectedRepository = (repositoryId: string | undefined) => {
    selectedRepositoryIdRef.current = repositoryId;
    setSelectedRepositoryId(repositoryId);
  };
  const notify = (notification: OperationNotification) => {
    const now = Date.now();
    const entry: NotificationHistoryItem = {
      ...notification,
      createdAt: new Date(now).toISOString(),
      id: crypto.randomUUID(),
      read: false
    };
    setOperationNotification(notification);
    setNotificationHistory((current) => pruneNotificationHistory([entry, ...current], now));
  };
  const copyNotification = (notification: NotificationHistoryItem) => {
    void navigator.clipboard.writeText(formatNotificationHistory([notification]));
  };
  const operationResultNotification = (
    label: string,
    result: OperationResultViewModel
  ): OperationNotification => ({
    message: result.status === "ok"
      ? tx("status.completed", "{0} completed", label)
      : result.status === "cancelled"
        ? tx("status.cancelled", "{0} cancelled", label)
        : result.message,
    state: result.status === "ok" ? "success" : "warning"
  });
  const operationResultNotificationRef = useRef(operationResultNotification);
  primaryGitOperationLabelsRef.current = primaryGitOperationLabels;
  promptGitOperationLabelsRef.current = promptGitOperationLabels;
  contextGitOperationLabelsRef.current = contextGitOperationLabels;
  operationResultNotificationRef.current = operationResultNotification;
  const clearNotifications = () => setNotificationHistory([]);
  const markNotificationsRead = () => {
    setNotificationHistory((current) => current.map((notification) => ({ ...notification, read: true })));
  };
  const unreadNotificationCount = notificationHistory.filter((notification) => !notification.read).length;
  const reloadHistory = (options: { preserveSelection?: boolean; repositoryId?: string } = {}) => {
    requestHistory(client, pendingHistoryRequestsRef.current, {
      author: trimFilter(authorQueryRef.current),
      branches: selectedBranchesRef.current.length > 0 ? selectedBranchesRef.current : undefined,
      preserveSelection: options.preserveSelection ?? false,
      repositoryId: options.repositoryId ?? selectedRepositoryIdRef.current,
      search: trimFilter(searchQueryRef.current)
    });
  };

  useEffect(() => {
    reloadHistory();
    requestSettings(client);
  }, [client, i18nMessages]);

  useEffect(() => {
    if (!operationNotification || operationNotification.state === "running") {
      return;
    }

    const timeout = window.setTimeout(() => setOperationNotification(undefined), 3500);
    return () => window.clearTimeout(timeout);
  }, [operationNotification]);

  useEffect(() => {
    window.localStorage.setItem(notificationHistoryStorageKey, JSON.stringify(notificationHistory));
  }, [notificationHistory]);

  useEffect(() => {
    window.localStorage.setItem(notificationCountVisibilityStorageKey, showNotificationCount ? "true" : "false");
  }, [showNotificationCount]);

  useEffect(() => {
    if (!contextMenu.visible) {
      return;
    }

    const closeContextMenu = () => {
      setContextMenu((current) => ({ ...current, visible: false }));
    };
    window.addEventListener("pointerdown", closeContextMenu);
    return () => window.removeEventListener("pointerdown", closeContextMenu);
  }, [contextMenu.visible]);

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
          reloadHistory({ preserveSelection: response.reason === "watcher" });
        }

        if (response.type === "history.revealCommit") {
          requestHistory(client, pendingHistoryRequestsRef.current, {
            author: trimFilter(authorQueryRef.current),
            branches: selectedBranchesRef.current.length > 0 ? selectedBranchesRef.current : undefined,
            repositoryId: selectedRepositoryIdRef.current,
            revealHash: response.hash
          });
        }

        if (response.type === "operation.completed") {
          notify({
            message: response.result.message,
            state: response.result.status === "ok" ? "success" : "warning"
          });
        }

        return;
      }

      if (!response.ok) {
        if (isGitOperationType(response.type)) {
          setActiveGitOperation(undefined);
        }
        if (isRemoteOperationType(response.type) || response.type === "remotes.list") {
          setRemoteStatus({ message: response.error.message, state: "error" });
        }
        notify({ message: response.error.message, state: "error" });
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
        setCommits(nextCommits);
        setBranches(response.payload.branches);
        setRepositories(response.payload.repositories);
        setCurrentUser(response.payload.currentUser);
        if (nextCommits.length === 0) {
          setGraph(emptyGraph);
        }
        updateSelectedRepository(repositoryId);

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
          updateSelectedCommitHashes(commit ? [commit.hash] : []);
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
        setI18nMessages(response.payload.i18n.messages);
      }

      if (response.type === "remotes.list") {
        setRemotes(response.payload.remotes);
        setRemoteStatus(undefined);
      }

      if (isRemoteOperationResponse(response)) {
        setRemoteStatus({
          message: response.payload.message,
          state: response.payload.status === "ok" ? "success" : "warning"
        });
        if (response.payload.status === "ok") {
          requestRemotes(client, selectedRepositoryIdRef.current);
        }
      }

      if (isSettingsMenuOperationResponse(response)) {
        notify({
          message: response.payload.message,
          state: response.payload.status === "ok" ? "success" : "warning"
        });
        if (response.payload.status === "ok" && response.type !== "proxy.refresh") {
          requestSettings(client);
        }
      }

      if (isFileOperationResponse(response)) {
        notify({
          message: response.payload.message,
          state: response.payload.status === "ok" ? "success" : "warning"
        });
      }

      if (isPrimaryGitOperationResponse(response)) {
        setActiveGitOperation(undefined);
        if (response.payload.status === "conflict") {
          setConflictOperation({ message: response.payload.message, state: "warning" });
          notify({ message: response.payload.message, state: "warning" });
          return;
        }

        setConflictOperation(undefined);
        notify(operationResultNotificationRef.current(primaryGitOperationLabelsRef.current[response.type], response.payload));
        if (response.payload.status === "ok") {
          reloadHistory({ preserveSelection: true });
        }
      }

      if (isPromptGitOperationResponse(response)) {
        setActiveGitOperation(undefined);
        notify(operationResultNotificationRef.current(promptGitOperationLabelsRef.current[response.type], response.payload));
        if (response.payload.status === "ok") {
          reloadHistory({ preserveSelection: true });
        }
      }

      if (isConflictGitOperationResponse(response)) {
        setActiveGitOperation(undefined);
        if (response.payload.status === "conflict") {
          setConflictOperation({ message: response.payload.message, state: "warning" });
          notify({ message: response.payload.message, state: "warning" });
          return;
        }

        setConflictOperation(undefined);
        notify({
          message: response.payload.message,
          state: response.payload.status === "ok" ? "success" : "warning"
        });
        reloadHistory({ preserveSelection: true });
      }

      if (isContextGitOperationResponse(response)) {
        setActiveGitOperation(undefined);
        const result = getContextOperationResult(response);
        if (response.type === "git.compareCommits") {
          setCompareFiles(response.payload.files);
        }
        notify(operationResultNotificationRef.current(contextGitOperationLabelsRef.current[response.type], result));
        if (result.status === "ok" && response.type !== "git.copyHash" && response.type !== "git.compareCommits") {
          reloadHistory({ preserveSelection: true });
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, [client]);

  const focusCommit = (commit: CommitListItemViewModel) => {
    setSelectedCommitHash(commit.hash);
    selectedCommitHashRef.current = commit.hash;
    showCommitDetails(createPendingCommitDetails(commit));

    if (selectedRepositoryIdRef.current) {
      requestCommitDetails(client, selectedRepositoryIdRef.current, commit.hash);
    }
  };

  const selectCommit = (commit: CommitListItemViewModel, intent: CommitSelectionIntent = { additive: false }) => {
    if (!intent.additive) {
      updateSelectedCommitHashes([commit.hash]);
      focusCommit(commit);
      return;
    }

    const currentHashes = selectedCommitHashesRef.current;
    const nextHashes = currentHashes.includes(commit.hash)
      ? currentHashes.filter((hash) => hash !== commit.hash)
      : [...currentHashes, commit.hash];
    updateSelectedCommitHashes(nextHashes);

    if (!currentHashes.includes(commit.hash)) {
      focusCommit(commit);
      return;
    }

    if (selectedCommitHashRef.current === commit.hash) {
      const nextFocusedCommit = commitsRef.current.find((candidate) => candidate.hash === nextHashes[0]);
      if (nextFocusedCommit) {
        focusCommit(nextFocusedCommit);
      } else {
        setSelectedCommitHash(undefined);
        selectedCommitHashRef.current = undefined;
        showCommitDetails(undefined);
      }
    }
  };

  const loadMoreCommits = () => {
    if (!selectedRepositoryIdRef.current || !hasMoreRef.current || !nextCursorRef.current || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    requestHistory(client, pendingHistoryRequestsRef.current, {
      append: true,
      author: trimFilter(authorQueryRef.current),
      branches: selectedBranchesRef.current.length > 0 ? selectedBranchesRef.current : undefined,
      cursor: nextCursorRef.current,
      repositoryId: selectedRepositoryIdRef.current,
      search: trimFilter(searchQueryRef.current)
    });
  };

  const changeRepository = (repositoryId: string) => {
    updateSelectedRepository(repositoryId);
    updateSelectedBranches([]);
    setCurrentUser(undefined);
    setCommits([]);
    commitsRef.current = [];
    setGraph(emptyGraph);
    updateSelectedCommitHashes([]);
    setSelectedCommitHash(undefined);
    selectedCommitHashRef.current = undefined;
    showCommitDetails(undefined);
    requestHistory(client, pendingHistoryRequestsRef.current, {
      author: trimFilter(authorQueryRef.current),
      repositoryId,
      search: trimFilter(searchQueryRef.current)
    });
  };

  const changeBranches = (branchNames: readonly string[]) => {
    updateSelectedBranches(branchNames);
    requestHistory(client, pendingHistoryRequestsRef.current, {
      author: trimFilter(authorQueryRef.current),
      branches: branchNames.length > 0 ? branchNames : undefined,
      repositoryId: selectedRepositoryIdRef.current,
      search: trimFilter(searchQueryRef.current)
    });
  };

  const changeSearch = (value: string) => {
    searchQueryRef.current = value;
    setSearchQuery(value);
    reloadHistory();
  };

  const changeAuthor = (value: string) => {
    authorQueryRef.current = value;
    setAuthorQuery(value);
    reloadHistory();
  };

  const selectGraphNode = (hash: string) => {
    const commit = commits.find((candidate) => candidate.hash === hash);
    if (commit) {
      selectCommit(commit);
    }
  };

  const openCommitContextMenu = (event: MouseEvent<HTMLElement>, commit: CommitListItemViewModel) => {
    event.preventDefault();
    setSettingsMenu((current) => ({ ...current, visible: false }));
    if (!selectedCommitHashesRef.current.includes(commit.hash)) {
      updateSelectedCommitHashes([commit.hash]);
      focusCommit(commit);
    }
    setContextMenu({
      hash: commit.hash,
      visible: true,
      x: event.clientX,
      y: event.clientY
    });
  };

  const handleContextMenuAction = (action: ContextMenuAction) => {
    const contextHash = contextMenu.hash;
    const selectedHashesInHistoryOrder = getSelectedHashesInHistoryOrder(commitsRef.current, selectedCommitHashesRef.current);
    const selectedPair = selectedHashesInHistoryOrder.length === 2 ? selectedHashesInHistoryOrder : [];
    setContextMenu((current) => ({ ...current, visible: false }));

    if (!selectedRepositoryIdRef.current || !contextHash || activeGitOperation || conflictOperation) {
      return;
    }

    if (action === "compare") {
      setCompareHashes(selectedPair.length === 2 ? [selectedPair[0]!, selectedPair[1]!] : undefined);
      setCompareFiles(emptyCompareFiles);
      startContextOperation({
        hashes: selectedPair,
        repositoryId: selectedRepositoryIdRef.current,
        type: "git.compareCommits"
      });
      setCompareOverlayOpen(true);
      return;
    }

    const request = contextActionRequest(action, selectedRepositoryIdRef.current, contextHash, selectedHashesInHistoryOrder);
    if (request) {
      startContextOperation(request);
    }
  };

  const handleSettingsMenuAction = (action: SettingsMenuAction) => {
    setSettingsMenu((current) => ({ ...current, visible: false }));

    if (action === "manageRemotes") {
      setRemoteManagerOpen(true);
      requestRemotes(client, selectedRepositoryIdRef.current);
      return;
    }

    const type = settingsMenuRequests[action];
    if (type) {
      client?.post({
        id: crypto.randomUUID(),
        type
      });
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
    if (!selectedRepositoryIdRef.current || !selectedCommitHashRef.current) {
      return;
    }

    client?.post({
      filePath,
      hash: selectedCommitHashRef.current,
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
    const [fromHash, toHash] = compareHashes ?? [];
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

  const addRemote = (name: string, url: string) => {
    postRemoteOperation(client, selectedRepositoryIdRef.current, {
      name,
      type: "remotes.add",
      url
    });
  };

  const updateRemote = (name: string, url: string) => {
    postRemoteOperation(client, selectedRepositoryIdRef.current, {
      name,
      type: "remotes.update",
      url
    });
  };

  const deleteRemote = (name: string) => {
    postRemoteOperation(client, selectedRepositoryIdRef.current, {
      name,
      type: "remotes.delete"
    });
  };

  const startGitOperation = (type: PrimaryGitOperationType) => {
    if (!selectedRepositoryIdRef.current || activeGitOperation || conflictOperation) {
      return;
    }

    const label = primaryGitOperationLabels[type];
    setActiveGitOperation(type);
    notify({ message: tx("status.running", "{0} is running...", label), state: "running" });
    client?.post({
      id: crypto.randomUUID(),
      repositoryId: selectedRepositoryIdRef.current,
      type
    });
  };
  const startPromptGitOperation = (type: PromptGitOperationType) => {
    if ((type === "git.checkout" && !selectedRepositoryIdRef.current) || activeGitOperation || conflictOperation) {
      return;
    }

    const label = promptGitOperationLabels[type];
    setActiveGitOperation(type);
    notify({ message: tx("status.running", "{0} is running...", label), state: "running" });
    if (type === "git.checkout") {
      client?.post({
        id: crypto.randomUUID(),
        repositoryId: selectedRepositoryIdRef.current!,
        type
      });
      return;
    }

    client?.post({
      id: crypto.randomUUID(),
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
    notify({ message: tx("status.running", "{0} is running...", label), state: "running" });
    client?.post({
      ...request,
      id: crypto.randomUUID()
    });
  };

  return (
    <main className="flex h-screen overflow-hidden flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      <Header
        authorValue={authorQuery}
        branches={branches}
        gitOperationBusy={Boolean(activeGitOperation || conflictOperation)}
        graphVisible={graphVisible}
        labels={{
          allBranches: tx("allBranches", "All branches"),
          authorMe: tx("authorFilterMe", "Me"),
          authorPlaceholder: tx("authorFilterPlaceholder", "Author"),
          branch: tx("header.branch", "Branches"),
          checkout: tx("gitOperations.checkout", "Checkout"),
          clone: tx("gitOperations.clone", "Clone"),
          fetch: tx("gitOperations.fetch", "Fetch"),
          filterAuthor: tx("header.filterAuthor", "Filter author"),
          graph: tx("graph.toggle", "Graph"),
          hideGraph: tx("graph.hide", "Hide Git Graph"),
          pull: tx("gitOperations.pull", "Pull"),
          pullTitle: tx("pullTooltip", "Pull (Command/Ctrl+click for Advanced Pull)"),
          push: tx("gitOperations.push", "Push"),
          pushTitle: tx("pushTooltip", "Push (Command/Ctrl+click for Advanced Push)"),
          refresh: tx("refreshTooltip", "Refresh"),
          repository: tx("header.repository", "Repository"),
          searchCommits: tx("header.searchCommits", "Search commits"),
          searchPlaceholder: tx("placeholderCommitMessage", "Search commits"),
          selectedBranches: tx("header.selectedBranches", "{0} branches"),
          settings: tx("gitOperations.settings", "Settings"),
          notifications: tx("notifications.title", "Notifications"),
          showGraph: tx("graph.show", "Show Git Graph")
        }}
        currentUser={currentUser}
        onAdvancedPull={() => startGitOperation("git.advancedPull")}
        onAdvancedPush={() => startGitOperation("git.advancedPush")}
        onAuthorChange={changeAuthor}
        onBranchSelectionChange={changeBranches}
        onCheckout={() => startPromptGitOperation("git.checkout")}
        onClone={() => startPromptGitOperation("git.clone")}
        onGraphToggle={() => setGraphVisible((visible) => !visible)}
        onFetch={() => startGitOperation("git.fetch")}
        onPull={() => startGitOperation("git.pull")}
        onPush={() => startGitOperation("git.push")}
        onNotificationsClick={() => {
          setSettingsMenu((current) => ({ ...current, visible: false }));
          setNotificationCenterOpen((open) => {
            const nextOpen = !open;
            if (nextOpen) {
              markNotificationsRead();
            }
            return nextOpen;
          });
        }}
        onRefresh={() => {
          reloadHistory({ preserveSelection: true });
        }}
        onRepositoryChange={changeRepository}
        onSearchChange={changeSearch}
        onSettingsClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setContextMenu((current) => ({ ...current, visible: false }));
          setNotificationCenterOpen(false);
          setSettingsMenu((current) => ({
            visible: !current.visible,
            x: Math.max(0, rect.right - 220),
            y: rect.bottom + 4
          }));
        }}
        repositories={repositories}
        searchValue={searchQuery}
        selectedBranches={selectedBranches}
        selectedRepositoryId={selectedRepositoryId}
        notificationCount={showNotificationCount ? unreadNotificationCount : 0}
        notificationsOpen={notificationCenterOpen}
        settingsOpen={settingsMenu.visible}
      />
      {conflictOperation ? (
        <ConflictBanner
          labels={{
            abort: tx("conflict.abort", "Abort"),
            continue: tx("conflict.resolvedAndStaged", "Resolved and Staged"),
            label: tx("conflict.label", "Git Conflict")
          }}
          message={conflictOperation.message}
          onAbort={() => sendConflictOperation("git.abortOperation")}
          onContinue={() => sendConflictOperation("git.continueOperation")}
        />
      ) : null}
      <SplitPanels
        graphHeaderVisible={graphVisible}
        graphHeaderWidth={graphHeaderWidth}
        labels={{
          author: tx("headers.author", "Author"),
          collapseCommitDetails: tx("panels.collapseCommitDetails", "Collapse commit details panel"),
          collapseCommitList: tx("panels.collapseCommitList", "Collapse commit list panel"),
          commitDetailsPanel: tx("panels.commitDetails", "Commit details panel"),
          commitListPanel: tx("panels.commitList", "Commit list panel"),
          date: tx("headers.date", "Date"),
          expandCommitDetails: tx("panels.expandCommitDetails", "Expand commit details panel"),
          expandCommitList: tx("panels.expandCommitList", "Expand commit list panel"),
          hash: tx("headers.hash", "Hash"),
          graph: tx("graph.toggle", "Graph"),
          message: tx("headers.message", "Message"),
          refs: tx("headers.refs", "Refs"),
          resizePanels: tx("panels.resize", "Resize panels")
        }}
        left={
          <CommitList
            commits={commits}
            graph={graph}
            graphLabels={{
              label: tx("graph.label", "Git graph"),
              selectCommit: tx("graph.selectCommit", "Select commit {0} in graph")
            }}
            graphVisible={graphVisible}
            onCommitContextMenu={openCommitContextMenu}
            onCommitSelect={selectCommit}
            onGraphNodeSelect={selectGraphNode}
            onLoadMore={loadMoreCommits}
            selectedHash={selectedCommitHash}
            selectedHashes={selectedCommitHashes}
          />
        }
        right={
          <CommitDetails
            commit={commitDetails}
            fileViewMode={fileViewMode}
            labels={{
              files: {
                binary: tx("files.binary", "binary"),
                changed: tx("files.changed", "Files Changed"),
                collapseDirectory: tx("files.collapseDirectory", "Collapse {0}"),
                expandDirectory: tx("files.expandDirectory", "Expand {0}"),
                list: tx("files.list", "List"),
                listView: tx("files.listView", "List view"),
                openDiff: tx("files.openDiff", "Open diff for {0}"),
                openFile: tx("files.openFile", "Open file {0}"),
                openFileHistory: tx("files.openFileHistory", "Open file history for {0}"),
                tree: tx("files.tree", "Tree"),
                treeView: tx("files.treeView", "Tree view")
              },
              selectCommit: tx("selectCommit", "Select a commit to view details.")
            }}
            onFileViewModeChange={updateFileViewMode}
            onOpenFile={openWorkingFile}
            onOpenFileDiff={openCommitFileDiff}
            onOpenFileHistory={openFileHistory}
          />
        }
      />
      <ContextMenu
        canEditCommitMessage={commits.find((commit) => commit.hash === contextMenu.hash)?.canEditMessage ?? false}
        canSquashCommits={canSquashSelectedCommits(selectedCommitHashes)}
        labels={{
          cherryPick: tx("contextMenu.cherryPick", "Cherry Pick"),
          compare: tx("contextMenu.compareSelected", "Compare Selected"),
          compareSelectedCount: tx("contextMenu.compareSelectedCount", "Compare Selected ({0})"),
          compareSelectedProgress: tx("contextMenu.compareSelectedProgress", "Compare Selected ({0}/2)"),
          copyHash: tx("contextMenu.copyHash", "Copy Hash"),
          createBranch: tx("contextMenu.createBranch", "Create Branch"),
          editCommitMessage: tx("contextMenu.editCommitMessage", "Edit Commit Message"),
          menuLabel: tx("contextMenu.menuLabel", "Commit actions"),
          pushToCommit: tx("contextMenu.pushToCommit", "Push All Commits to Here"),
          resetHard: tx("contextMenu.resetHard", "Reset Hard"),
          resetMixed: tx("contextMenu.resetMixed", "Reset Mixed"),
          resetSoft: tx("contextMenu.resetSoft", "Reset Soft"),
          revert: tx("contextMenu.revert", "Revert"),
          squash: tx("contextMenu.squashCommits", "Squash Commits"),
          squashCommitsCount: tx("contextMenu.squashCommitsCount", "Squash {0} Commits")
        }}
        onAction={handleContextMenuAction}
        selectedCommitCount={selectedCommitHashes.length}
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
      />
      <SettingsMenu
        labels={{
          changeLanguage: tx("settingsMenu.changeLanguage", "Change Language"),
          configureProxy: tx("settingsMenu.configureProxy", "Configure Proxy"),
          manageRemotes: tx("settingsMenu.manageRemotes", "Manage Remotes"),
          refreshProxy: tx("settingsMenu.refreshProxy", "Refresh Proxy"),
          resetStash: tx("settingsMenu.resetStash", "Reset Auto Stash Preference")
        }}
        onAction={handleSettingsMenuAction}
        visible={settingsMenu.visible}
        x={settingsMenu.x}
        y={settingsMenu.y}
      />
      <RemoteManager
        labels={{
          actions: tx("remoteManager.actions", "Actions"),
          addButton: tx("remoteManager.addButton", "Add Remote"),
          addNamePlaceholder: tx("remoteManager.addNamePlaceholder", "Remote name"),
          addUrlPlaceholder: tx("remoteManager.addUrlPlaceholder", "Remote URL (https://... or git@...)"),
          buttons: {
            delete: tx("remoteManager.buttons.delete", "Delete"),
            save: tx("remoteManager.buttons.save", "Save")
          },
          close: tx("remoteManager.close", "Close Remote Manager"),
          description: tx("remoteManager.description", "Add, update, or remove Git remotes for the current repository."),
          empty: tx("remoteManager.empty", "No remotes configured"),
          messages: {
            invalidUrl: tx("remoteManager.messages.invalidUrlFormat", "Remote URL must start with git@ or https://")
          },
          name: tx("remoteManager.name", "Name"),
          title: tx("remoteManager.title", "Remote Manager"),
          url: tx("remoteManager.url", "URL")
        }}
        onAddRemote={addRemote}
        onClose={() => setRemoteManagerOpen(false)}
        onDeleteRemote={deleteRemote}
        onUpdateRemote={updateRemote}
        open={remoteManagerOpen}
        remotes={remotes}
        status={remoteStatus ? { kind: remoteStatusKind(remoteStatus.state), message: remoteStatus.message } : undefined}
      />
      <NotificationCenter
        labels={{
          clear: tx("notifications.clear", "Clear notifications"),
          close: tx("notifications.close", "Close notifications"),
          copy: tx("notifications.copy", "Copy notification"),
          empty: tx("notifications.empty", "No notifications in the last 7 days"),
          showUnreadCount: tx("notifications.showUnreadCount", "Show unread count"),
          states: {
            error: tx("notifications.states.error", "Error"),
            running: tx("notifications.states.running", "Running"),
            success: tx("notifications.states.success", "Success"),
            warning: tx("notifications.states.warning", "Warning")
          },
          title: tx("notifications.title", "Notifications")
        }}
        notifications={notificationHistory}
        onClear={clearNotifications}
        onClose={() => setNotificationCenterOpen(false)}
        onCopyNotification={copyNotification}
        onShowUnreadCountChange={setShowNotificationCount}
        open={notificationCenterOpen}
        showUnreadCount={showNotificationCount}
      />
      <CompareOverlay
        files={compareFiles}
        fromHash={compareHashes?.[0] ?? ""}
        labels={{
          baseCommit: tx("compare.baseCommit", "Base commit"),
          changedFiles: tx("compare.changedFiles", "Changed Files"),
          close: tx("compare.close", "Close compare"),
          from: tx("compare.from", "From"),
          noFilesChanged: tx("noFilesChanged", "No files changed"),
          openDiff: tx("compare.openDiff", "Open diff for {0}"),
          targetCommit: tx("compare.targetCommit", "Target commit"),
          title: tx("compare.title", tx("headers.compareCommits", "Compare Commits")),
          to: tx("compare.to", "to")
        }}
        onClose={() => setCompareOverlayOpen(false)}
        onOpenFileDiff={openCompareFileDiff}
        open={compareOverlayOpen}
        toHash={compareHashes?.[1] ?? ""}
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

function requestRemotes(client: RpcClient | undefined, repositoryId: string | undefined): void {
  if (!repositoryId) {
    return;
  }

  client?.post({
    id: crypto.randomUUID(),
    repositoryId,
    type: "remotes.list"
  });
}

function postRemoteOperation(
  client: RpcClient | undefined,
  repositoryId: string | undefined,
  input:
    | { name: string; type: "remotes.delete" }
    | { name: string; type: "remotes.add" | "remotes.update"; url: string }
): void {
  if (!repositoryId) {
    return;
  }

  client?.post({
    ...input,
    id: crypto.randomUUID(),
    repositoryId
  });
}

function requestHistory(
  client: RpcClient | undefined,
  pendingRequests: Map<string, HistoryRequestMeta>,
  options: {
    append?: boolean;
    author?: string;
    branches?: readonly string[];
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
    author: options.author,
    branches: options.branches,
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

function isPromptGitOperationResponse(
  response: RpcResponse
): response is Extract<RpcResponse, { type: PromptGitOperationType }> {
  return isPromptGitOperationType(response.type);
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

function isRemoteOperationResponse(
  response: RpcResponse
): response is Extract<RpcResponse, { type: RemoteOperationType }> {
  return isRemoteOperationType(response.type);
}

function isSettingsMenuOperationResponse(
  response: RpcResponse
): response is Extract<RpcResponse, { type: ProxyOperationType | SettingsOperationType }> {
  return (
    response.type === "proxy.configure" ||
    response.type === "proxy.refresh" ||
    response.type === "settings.changeLanguage" ||
    response.type === "settings.resetAutoStash"
  );
}

function isFileOperationResponse(
  response: RpcResponse
): response is Extract<RpcResponse, { type: FileOperationType }> {
  return (
    response.type === "diff.openCommitFile" ||
    response.type === "diff.openCompareFile" ||
    response.type === "files.openHistory" ||
    response.type === "files.openWorkingFile"
  );
}

function isGitOperationType(type: string): type is ConflictGitOperationType | ContextGitOperationType | PrimaryGitOperationType | PromptGitOperationType {
  return (
    isPrimaryGitOperationType(type) ||
    isPromptGitOperationType(type) ||
    isContextGitOperationType(type) ||
    type === "git.abortOperation" ||
    type === "git.continueOperation" ||
    type === "git.operationState"
  );
}

function isPromptGitOperationType(type: string): type is PromptGitOperationType {
  return type === "git.checkout" || type === "git.clone";
}

function isRemoteOperationType(type: string): type is RemoteOperationType {
  return type === "remotes.add" || type === "remotes.delete" || type === "remotes.update";
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

function remoteStatusKind(state: OperationNotification["state"]): "error" | "info" | "success" {
  if (state === "error") {
    return "error";
  }

  if (state === "success") {
    return "success";
  }

  return "info";
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

function contextActionRequest(
  action: ContextMenuAction,
  repositoryId: string,
  hash: string,
  selectedHashes: readonly string[]
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
    return { hashes: selectedHashes, repositoryId, type: "git.squashCommits" };
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

function getContextOperationResult(
  response: Extract<RpcResponse, { type: ContextGitOperationType }>
): OperationResultViewModel {
  if (response.type === "git.compareCommits") {
    return response.payload.result;
  }

  return response.payload;
}

function getSelectedHashesInHistoryOrder(
  commits: readonly CommitListItemViewModel[],
  hashes: readonly string[]
): readonly string[] {
  return commits
    .filter((commit) => hashes.includes(commit.hash))
    .map((commit) => commit.hash);
}

function canSquashSelectedCommits(selectedHashes: readonly string[]): boolean {
  return selectedHashes.length > 1;
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
  labels,
  message,
  onAbort,
  onContinue
}: {
  labels: {
    abort: string;
    continue: string;
    label: string;
  };
  message: string;
  onAbort: () => void;
  onContinue: () => void;
}): ReactElement {
  return (
    <section
      aria-label={labels.label}
      className="flex shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-notifications-background)] px-3 py-2 text-xs text-[var(--vscode-notifications-foreground)]"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        className="h-7 whitespace-nowrap rounded-[3px] border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] px-2 text-xs text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
        onClick={onContinue}
        type="button"
      >
        {labels.continue}
      </button>
      <button
        className="h-7 whitespace-nowrap rounded-[3px] border border-[var(--vscode-button-secondaryBorder,transparent)] bg-[var(--vscode-button-secondaryBackground)] px-2 text-xs text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
        onClick={onAbort}
        type="button"
      >
        {labels.abort}
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

function formatMessage(message: string, args: readonly unknown[]): string {
  return message.replace(/\{(\d+)}/g, (match: string, index: string) => {
    const value = args[Number.parseInt(index, 10)];
    return value === undefined ? match : formatArgument(value);
  });
}

function trimFilter(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function loadNotificationHistory(now: number): readonly NotificationHistoryItem[] {
  const value = window.localStorage.getItem(notificationHistoryStorageKey);
  if (!value) {
    return [];
  }

  try {
    return pruneNotificationHistory(JSON.parse(value) as readonly NotificationHistoryItem[], now);
  } catch {
    window.localStorage.removeItem(notificationHistoryStorageKey);
    return [];
  }
}

function loadNotificationCountVisibility(): boolean {
  return window.localStorage.getItem(notificationCountVisibilityStorageKey) !== "false";
}

function pruneNotificationHistory(
  notifications: readonly NotificationHistoryItem[],
  now: number
): readonly NotificationHistoryItem[] {
  const oldestRetained = now - notificationRetentionMs;
  return notifications.filter((notification) => Date.parse(notification.createdAt) >= oldestRetained);
}

function formatNotificationHistory(notifications: readonly NotificationHistoryItem[]): string {
  return notifications
    .map((notification) => `[${formatNotificationTime(notification.createdAt)}] ${notification.state}: ${notification.message}`)
    .join("\n");
}

function formatNotificationTime(createdAt: string): string {
  return new Date(createdAt).toLocaleString();
}

function formatArgument(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }

  return JSON.stringify(value);
}
