import type { Disposable } from "vscode";
import { isAbsolute, relative } from "node:path";
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
  onDidChange(callback: () => void): Disposable;
  onDidCreate(callback: () => void): Disposable;
  onDidDelete(callback: () => void): Disposable;
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
  refresh(reason: "watcher"): void;
  workspaceFolders: readonly WorkspaceFolderLike[];
}

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

  const scheduleRefresh = (reason: string) => {
    input.logger.debug("watcher.refreshScheduled", { reason });
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }

    refreshTimeout = setTimeout(() => {
      input.refresh("watcher");
    }, debounceMs);
  };

  disposables.push(
    input.onDidChangeActiveTextEditor((editor) => {
      const workspaceRoot = workspaceRootForEditor(input, editor);
      if (workspaceRoot && workspaceRoot !== activeWorkspaceRoot) {
        activeWorkspaceRoot = workspaceRoot;
        scheduleRefresh("active editor changed");
      }
    })
  );

  for (const folder of input.workspaceFolders) {
    const headWatcher = input.createFileSystemWatcher(input.createRelativePattern(folder, ".git/HEAD"));
    headWatcher.onDidChange(() => scheduleRefresh("HEAD changed"));
    disposables.push(headWatcher);

    for (const pattern of [".git/refs/heads/**", ".git/refs/tags/**", ".git/refs/remotes/**"]) {
      const refsWatcher = input.createFileSystemWatcher(input.createRelativePattern(folder, pattern));
      refsWatcher.onDidChange(() => scheduleRefresh(`${pattern} changed`));
      refsWatcher.onDidCreate(() => scheduleRefresh(`${pattern} created`));
      refsWatcher.onDidDelete(() => scheduleRefresh(`${pattern} deleted`));
      disposables.push(refsWatcher);
    }

    const packedRefsWatcher = input.createFileSystemWatcher(input.createRelativePattern(folder, ".git/packed-refs"));
    packedRefsWatcher.onDidChange(() => scheduleRefresh("packed refs changed"));
    packedRefsWatcher.onDidCreate(() => scheduleRefresh("packed refs created"));
    packedRefsWatcher.onDidDelete(() => scheduleRefresh("packed refs deleted"));
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
            scheduleRefresh("repository HEAD changed");
          }
        })
      );
    };

    disposables.push(
      input.git.onDidOpenRepository((repository) => {
        registerRepository(repository);
        scheduleRefresh("repository opened");
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
