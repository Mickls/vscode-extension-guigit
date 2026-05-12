import { afterEach, describe, expect, it, vi } from "vitest";
import { registerGitWatchers } from "../../src/extension/watchers";

describe("git watchers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("watches git refs and working tree files and debounces working tree notifications", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const harness = createWatcherHarness();

    registerGitWatchers({
      createFileSystemWatcher: harness.createFileSystemWatcher,
      createRelativePattern: (_folder, pattern) => ({ pattern }),
      git: {
        onDidOpenRepository: vi.fn(),
        repositories: []
      },
      logger: {
        debug: vi.fn()
      },
      onDidChangeActiveTextEditor: vi.fn(),
      refresh,
      workspaceFolders: [{ name: "repo", uri: { fsPath: "/workspace/repo" } }]
    });

    expect(harness.patterns()).toEqual([
      "**",
      ".git/HEAD",
      ".git/refs/heads/**",
      ".git/refs/tags/**",
      ".git/refs/remotes/**",
      ".git/packed-refs"
    ]);

    harness.trigger("**", "change", "/workspace/repo/src/file.ts");
    harness.trigger("**", "create", "/workspace/repo/src/created.ts");
    harness.trigger("**", "delete", "/workspace/repo/src/deleted.ts");
    vi.advanceTimersByTime(499);
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({
      reason: "watcher",
      repositoryId: "/workspace/repo",
      type: "workingTree"
    });
  });

  it("refreshes for git repository state only when the head commit changes", () => {
    vi.useFakeTimers();
    let repositoryStateChanged: (() => void) | undefined;
    const repository = {
      state: {
        HEAD: {
          commit: "old-head"
        },
        onDidChange: (callback: () => void) => {
          repositoryStateChanged = callback;
          return { dispose: vi.fn() };
        }
      }
    };
    const refresh = vi.fn();

    registerGitWatchers({
      createFileSystemWatcher: () => ({
        dispose: vi.fn(),
        onDidChange: vi.fn(),
        onDidCreate: vi.fn(),
        onDidDelete: vi.fn()
      }),
      createRelativePattern: (_folder, pattern) => ({ pattern }),
      git: {
        onDidOpenRepository: () => {
          return { dispose: vi.fn() };
        },
        repositories: [
          repository
        ]
      },
      logger: {
        debug: vi.fn()
      },
      onDidChangeActiveTextEditor: vi.fn(),
      refresh,
      workspaceFolders: []
    });

    repositoryStateChanged?.();
    vi.advanceTimersByTime(500);
    expect(refresh).not.toHaveBeenCalled();

    repository.state.HEAD.commit = "new-head";
    repositoryStateChanged?.();
    vi.advanceTimersByTime(500);

    expect(refresh).toHaveBeenCalledWith({
      reason: "watcher",
      type: "history"
    });
  });

  it("keeps git ref history refreshes separate from working tree bursts", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const harness = createWatcherHarness();

    registerGitWatchers({
      createFileSystemWatcher: harness.createFileSystemWatcher,
      createRelativePattern: (_folder, pattern) => ({ pattern }),
      logger: {
        debug: vi.fn()
      },
      onDidChangeActiveTextEditor: vi.fn(),
      refresh,
      workspaceFolders: [{ name: "repo", uri: { fsPath: "/workspace/repo" } }]
    });

    harness.trigger("**", "change", "/workspace/repo/src/file.ts");
    harness.trigger(".git/refs/heads/**", "change", "/workspace/repo/.git/refs/heads/main");
    harness.trigger(".git/refs/heads/**", "delete", "/workspace/repo/.git/refs/heads/old-branch");
    vi.advanceTimersByTime(500);

    expect(refresh.mock.calls).toEqual([
      [{ reason: "watcher", type: "history" }],
      [{
        reason: "watcher",
        repositoryId: "/workspace/repo",
        type: "workingTree"
      }]
    ]);
  });

  it("ignores git internals for working tree change notifications", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const harness = createWatcherHarness();

    registerGitWatchers({
      createFileSystemWatcher: harness.createFileSystemWatcher,
      createRelativePattern: (_folder, pattern) => ({ pattern }),
      logger: {
        debug: vi.fn()
      },
      onDidChangeActiveTextEditor: vi.fn(),
      refresh,
      workspaceFolders: [{ name: "repo", uri: { fsPath: "/workspace/repo" } }]
    });

    harness.trigger("**", "change", "/workspace/repo/.git/HEAD");
    harness.trigger(".git/HEAD", "change", "/workspace/repo/.git/HEAD");
    vi.advanceTimersByTime(500);

    expect(refresh.mock.calls).toEqual([
      [{ reason: "watcher", type: "history" }]
    ]);
  });

  it("ignores active editor changes for diff and virtual documents", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let activeEditorChanged: ((editor: unknown) => void) | undefined;

    registerGitWatchers({
      createFileSystemWatcher: () => ({
        dispose: vi.fn(),
        onDidChange: vi.fn(),
        onDidCreate: vi.fn(),
        onDidDelete: vi.fn()
      }),
      createRelativePattern: (_folder, pattern) => ({ pattern }),
      logger: {
        debug: vi.fn()
      },
      onDidChangeActiveTextEditor: (callback) => {
        activeEditorChanged = callback;
        return { dispose: vi.fn() };
      },
      refresh,
      workspaceFolders: [{ name: "repo", uri: { fsPath: "/workspace/repo" } }]
    });

    activeEditorChanged?.({ document: { uri: { scheme: "git" } } });
    activeEditorChanged?.({ document: { uri: { scheme: "guigit-doc-1" } } });
    vi.advanceTimersByTime(500);

    expect(refresh).not.toHaveBeenCalled();

    activeEditorChanged?.({ document: { uri: { fsPath: "/workspace/repo/src/file.ts", scheme: "file" } } });
    vi.advanceTimersByTime(500);

    expect(refresh).toHaveBeenCalledWith({
      reason: "watcher",
      repositoryId: "/workspace/repo",
      type: "workingTree"
    });
  });

  it("ignores active editor changes that stay inside the same workspace folder", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let activeEditorChanged: ((editor: unknown) => void) | undefined;

    registerGitWatchers({
      createFileSystemWatcher: () => ({
        dispose: vi.fn(),
        onDidChange: vi.fn(),
        onDidCreate: vi.fn(),
        onDidDelete: vi.fn()
      }),
      createRelativePattern: (_folder, pattern) => ({ pattern }),
      initialActiveTextEditor: () => ({ document: { uri: { fsPath: "/workspace/repo/src/current.ts", scheme: "file" } } }),
      logger: {
        debug: vi.fn()
      },
      onDidChangeActiveTextEditor: (callback) => {
        activeEditorChanged = callback;
        return { dispose: vi.fn() };
      },
      refresh,
      workspaceFolders: [{ name: "repo", uri: { fsPath: "/workspace/repo" } }]
    });

    activeEditorChanged?.({ document: { uri: { scheme: "guigit-doc-1" } } });
    activeEditorChanged?.({ document: { uri: { fsPath: "/workspace/repo/src/current.ts", scheme: "file" } } });
    vi.advanceTimersByTime(500);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("emits a working tree change when the active editor moves to a different workspace folder", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let activeEditorChanged: ((editor: unknown) => void) | undefined;

    registerGitWatchers({
      createFileSystemWatcher: () => ({
        dispose: vi.fn(),
        onDidChange: vi.fn(),
        onDidCreate: vi.fn(),
        onDidDelete: vi.fn()
      }),
      createRelativePattern: (_folder, pattern) => ({ pattern }),
      initialActiveTextEditor: () => ({ document: { uri: { fsPath: "/workspace/repo-a/src/current.ts", scheme: "file" } } }),
      logger: {
        debug: vi.fn()
      },
      onDidChangeActiveTextEditor: (callback) => {
        activeEditorChanged = callback;
        return { dispose: vi.fn() };
      },
      refresh,
      workspaceFolders: [
        { name: "repo-a", uri: { fsPath: "/workspace/repo-a" } },
        { name: "repo-b", uri: { fsPath: "/workspace/repo-b" } }
      ]
    });

    activeEditorChanged?.({ document: { uri: { fsPath: "/workspace/repo-b/src/current.ts", scheme: "file" } } });
    vi.advanceTimersByTime(500);

    expect(refresh).toHaveBeenCalledWith({
      reason: "watcher",
      repositoryId: "/workspace/repo-b",
      type: "workingTree"
    });
  });
});

type WatchEvent = "change" | "create" | "delete";
type WatchCallback = (uri: { fsPath: string }) => void;

function createWatcherHarness() {
  const watchers = new Map<string, Record<WatchEvent, WatchCallback[]>>();

  return {
    createFileSystemWatcher: (pattern: { pattern: string }) => {
      const callbacks: Record<WatchEvent, WatchCallback[]> = {
        change: [],
        create: [],
        delete: []
      };
      watchers.set(pattern.pattern, callbacks);

      return {
        dispose: vi.fn(),
        onDidChange: (callback: WatchCallback) => {
          callbacks.change.push(callback);
          return { dispose: vi.fn() };
        },
        onDidCreate: (callback: WatchCallback) => {
          callbacks.create.push(callback);
          return { dispose: vi.fn() };
        },
        onDidDelete: (callback: WatchCallback) => {
          callbacks.delete.push(callback);
          return { dispose: vi.fn() };
        }
      };
    },
    patterns: () => [...watchers.keys()],
    trigger: (pattern: string, event: WatchEvent, fsPath: string) => {
      for (const callback of watchers.get(pattern)?.[event] ?? []) {
        callback({ fsPath });
      }
    }
  };
}
