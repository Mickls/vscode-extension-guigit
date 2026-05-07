import { describe, expect, it } from "vitest";
import { createGitHistoryRpcHandlers } from "../../src/backend/rpc/gitHistoryRpcHandlers";
import type {
  BranchesViewModel,
  CommitDetailsViewModel,
  CommitListItemViewModel,
  GraphLayoutViewModel
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
      row: 0
    }
  ]
} satisfies GraphLayoutViewModel;

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
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => ({ id: "/repo", name: "repo", rootPath: "/repo" }),
        switchToActiveEditorRepository: () => ({ id: "/repo", name: "repo", rootPath: "/repo" })
      }
    });

    await expect(handlers["history.load"]!({ id: "1", pageSize: 50, type: "history.load" })).resolves.toEqual({
      branches,
      commits: [commit],
      hasMore: false,
      repositories: [{ id: "/repo", name: "repo", rootPath: "/repo" }]
    });
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
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      }
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
      repositoryService: {
        discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }],
        getCurrentRepository: () => undefined,
        switchToActiveEditorRepository: () => undefined
      }
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
});
