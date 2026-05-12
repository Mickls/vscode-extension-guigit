import { afterEach, describe, expect, it, vi } from "vitest";
import { registerGitWatchers } from "../../src/extension/watchers";

describe("git watchers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("watches git refs and debounces refresh notifications", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const patterns: string[] = [];
    const callbacks: Record<string, Array<() => void>> = {
      change: [],
      create: [],
      delete: []
    };

    registerGitWatchers({
      createFileSystemWatcher: (pattern) => {
        patterns.push(pattern.pattern);

        return {
          dispose: vi.fn(),
          onDidChange: (callback) => {
            callbacks.change.push(callback);
            return { dispose: vi.fn() };
          },
          onDidCreate: (callback) => {
            callbacks.create.push(callback);
            return { dispose: vi.fn() };
          },
          onDidDelete: (callback) => {
            callbacks.delete.push(callback);
            return { dispose: vi.fn() };
          }
        };
      },
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

    expect(patterns).toEqual([
      ".git/HEAD",
      ".git/refs/heads/**",
      ".git/refs/tags/**",
      ".git/refs/remotes/**",
      ".git/packed-refs"
    ]);

    callbacks.change[0]!();
    callbacks.change[0]!();
    vi.advanceTimersByTime(499);
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("watcher");
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

    expect(refresh).toHaveBeenCalledWith("watcher");
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

    expect(refresh).toHaveBeenCalledWith("watcher");
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

  it("refreshes when the active editor moves to a different workspace folder", () => {
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

    expect(refresh).toHaveBeenCalledWith("watcher");
  });
});
