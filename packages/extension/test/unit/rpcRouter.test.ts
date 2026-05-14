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

  it("logs request, response, and backend errors", async () => {
    const events: Array<{ level: string; message: string; context?: unknown }> = [];
    const logger = {
      debug: (message: string, context?: unknown) => events.push({ context, level: "debug", message }),
      error: (message: string, context?: unknown) => events.push({ context, level: "error", message })
    };
    const router = createRpcRouter(
      {
        "history.load": async () => {
          throw new Error("load failed");
        }
      },
      logger
    );

    await router.dispatch({
      id: "request-1",
      pageSize: 50,
      type: "history.load"
    });

    expect(events).toEqual([
      {
        context: { id: "request-1", type: "history.load" },
        level: "debug",
        message: "rpc.request"
      },
      {
        context: { id: "request-1", message: "load failed", type: "history.load" },
        level: "error",
        message: "rpc.error"
      }
    ]);
  });

  it("uses formatted backend error messages when provided", async () => {
    const router = createRpcRouter(
      {
        "settings.update": async () => {
          throw new Error("没有注册配置 guigit.ai.provider，因此无法写入 工作区设置。");
        }
      },
      undefined,
      () => "Failed to save settings. Please reload the extension and try again."
    );

    await expect(
      router.dispatch({
        id: "settings-1",
        settings: {
          fileViewMode: "list"
        },
        type: "settings.update"
      })
    ).resolves.toEqual({
      id: "settings-1",
      ok: false,
      type: "settings.update",
      error: {
        code: "BACKEND_ERROR",
        message: "Failed to save settings. Please reload the extension and try again."
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
