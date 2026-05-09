import { describe, expect, it } from "vitest";
import { createGitHistoryRpcHandlers } from "../../src/backend/rpc/gitHistoryRpcHandlers";
import type {
  BranchesViewModel,
  CommitDetailsViewModel,
  CommitListItemViewModel,
  GraphLayoutViewModel,
  RemoteViewModel
} from "../../src/backend/rpc/contract";

const branches = {
  locals: [{ current: true, name: "main" }],
  remotes: []
} satisfies BranchesViewModel;

const commit = {
  author: "Ada",
  canEditMessage: true,
  date: "2026-05-07 10:00:00 +0800",
  hash: "abc1234567890abcdef",
  message: "Wire handlers",
  parents: [],
  refs: [],
  shortHash: "abc1234"
} satisfies CommitListItemViewModel;

const details = {
  author: "Ada",
  body: "Details",
  canEditMessage: true,
  date: "2026-05-07 10:00:00 +0800",
  email: "ada@example.com",
  files: [],
  hash: "abc1234567890abcdef",
  message: "Wire handlers",
  refs: []
} satisfies CommitDetailsViewModel;

const graph = {
  edges: [
    {
      color: "#f56565",
      fromHash: "abc1234567890abcdef",
      points: [
        { x: 16, y: 18 },
        { x: 16, y: 54 }
      ],
      toHash: "def4567890abcdefabc"
    }
  ],
  nodes: [
    {
      color: "#f56565",
      column: 0,
      hash: "abc1234567890abcdef",
      row: 0,
      x: 8,
      y: 18
    }
  ],
  width: 120
} satisfies GraphLayoutViewModel;

const remotes = [
  {
    fetchUrl: "https://example.com/repo.git",
    name: "origin",
    pushUrl: "https://example.com/repo.git"
  }
] satisfies readonly RemoteViewModel[];

describe("Git history RPC handlers", () => {
  it("loads repositories, branches, and commit history", async () => {
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [commit],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async () => graph
      },
      diffService: {
        openCommitFileDiff: async () => ({ message: "ok", status: "ok" }),
        openCompareFileDiff: async () => ({ message: "ok", status: "ok" })
      },
      fileHistoryPanel: {
        openHistory: async () => ({ message: "ok", status: "ok" }),
        openWorkingFile: async () => ({ message: "ok", status: "ok" })
      },
      gitService: createGitService(),
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => ({ id: "/repo", name: "repo", rootPath: "/repo" }),
        switchToActiveEditorRepository: () => ({ id: "/repo", name: "repo", rootPath: "/repo" })
      },
      proxyService: createProxyService(),
      remoteService: createRemoteService(),
      languageService: createLanguageService(),
      settingsService: createSettingsService()
    });

    await expect(handlers["history.load"]!({ id: "1", pageSize: 50, type: "history.load" })).resolves.toEqual({
      branches,
      commits: [commit],
      hasMore: false,
      repositories: [{ id: "/repo", name: "repo", rootPath: "/repo" }]
    });
  });

  it("reads and updates settings", async () => {
    let resetAutoStashPreferenceCalled = false;
    const updates: unknown[] = [];
    const proxyCalls: string[] = [];
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async () => graph
      },
      diffService: {
        openCommitFileDiff: async () => ({ message: "ok", status: "ok" }),
        openCompareFileDiff: async () => ({ message: "ok", status: "ok" })
      },
      fileHistoryPanel: {
        openHistory: async () => ({ message: "ok", status: "ok" }),
        openWorkingFile: async () => ({ message: "ok", status: "ok" })
      },
      gitService: createGitService(),
      repositoryService: {
        discoverRepositories: async () => [],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      },
      proxyService: {
        configureProxy: async () => {
          proxyCalls.push("configure");
          return { message: "proxy configured", status: "ok" };
        },
        refreshProxy: async () => {
          proxyCalls.push("refresh");
          return { message: "proxy refreshed", status: "ok" };
        }
      },
      remoteService: createRemoteService(),
      languageService: {
        changeLanguagePreference: async () => ({ message: "language changed", status: "ok" }),
        getBundle: () => ({
          locale: "zh",
          messages: {
            settingsMenu: {
              changeLanguage: "切换语言"
            }
          }
        })
      },
      settingsService: {
        getSettings: () => createSettings("tree"),
        resetAutoStashPreference: async () => {
          resetAutoStashPreferenceCalled = true;
        },
        updateSettings: async (settings) => {
          updates.push(settings);
        }
      }
    });

    expect(handlers["settings.get"]!({ id: "settings-1", type: "settings.get" })).toEqual({
      i18n: {
        locale: "zh",
        messages: {
          settingsMenu: {
            changeLanguage: "切换语言"
          }
        }
      },
      settings: createSettings("tree")
    });
    await expect(
      handlers["settings.update"]!({
        id: "settings-2",
        settings: { fileViewMode: "list" },
        type: "settings.update"
      })
    ).resolves.toEqual({
      i18n: {
        locale: "zh",
        messages: {
          settingsMenu: {
            changeLanguage: "切换语言"
          }
        }
      },
      settings: createSettings("tree")
    });
    await expect(handlers["settings.resetAutoStash"]!({ id: "settings-3", type: "settings.resetAutoStash" })).resolves.toEqual({
      message: "Auto stash preference reset to Ask",
      status: "ok"
    });
    await expect(handlers["settings.changeLanguage"]!({ id: "settings-4", type: "settings.changeLanguage" })).resolves.toEqual({
      message: "language changed",
      status: "ok"
    });
    await expect(handlers["proxy.configure"]!({ id: "settings-5", type: "proxy.configure" })).resolves.toEqual({
      message: "proxy configured",
      status: "ok"
    });
    await expect(handlers["proxy.refresh"]!({ id: "settings-6", type: "proxy.refresh" })).resolves.toEqual({
      message: "proxy refreshed",
      status: "ok"
    });
    expect(updates).toEqual([{ fileViewMode: "list" }]);
    expect(resetAutoStashPreferenceCalled).toBe(true);
    expect(proxyCalls).toEqual(["configure", "refresh"]);
  });

  it("returns commit details for the requested repository", async () => {
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async () => graph
      },
      diffService: {
        openCommitFileDiff: async () => ({ message: "ok", status: "ok" }),
        openCompareFileDiff: async () => ({ message: "ok", status: "ok" })
      },
      fileHistoryPanel: {
        openHistory: async () => ({ message: "ok", status: "ok" }),
        openWorkingFile: async () => ({ message: "ok", status: "ok" })
      },
      gitService: createGitService(),
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      },
      proxyService: createProxyService(),
      remoteService: createRemoteService(),
      languageService: createLanguageService(),
      settingsService: createSettingsService()
    });

    await expect(
      handlers["commits.getDetails"]!({
        hash: "abc1234567890abcdef",
        id: "2",
        repositoryId: "/repo",
        type: "commits.getDetails"
      })
    ).resolves.toEqual({ commit: details });
  });

  it("returns backend graph layout for the requested repository", async () => {
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async (repositoryRoot, hashes) => ({
          ...graph,
          nodes: graph.nodes.map((node) => ({ ...node, hash: `${repositoryRoot}:${hashes.join(",")}` }))
        })
      },
      diffService: {
        openCommitFileDiff: async () => ({ message: "ok", status: "ok" }),
        openCompareFileDiff: async () => ({ message: "ok", status: "ok" })
      },
      fileHistoryPanel: {
        openHistory: async () => ({ message: "ok", status: "ok" }),
        openWorkingFile: async () => ({ message: "ok", status: "ok" })
      },
      gitService: createGitService(),
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      },
      proxyService: createProxyService(),
      remoteService: createRemoteService(),
      languageService: createLanguageService(),
      settingsService: createSettingsService()
    });

    await expect(
      handlers["graph.getLayout"]!({
        hashes: ["abc1234567890abcdef", "def4567890abcdefabc"],
        id: "3",
        repositoryId: "/repo",
        type: "graph.getLayout"
      })
    ).resolves.toEqual({
      graph: {
        ...graph,
        nodes: [{ ...graph.nodes[0]!, hash: "/repo:abc1234567890abcdef,def4567890abcdefabc" }]
      }
    });
  });

  it("opens commit and compare diffs for the requested repository", async () => {
    const diffCalls: unknown[] = [];
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async () => graph
      },
      diffService: {
        openCommitFileDiff: async (...args) => {
          diffCalls.push(["commit", ...args]);
          return { message: "commit opened", status: "ok" };
        },
        openCompareFileDiff: async (...args) => {
          diffCalls.push(["compare", ...args]);
          return { message: "compare opened", status: "ok" };
        }
      },
      fileHistoryPanel: {
        openHistory: async () => ({ message: "ok", status: "ok" }),
        openWorkingFile: async () => ({ message: "ok", status: "ok" })
      },
      gitService: createGitService(),
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      },
      proxyService: createProxyService(),
      remoteService: createRemoteService(),
      languageService: createLanguageService(),
      settingsService: createSettingsService()
    });

    await expect(
      handlers["diff.openCommitFile"]!({
        filePath: "src/file.ts",
        hash: "abc1234567890abcdef",
        id: "4",
        repositoryId: "/repo",
        type: "diff.openCommitFile"
      })
    ).resolves.toEqual({ message: "commit opened", status: "ok" });
    await expect(
      handlers["diff.openCompareFile"]!({
        filePath: "src/file.ts",
        fromHash: "abc1234567890abcdef",
        id: "5",
        repositoryId: "/repo",
        toHash: "def4567890abcdefabc",
        type: "diff.openCompareFile"
      })
    ).resolves.toEqual({ message: "compare opened", status: "ok" });

    expect(diffCalls).toEqual([
      ["commit", "/repo", "abc1234567890abcdef", "src/file.ts"],
      ["compare", "/repo", "abc1234567890abcdef", "def4567890abcdefabc", "src/file.ts"]
    ]);
  });

  it("opens working files and file history for the requested repository", async () => {
    const fileCalls: unknown[] = [];
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async () => graph
      },
      diffService: {
        openCommitFileDiff: async () => ({ message: "ok", status: "ok" }),
        openCompareFileDiff: async () => ({ message: "ok", status: "ok" })
      },
      fileHistoryPanel: {
        openHistory: async (...args) => {
          fileCalls.push(["history", ...args]);
          return { message: "history opened", status: "ok" };
        },
        openWorkingFile: async (...args) => {
          fileCalls.push(["open", ...args]);
          return { message: "file opened", status: "ok" };
        }
      },
      gitService: createGitService(),
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      },
      proxyService: createProxyService(),
      remoteService: createRemoteService(),
      languageService: createLanguageService(),
      settingsService: createSettingsService()
    });

    await expect(
      handlers["files.openWorkingFile"]!({
        filePath: "src/file.ts",
        id: "6",
        repositoryId: "/repo",
        type: "files.openWorkingFile"
      })
    ).resolves.toEqual({ message: "file opened", status: "ok" });
    await expect(
      handlers["files.openHistory"]!({
        filePath: "src/file.ts",
        id: "7",
        repositoryId: "/repo",
        type: "files.openHistory"
      })
    ).resolves.toEqual({ message: "history opened", status: "ok" });

    expect(fileCalls).toEqual([
      ["open", "/repo", "src/file.ts"],
      ["history", "/repo", "src/file.ts"]
    ]);
  });

  it("loads and updates remotes for the requested repository", async () => {
    const remoteCalls: unknown[] = [];
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async () => graph
      },
      diffService: {
        openCommitFileDiff: async () => ({ message: "ok", status: "ok" }),
        openCompareFileDiff: async () => ({ message: "ok", status: "ok" })
      },
      fileHistoryPanel: {
        openHistory: async () => ({ message: "ok", status: "ok" }),
        openWorkingFile: async () => ({ message: "ok", status: "ok" })
      },
      gitService: createGitService(),
      proxyService: createProxyService(),
      languageService: createLanguageService(),
      remoteService: {
        addRemote: async (repositoryRoot, name, url) => {
          remoteCalls.push(["add", repositoryRoot, name, url]);
          return { message: "remote added", status: "ok" };
        },
        deleteRemote: async (repositoryRoot, name) => {
          remoteCalls.push(["delete", repositoryRoot, name]);
          return { message: "remote deleted", status: "ok" };
        },
        listRemotes: async (repositoryRoot) => {
          remoteCalls.push(["list", repositoryRoot]);
          return remotes;
        },
        updateRemote: async (repositoryRoot, name, url) => {
          remoteCalls.push(["update", repositoryRoot, name, url]);
          return { message: "remote updated", status: "ok" };
        }
      },
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      },
      settingsService: createSettingsService()
    });

    await expect(handlers["remotes.list"]!({ id: "remote-1", repositoryId: "/repo", type: "remotes.list" })).resolves.toEqual({
      remotes
    });
    await expect(
      handlers["remotes.add"]!({
        id: "remote-2",
        name: "upstream",
        repositoryId: "/repo",
        type: "remotes.add",
        url: "https://example.com/up.git"
      })
    ).resolves.toEqual({ message: "remote added", status: "ok" });
    await expect(
      handlers["remotes.update"]!({
        id: "remote-3",
        name: "origin",
        repositoryId: "/repo",
        type: "remotes.update",
        url: "https://example.com/new.git"
      })
    ).resolves.toEqual({ message: "remote updated", status: "ok" });
    await expect(
      handlers["remotes.delete"]!({
        id: "remote-4",
        name: "origin",
        repositoryId: "/repo",
        type: "remotes.delete"
      })
    ).resolves.toEqual({ message: "remote deleted", status: "ok" });

    expect(remoteCalls).toEqual([
      ["list", "/repo"],
      ["add", "/repo", "upstream", "https://example.com/up.git"],
      ["update", "/repo", "origin", "https://example.com/new.git"],
      ["delete", "/repo", "origin"]
    ]);
  });

  it("runs git operations for the requested repository", async () => {
    const gitCalls: unknown[] = [];
    const handlers = createGitHistoryRpcHandlers({
      branchService: {
        listBranches: async () => branches
      },
      commitService: {
        loadHistory: async () => ({
          commits: [],
          hasMore: false
        })
      },
      fileService: {
        getCommitDetails: async () => details,
        getFileChanges: async () => ({
          files: [],
          mode: "list"
        })
      },
      graphService: {
        getLayout: async () => graph
      },
      diffService: {
        openCommitFileDiff: async () => ({ message: "ok", status: "ok" }),
        openCompareFileDiff: async () => ({ message: "ok", status: "ok" })
      },
      fileHistoryPanel: {
        openHistory: async () => ({ message: "ok", status: "ok" }),
        openWorkingFile: async () => ({ message: "ok", status: "ok" })
      },
      gitService: {
        advancedPull: async (repositoryRoot) => {
          gitCalls.push(["advancedPull", repositoryRoot]);
          return { message: "advanced pull", status: "ok" };
        },
        abortOperation: async (repositoryRoot) => {
          gitCalls.push(["abortOperation", repositoryRoot]);
          return { message: "abort operation", status: "cancelled" };
        },
        advancedPush: async (repositoryRoot) => {
          gitCalls.push(["advancedPush", repositoryRoot]);
          return { message: "advanced push", status: "ok" };
        },
        checkout: async (repositoryRoot, branch) => {
          gitCalls.push(["checkout", repositoryRoot, branch]);
          return { message: "checkout", status: "ok" };
        },
        cherryPick: async (repositoryRoot, hash) => {
          gitCalls.push(["cherryPick", repositoryRoot, hash]);
          return { message: "cherry pick", status: "ok" };
        },
        clone: async (targetDirectory, url) => {
          gitCalls.push(["clone", targetDirectory, url]);
          return { message: "clone", status: "ok" };
        },
        compareCommits: async (repositoryRoot, hashes) => {
          gitCalls.push(["compareCommits", repositoryRoot, hashes]);
          return { message: "compare commits", status: "ok" };
        },
        continueOperation: async (repositoryRoot) => {
          gitCalls.push(["continueOperation", repositoryRoot]);
          return { message: "continue operation", status: "ok" };
        },
        copyHash: async (hash) => {
          gitCalls.push(["copyHash", hash]);
          return { message: "copy hash", status: "ok" };
        },
        createBranchFromCommit: async (repositoryRoot, hash) => {
          gitCalls.push(["createBranchFromCommit", repositoryRoot, hash]);
          return { message: "create branch", status: "ok" };
        },
        editCommitMessage: async (repositoryRoot, hash) => {
          gitCalls.push(["editCommitMessage", repositoryRoot, hash]);
          return { message: "edit commit message", status: "ok" };
        },
        getOperationState: async (repositoryRoot) => {
          gitCalls.push(["operationState", repositoryRoot]);
          return { message: "operation state", status: "ok" };
        },
        fetch: async (repositoryRoot) => {
          gitCalls.push(["fetch", repositoryRoot]);
          return { message: "fetch", status: "ok" };
        },
        pull: async (repositoryRoot) => {
          gitCalls.push(["pull", repositoryRoot]);
          return { message: "pull", status: "ok" };
        },
        push: async (repositoryRoot) => {
          gitCalls.push(["push", repositoryRoot]);
          return { message: "push", status: "ok" };
        },
        pushAllCommitsToHere: async (repositoryRoot, hash) => {
          gitCalls.push(["pushAllCommitsToHere", repositoryRoot, hash]);
          return { message: "push commits", status: "ok" };
        },
        reset: async (repositoryRoot, hash, mode) => {
          gitCalls.push(["reset", repositoryRoot, hash, mode]);
          return { message: "reset", status: "ok" };
        },
        revert: async (repositoryRoot, hash) => {
          gitCalls.push(["revert", repositoryRoot, hash]);
          return { message: "revert", status: "ok" };
        },
        squashCommits: async (repositoryRoot, hashes) => {
          gitCalls.push(["squashCommits", repositoryRoot, hashes]);
          return { message: "squash commits", status: "ok" };
        }
      },
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      },
      proxyService: createProxyService(),
      remoteService: createRemoteService(),
      languageService: createLanguageService(),
      settingsService: createSettingsService()
    });

    await handlers["git.pull"]!({ id: "8", repositoryId: "/repo", type: "git.pull" });
    await handlers["git.advancedPull"]!({ id: "9", repositoryId: "/repo", type: "git.advancedPull" });
    await handlers["git.continueOperation"]!({ id: "9a", repositoryId: "/repo", type: "git.continueOperation" });
    await handlers["git.abortOperation"]!({ id: "9b", repositoryId: "/repo", type: "git.abortOperation" });
    await handlers["git.operationState"]!({ id: "9c", repositoryId: "/repo", type: "git.operationState" });
    await handlers["git.push"]!({ id: "10", repositoryId: "/repo", type: "git.push" });
    await handlers["git.advancedPush"]!({ id: "11", repositoryId: "/repo", type: "git.advancedPush" });
    await handlers["git.fetch"]!({ id: "12", repositoryId: "/repo", type: "git.fetch" });
    await handlers["git.checkout"]!({ branch: "feature", id: "13", repositoryId: "/repo", type: "git.checkout" });
    await handlers["git.clone"]!({ id: "14", targetDirectory: "/target", type: "git.clone", url: "https://example.com/repo.git" });
    await handlers["git.copyHash"]!({ hash: "abc123", id: "15", repositoryId: "/repo", type: "git.copyHash" });
    await handlers["git.cherryPick"]!({ hash: "abc123", id: "16", repositoryId: "/repo", type: "git.cherryPick" });
    await handlers["git.revert"]!({ hash: "abc123", id: "17", repositoryId: "/repo", type: "git.revert" });
    await handlers["git.reset"]!({ hash: "abc123", id: "18", mode: "hard", repositoryId: "/repo", type: "git.reset" });
    await handlers["git.compareCommits"]!({ hashes: ["abc123", "def456"], id: "19", repositoryId: "/repo", type: "git.compareCommits" });
    await handlers["git.squashCommits"]!({ hashes: ["abc123", "def456"], id: "20", repositoryId: "/repo", type: "git.squashCommits" });
    await handlers["git.createBranchFromCommit"]!({ hash: "abc123", id: "21", repositoryId: "/repo", type: "git.createBranchFromCommit" });
    await handlers["git.pushAllCommitsToHere"]!({ hash: "abc123", id: "22", repositoryId: "/repo", type: "git.pushAllCommitsToHere" });
    await handlers["git.editCommitMessage"]!({ hash: "abc123", id: "23", repositoryId: "/repo", type: "git.editCommitMessage" });

    expect(gitCalls).toEqual([
      ["pull", "/repo"],
      ["advancedPull", "/repo"],
      ["continueOperation", "/repo"],
      ["abortOperation", "/repo"],
      ["operationState", "/repo"],
      ["push", "/repo"],
      ["advancedPush", "/repo"],
      ["fetch", "/repo"],
      ["checkout", "/repo", "feature"],
      ["clone", "/target", "https://example.com/repo.git"],
      ["copyHash", "abc123"],
      ["cherryPick", "/repo", "abc123"],
      ["revert", "/repo", "abc123"],
      ["reset", "/repo", "abc123", "hard"],
      ["compareCommits", "/repo", ["abc123", "def456"]],
      ["squashCommits", "/repo", ["abc123", "def456"]],
      ["createBranchFromCommit", "/repo", "abc123"],
      ["pushAllCommitsToHere", "/repo", "abc123"],
      ["editCommitMessage", "/repo", "abc123"]
    ]);
  });
});

function createSettings(mode: "tree" | "list") {
  return {
    autoStashOnPull: "ask",
    blameEnabled: true,
    blameFormat: "${author}, ${time}: ${summary}",
    blameShowOnlyCurrentLine: false,
    fileViewMode: mode,
    language: "auto",
    proxy: {
      enabled: false,
      http: "",
      https: "",
      noProxy: ""
    }
  } as const;
}

function createSettingsService() {
  return {
    getSettings: () => createSettings("tree"),
    resetAutoStashPreference: async () => undefined,
    updateSettings: async () => undefined
  };
}

function createLanguageService() {
  return {
    changeLanguagePreference: async () => ({ message: "language changed", status: "ok" as const }),
    getBundle: () => ({
      locale: "en" as const,
      messages: {}
    })
  };
}

function createProxyService() {
  return {
    configureProxy: async () => ({ message: "proxy configured", status: "ok" as const }),
    refreshProxy: async () => ({ message: "proxy refreshed", status: "ok" as const })
  };
}

function createGitService() {
  return {
    abortOperation: async () => ({ message: "ok", status: "cancelled" as const }),
    advancedPull: async () => ({ message: "ok", status: "ok" as const }),
    advancedPush: async () => ({ message: "ok", status: "ok" as const }),
    cherryPick: async () => ({ message: "ok", status: "ok" as const }),
    checkout: async () => ({ message: "ok", status: "ok" as const }),
    clone: async () => ({ message: "ok", status: "ok" as const }),
    compareCommits: async () => ({ message: "ok", status: "ok" as const }),
    continueOperation: async () => ({ message: "ok", status: "ok" as const }),
    copyHash: async () => ({ message: "ok", status: "ok" as const }),
    createBranchFromCommit: async () => ({ message: "ok", status: "ok" as const }),
    editCommitMessage: async () => ({ message: "ok", status: "ok" as const }),
    fetch: async () => ({ message: "ok", status: "ok" as const }),
    getOperationState: async () => ({ message: "ok", status: "ok" as const }),
    pull: async () => ({ message: "ok", status: "ok" as const }),
    push: async () => ({ message: "ok", status: "ok" as const }),
    pushAllCommitsToHere: async () => ({ message: "ok", status: "ok" as const }),
    reset: async () => ({ message: "ok", status: "ok" as const }),
    revert: async () => ({ message: "ok", status: "ok" as const }),
    squashCommits: async () => ({ message: "ok", status: "ok" as const })
  };
}

function createRemoteService() {
  return {
    addRemote: async () => ({ message: "ok", status: "ok" as const }),
    deleteRemote: async () => ({ message: "ok", status: "ok" as const }),
    listRemotes: async () => remotes,
    updateRemote: async () => ({ message: "ok", status: "ok" as const })
  };
}
