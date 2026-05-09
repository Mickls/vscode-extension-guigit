import { describe, expect, it } from "vitest";
import {
  allRpcRequestTypes,
  backendRpcHandlerTypes,
  type BranchesViewModel,
  type RpcRequest,
  type RpcResponse
} from "../../src/rpc/contract";

const requiredRequestTypes = [
  "history.load",
  "branches.list",
  "commits.getDetails",
  "files.getChanges",
  "files.openWorkingFile",
  "files.openHistory",
  "graph.getLayout",
  "remotes.list",
  "settings.get",
  "git.pull"
] as const satisfies readonly RpcRequest["type"][];

const changesWorkflowRequestTypes = [
  "workingTree.load",
  "workingTree.stageFile",
  "workingTree.stageAll",
  "workingTree.unstageFile",
  "workingTree.unstageAll",
  "workingTree.discardFile",
  "workingTree.openFile",
  "workingTree.openDiff",
  "workingTree.commit",
  "stash.list",
  "stash.getDetails",
  "stash.openDiff",
  "stash.apply",
  "stash.pop",
  "stash.drop",
  "commitMessage.generate",
  "settings.configureAiProvider",
  "settings.testAiProvider"
] as const satisfies readonly RpcRequest["type"][];

describe("RPC contract", () => {
  it("covers the migration request areas", () => {
    expect(allRpcRequestTypes).toEqual(expect.arrayContaining(requiredRequestTypes));
  });

  it("covers working tree, stash, and commit message request areas", () => {
    expect(allRpcRequestTypes).toEqual(expect.arrayContaining(changesWorkflowRequestTypes));
  });

  it("has a backend handler marker for every request type", () => {
    expect([...backendRpcHandlerTypes].sort()).toEqual([...allRpcRequestTypes].sort());
  });

  it("supports success and error response envelopes", () => {
    const success = {
      id: "request-1",
      ok: true,
      type: "history.load",
      payload: {
        repositories: [],
        branches: {
          locals: [],
          remotes: []
        },
        commits: [],
        hasMore: false
      }
    } satisfies RpcResponse;

    const error = {
      id: "request-1",
      ok: false,
      type: "history.load",
      error: {
        code: "UNKNOWN_REQUEST",
        message: "Unknown request type"
      }
    } satisfies RpcResponse;

    expect(success.ok).toBe(true);
    expect(error.ok).toBe(false);
  });

  it("represents branches as local branches and remote groups", () => {
    const branches = {
      locals: [{ current: true, name: "main" }],
      remotes: [
        {
          branches: [{ current: false, name: "origin/main", remote: "origin" }],
          remote: "origin"
        }
      ]
    } satisfies BranchesViewModel;

    expect(branches.remotes[0]!.remote).toBe("origin");
  });
});
