export const allRpcRequestTypes = [
  "history.load",
  "branches.list",
  "commits.getDetails",
  "files.getChanges",
  "graph.getLayout",
  "diff.openCommitFile",
  "diff.openCompareFile",
  "remotes.list",
  "remotes.add",
  "remotes.update",
  "remotes.delete",
  "settings.get",
  "settings.update",
  "git.pull",
  "git.advancedPull",
  "git.push",
  "git.advancedPush",
  "git.fetch",
  "git.clone",
  "git.checkout",
  "git.cherryPick",
  "git.revert",
  "git.reset",
  "git.compareCommits",
  "git.squashCommits",
  "git.createBranchFromCommit",
  "git.pushAllCommitsToHere",
  "git.editCommitMessage"
] as const;

export const backendRpcHandlerTypes = allRpcRequestTypes;

export type RpcRequestType = (typeof allRpcRequestTypes)[number];

export type FileViewMode = "tree" | "list";
export type AutoStashPreference = "ask" | "always" | "never";
export type LanguagePreference = "auto" | "en" | "zh" | "es" | "fr" | "de" | "ja" | "ru";
export type GitResetMode = "soft" | "mixed" | "hard";

export interface RpcEnvelope {
  id: string;
}

export interface RepositoryViewModel {
  id: string;
  name: string;
  rootPath: string;
}

export interface BranchViewModel {
  name: string;
  current: boolean;
  remote?: string;
}

export interface RemoteBranchGroupViewModel {
  remote: string;
  branches: readonly BranchViewModel[];
}

export interface BranchesViewModel {
  locals: readonly BranchViewModel[];
  remotes: readonly RemoteBranchGroupViewModel[];
}

export interface CommitListItemViewModel {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  refs: readonly RefViewModel[];
  parents: readonly string[];
  canEditMessage: boolean;
}

export interface RefViewModel {
  name: string;
  type: "head" | "remote" | "tag" | "local";
}

export interface CommitDetailsViewModel {
  hash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  refs: readonly RefViewModel[];
  body: string;
  files: readonly FileChangeViewModel[];
  canEditMessage: boolean;
}

export interface FileChangeViewModel {
  path: string;
  previousPath?: string;
  status: "added" | "deleted" | "modified" | "renamed" | "copied" | "unchanged";
  insertions: number;
  deletions: number;
  binary: boolean;
}

export interface GraphLayoutViewModel {
  nodes: readonly GraphNodeViewModel[];
  edges: readonly GraphEdgeViewModel[];
  width: number;
}

export interface GraphNodeViewModel {
  hash: string;
  row: number;
  column: number;
  x: number;
  y: number;
  color: string;
}

export interface GraphEdgeViewModel {
  fromHash: string;
  toHash: string;
  points: readonly GraphPointViewModel[];
  color: string;
}

export interface GraphPointViewModel {
  x: number;
  y: number;
}

export interface RemoteViewModel {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface SettingsViewModel {
  autoStashOnPull: AutoStashPreference;
  blameEnabled: boolean;
  blameShowOnlyCurrentLine: boolean;
  blameFormat: string;
  language: LanguagePreference;
  fileViewMode: FileViewMode;
  proxy: ProxySettingsViewModel;
}

export interface ProxySettingsViewModel {
  enabled: boolean;
  http: string;
  https: string;
  noProxy: string;
}

export interface OperationResultViewModel {
  status: "ok" | "cancelled";
  message: string;
}

export type RpcRequest =
  | (RpcEnvelope & {
      type: "history.load";
      repositoryId?: string;
      branch?: string;
      search?: string;
      author?: string;
      cursor?: string;
      pageSize: number;
    })
  | (RpcEnvelope & { type: "branches.list"; repositoryId: string })
  | (RpcEnvelope & { type: "commits.getDetails"; repositoryId: string; hash: string })
  | (RpcEnvelope & {
      type: "files.getChanges";
      repositoryId: string;
      hash: string;
      mode: FileViewMode;
    })
  | (RpcEnvelope & { type: "graph.getLayout"; repositoryId: string; hashes: readonly string[] })
  | (RpcEnvelope & { type: "diff.openCommitFile"; repositoryId: string; hash: string; filePath: string })
  | (RpcEnvelope & {
      type: "diff.openCompareFile";
      repositoryId: string;
      fromHash: string;
      toHash: string;
      filePath: string;
    })
  | (RpcEnvelope & { type: "remotes.list"; repositoryId: string })
  | (RpcEnvelope & { type: "remotes.add"; repositoryId: string; name: string; url: string })
  | (RpcEnvelope & { type: "remotes.update"; repositoryId: string; name: string; url: string })
  | (RpcEnvelope & { type: "remotes.delete"; repositoryId: string; name: string })
  | (RpcEnvelope & { type: "settings.get" })
  | (RpcEnvelope & { type: "settings.update"; settings: Partial<SettingsViewModel> })
  | (RpcEnvelope & { type: "git.pull"; repositoryId: string })
  | (RpcEnvelope & { type: "git.advancedPull"; repositoryId: string })
  | (RpcEnvelope & { type: "git.push"; repositoryId: string })
  | (RpcEnvelope & { type: "git.advancedPush"; repositoryId: string })
  | (RpcEnvelope & { type: "git.fetch"; repositoryId: string })
  | (RpcEnvelope & { type: "git.clone"; targetDirectory: string; url: string })
  | (RpcEnvelope & { type: "git.checkout"; repositoryId: string; branch: string })
  | (RpcEnvelope & { type: "git.cherryPick"; repositoryId: string; hash: string })
  | (RpcEnvelope & { type: "git.revert"; repositoryId: string; hash: string })
  | (RpcEnvelope & { type: "git.reset"; repositoryId: string; hash: string; mode: GitResetMode })
  | (RpcEnvelope & { type: "git.compareCommits"; repositoryId: string; hashes: readonly string[] })
  | (RpcEnvelope & { type: "git.squashCommits"; repositoryId: string; hashes: readonly string[] })
  | (RpcEnvelope & {
      type: "git.createBranchFromCommit";
      repositoryId: string;
      hash: string;
      branchName: string;
    })
  | (RpcEnvelope & { type: "git.pushAllCommitsToHere"; repositoryId: string; hash: string })
  | (RpcEnvelope & {
      type: "git.editCommitMessage";
      repositoryId: string;
      hash: string;
      message: string;
    });

export interface RpcPayloadByType {
  "history.load": {
    repositories: readonly RepositoryViewModel[];
    branches: BranchesViewModel;
    commits: readonly CommitListItemViewModel[];
    hasMore: boolean;
    nextCursor?: string;
  };
  "branches.list": { branches: BranchesViewModel };
  "commits.getDetails": { commit: CommitDetailsViewModel };
  "files.getChanges": { files: readonly FileChangeViewModel[]; mode: FileViewMode };
  "graph.getLayout": { graph: GraphLayoutViewModel };
  "diff.openCommitFile": OperationResultViewModel;
  "diff.openCompareFile": OperationResultViewModel;
  "remotes.list": { remotes: readonly RemoteViewModel[] };
  "remotes.add": OperationResultViewModel;
  "remotes.update": OperationResultViewModel;
  "remotes.delete": OperationResultViewModel;
  "settings.get": { settings: SettingsViewModel };
  "settings.update": { settings: SettingsViewModel };
  "git.pull": OperationResultViewModel;
  "git.advancedPull": OperationResultViewModel;
  "git.push": OperationResultViewModel;
  "git.advancedPush": OperationResultViewModel;
  "git.fetch": OperationResultViewModel;
  "git.clone": OperationResultViewModel;
  "git.checkout": OperationResultViewModel;
  "git.cherryPick": OperationResultViewModel;
  "git.revert": OperationResultViewModel;
  "git.reset": OperationResultViewModel;
  "git.compareCommits": OperationResultViewModel;
  "git.squashCommits": OperationResultViewModel;
  "git.createBranchFromCommit": OperationResultViewModel;
  "git.pushAllCommitsToHere": OperationResultViewModel;
  "git.editCommitMessage": OperationResultViewModel;
}

export type RpcSuccessResponse<TType extends RpcRequestType = RpcRequestType> = {
  [Type in TType]: RpcEnvelope & {
    ok: true;
    type: Type;
    payload: RpcPayloadByType[Type];
  };
}[TType];

export interface RpcError {
  code: "UNKNOWN_REQUEST" | "BACKEND_ERROR" | "GIT_ERROR" | "USER_CANCELLED";
  message: string;
}

export type RpcErrorResponse<TType extends RpcRequestType = RpcRequestType> = RpcEnvelope & {
  ok: false;
  type: TType;
  error: RpcError;
};

export type RpcResponse = RpcSuccessResponse | RpcErrorResponse;

export type BackendNotification =
  | {
      type: "history.changed";
      reason: "command" | "watcher" | "operation";
    }
  | {
      type: "history.revealCommit";
      hash: string;
    }
  | {
      type: "settings.changed";
      settings: SettingsViewModel;
    }
  | {
      type: "operation.completed";
      result: OperationResultViewModel;
    };
