import { describe, expect, it } from "vitest";
import { createRpcRouter } from "../../src/backend/rpc/router";
import type { RpcRequest } from "../../src/backend/rpc/contract";

describe("RPC router", () => {
  it("dispatches a known request to its handler", async () => {
    const request = {
      id: "request-1",
      type: "history.load",
      pageSize: 50
    } satisfies RpcRequest;

    const router = createRpcRouter({
      "history.load": async () => ({
        repositories: [],
        branches: {
          locals: [],
          remotes: []
        },
        commits: [],
        hasMore: false
      })
    });

    await expect(router.dispatch(request)).resolves.toEqual({
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
    });
  });

  it("returns an unknown request error for an unregistered request type", async () => {
    const router = createRpcRouter({});

    await expect(
      router.dispatch({
        id: "request-1",
        type: "history.load",
        pageSize: 50
      })
    ).resolves.toEqual({
      id: "request-1",
      ok: false,
      type: "history.load",
      error: {
        code: "UNKNOWN_REQUEST",
        message: "No backend handler registered for history.load"
      }
    });
  });
});
