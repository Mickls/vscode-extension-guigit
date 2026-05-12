import type { Disposable } from "vscode";
import { isAbsolute, join, relative } from "node:path";
import type { Logger } from "../logging/LoggerService";

export interface RelativePatternLike {
  pattern: string;
}

export interface WorkspaceFolderLike {
  name: string;
  uri: {
    fsPath: string;
  };
}

export interface FileSystemWatcherLike extends Disposable {
  onDidChange(callback: (uri: { fsPath: string }) => void): Disposable;
  onDidCreate(callback: (uri: { fsPath: string }) => void): Disposable;
  onDidDelete(callback: (uri: { fsPath: string }) => void): Disposable;
}

export interface GitRepositoryLike {
  state: {
    HEAD?: {
      commit?: string;
    };
    onDidChange(callback: () => void): Disposable;
  };
}

export interface GitApiLike {
  onDidOpenRepository(callback: (repository: GitRepositoryLike) => void): Disposable;
  repositories: readonly GitRepositoryLike[];
}

export interface GitWatchersInput {
  createFileSystemWatcher(pattern: RelativePatternLike): FileSystemWatcherLike;
  createRelativePattern(folder: WorkspaceFolderLike, pattern: string): RelativePatternLike;
  debounceMs?: number;
  git?: GitApiLike;
  initialActiveTextEditor?: () => unknown;
  logger: Pick<Logger, "debug">;
  onDidChangeActiveTextEditor(callback: (editor: unknown) => void): Disposable;
  refresh(request: WatcherRefreshRequest): void;
  workspaceFolders: readonly WorkspaceFolderLike[];
}

export type WatcherRefreshRequest =
  | {
      reason: "watcher";
      type: "history";
    }
  | {
      reason: "watcher";
      repositoryId?: string;
      type: "workingTree";
    };

interface ActiveEditorLike {
  document: {
    uri: {
      fsPath: string;
      scheme: string;
    };
  };
}

export function registerGitWatchers(input: GitWatchersInput): readonly Disposable[] {
  const disposables: Disposable[] = [];
  let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
  const debounceMs = input.debounceMs ?? 500;
  let activeWorkspaceRoot = workspaceRootForEditor(input, input.initialActiveTextEditor?.());
  let pendingHistoryRefresh = false;
  let pendingWorkingTreeRefresh = false;
  let pendingWorkingTreeHasUnscopedChange = false;
  const pendingWorkingTreeRepositoryIds = new Set<string>();

  const flushRefreshes = () => {
    refreshTimeout = undefined;

    if (pendingHistoryRefresh) {
      input.refresh({
        reason: "watcher",
        type: "history"
      });
    }

    if (pendingWorkingTreeRefresh) {
      const nextRepositoryId = pendingWorkingTreeRepositoryIds.values().next();
      input.refresh({
        reason: "watcher",
        repositoryId:
          pendingWorkingTreeHasUnscopedChange || pendingWorkingTreeRepositoryIds.size !== 1 || nextRepositoryId.done
            ? undefined
            : nextRepositoryId.value,
        type: "workingTree"
      });
    }

    pendingHistoryRefresh = false;
    pendingWorkingTreeRefresh = false;
    pendingWorkingTreeHasUnscopedChange = false;
    pendingWorkingTreeRepositoryIds.clear();
  };

  const scheduleRefresh = (reason: string) => {
    input.logger.debug("watcher.refreshScheduled", { reason });
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }

    refreshTimeout = setTimeout(() => {
      flushRefreshes();
    }, debounceMs);
  };

  const scheduleHistoryRefresh = (reason: string) => {
    pendingHistoryRefresh = true;
    scheduleRefresh(reason);
  };

  const scheduleWorkingTreeRefresh = (reason: string, repositoryId?: string) => {
    pendingWorkingTreeRefresh = true;
    if (repositoryId) {
      pendingWorkingTreeRepositoryIds.add(repositoryId);
    } else {
      pendingWorkingTreeHasUnscopedChange = true;
    }
    scheduleRefresh(reason);
  };

  disposables.push(
    input.onDidChangeActiveTextEditor((editor) => {
      const workspaceRoot = workspaceRootForEditor(input, editor);
      if (workspaceRoot && workspaceRoot !== activeWorkspaceRoot) {
        activeWorkspaceRoot = workspaceRoot;
        scheduleWorkingTreeRefresh("active editor changed", workspaceRoot);
      }
    })
  );

  for (const folder of input.workspaceFolders) {
    const workingTreeWatcher = input.createFileSystemWatcher(input.createRelativePattern(folder, "**"));
    const onWorkingTreeFileEvent = (uri: { fsPath: string }) => {
      if (isPathInside(uri.fsPath, join(folder.uri.fsPath, ".git"))) {
        return;
      }

      scheduleWorkingTreeRefresh("working tree changed", folder.uri.fsPath);
    };
    workingTreeWatcher.onDidChange(onWorkingTreeFileEvent);
    workingTreeWatcher.onDidCreate(onWorkingTreeFileEvent);
    workingTreeWatcher.onDidDelete(onWorkingTreeFileEvent);
    disposables.push(workingTreeWatcher);

    const headWatcher = input.createFileSystemWatcher(input.createRelativePattern(folder, ".git/HEAD"));
    headWatcher.onDidChange(() => scheduleHistoryRefresh("HEAD changed"));
    disposables.push(headWatcher);

    for (const pattern of [".git/refs/heads/**", ".git/refs/tags/**", ".git/refs/remotes/**"]) {
      const refsWatcher = input.createFileSystemWatcher(input.createRelativePattern(folder, pattern));
      refsWatcher.onDidChange(() => scheduleHistoryRefresh(`${pattern} changed`));
      refsWatcher.onDidCreate(() => scheduleHistoryRefresh(`${pattern} created`));
      refsWatcher.onDidDelete(() => scheduleHistoryRefresh(`${pattern} deleted`));
      disposables.push(refsWatcher);
    }

    const packedRefsWatcher = input.createFileSystemWatcher(input.createRelativePattern(folder, ".git/packed-refs"));
    packedRefsWatcher.onDidChange(() => scheduleHistoryRefresh("packed refs changed"));
    packedRefsWatcher.onDidCreate(() => scheduleHistoryRefresh("packed refs created"));
    packedRefsWatcher.onDidDelete(() => scheduleHistoryRefresh("packed refs deleted"));
    disposables.push(packedRefsWatcher);
  }

  if (input.git) {
    const registerRepository = (repository: GitRepositoryLike) => {
      let headCommit = repository.state.HEAD?.commit;
      disposables.push(
        repository.state.onDidChange(() => {
          const nextHeadCommit = repository.state.HEAD?.commit;
          if (nextHeadCommit !== headCommit) {
            headCommit = nextHeadCommit;
            scheduleHistoryRefresh("repository HEAD changed");
          }
        })
      );
    };

    disposables.push(
      input.git.onDidOpenRepository((repository) => {
        registerRepository(repository);
      })
    );
    input.git.repositories.forEach(registerRepository);
  }

  disposables.push({
    dispose: () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    }
  });

  return disposables;
}

function workspaceRootForEditor(input: GitWatchersInput, editor: unknown): string | undefined {
  if (!isFileEditor(editor)) {
    return undefined;
  }

  return input.workspaceFolders.find((folder) => isPathInside(editor.document.uri.fsPath, folder.uri.fsPath))?.uri.fsPath;
}

function isFileEditor(editor: unknown): editor is ActiveEditorLike {
  return (editor as ActiveEditorLike | undefined)?.document.uri.scheme === "file";
}

function isPathInside(path: string, parent: string): boolean {
  const result = relative(parent, path);
  return result === "" || (!result.startsWith("..") && !isAbsolute(result));
}
