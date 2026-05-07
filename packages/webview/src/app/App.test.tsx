/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { RpcClient, RpcRequest, RpcResponse } from "./rpcClient";

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the remote manager from the settings menu", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: "Manage Remotes" }));

    expect(screen.getByRole("dialog", { name: "Remote Manager" })).toBeInTheDocument();
  });

  it("loads history from the backend and requests details for the first commit", async () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 50,
        type: "history.load"
      })
    );

    const historyRequest = rpcClient.post.mock.calls[0]![0];
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: historyRequest.id,
          ok: true,
          type: "history.load",
          payload: {
            branches: {
              locals: [],
              remotes: []
            },
            commits: [
              {
                author: "Ada",
                canEditMessage: true,
                date: "2026-05-07 10:00:00 +0800",
                hash: "abc1234567890abcdef",
                message: "Wire real data",
                parents: [],
                refs: [{ name: "main", type: "local" }],
                shortHash: "abc1234"
              }
            ],
            hasMore: false,
            repositories: [{ id: "/repo", name: "repo", rootPath: "/repo" }]
          }
        } satisfies RpcResponse
      })
    );

    expect(await screen.findByText("Wire real data")).toBeInTheDocument();
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "abc1234567890abcdef",
        repositoryId: "/repo",
        type: "commits.getDetails"
      })
    );

    const detailsRequest = rpcClient.post.mock.calls[1]![0];
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: detailsRequest.id,
          ok: true,
          type: "commits.getDetails",
          payload: {
            commit: {
              author: "Ada",
              body: "Backend details",
              canEditMessage: true,
              date: "2026-05-07 10:00:00 +0800",
              email: "ada@example.com",
              files: [
                {
                  binary: false,
                  deletions: 1,
                  insertions: 3,
                  path: "src/app/App.tsx",
                  status: "modified"
                }
              ],
              hash: "abc1234567890abcdef",
              message: "Wire real data",
              refs: [{ name: "main", type: "local" }]
            }
          }
        } satisfies RpcResponse
      })
    );

    expect(await screen.findByText("Backend details")).toBeInTheDocument();
    expect(screen.getByText("src/app/App.tsx")).toBeInTheDocument();
  });

  it("keeps commit details aligned with the selected commit", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await screen.findByText("Wire real data");

    await user.click(screen.getByText("Second real commit"));

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "def4567890abcdefabc",
        repositoryId: "/repo",
        type: "commits.getDetails"
      })
    );

    dispatchDetailsResponse(rpcClient.post.mock.calls[1]![0].id, {
      body: "First commit details",
      hash: "abc1234567890abcdef",
      message: "Wire real data"
    });
    expect(screen.queryByText("First commit details")).not.toBeInTheDocument();

    dispatchDetailsResponse(rpcClient.post.mock.calls[2]![0].id, {
      body: "Second commit details",
      hash: "def4567890abcdefabc",
      message: "Second real commit"
    });

    expect(await screen.findByText("Second commit details")).toBeInTheDocument();
  });

  it("requests backend graph layout and uses graph node clicks to select commits", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await screen.findByText("Wire real data");

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        hashes: ["abc1234567890abcdef", "def4567890abcdefabc"],
        repositoryId: "/repo",
        type: "graph.getLayout"
      })
    );

    const graphRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "graph.getLayout")![0];
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            id: graphRequest.id,
            ok: true,
            type: "graph.getLayout",
            payload: {
              graph: {
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
                  },
                  {
                    color: "#f56565",
                    column: 0,
                    hash: "def4567890abcdefabc",
                    row: 1
                  }
                ]
              }
            }
          } satisfies RpcResponse
        })
      );
    });

    const graph = screen.getByRole("img", { name: "Git graph" });
    expect(graph.querySelectorAll("circle")).toHaveLength(2);

    await user.click(graph.querySelector('[data-hash="def4567890abcdefabc"]')!);

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "def4567890abcdefabc",
        repositoryId: "/repo",
        type: "commits.getDetails"
      })
    );
  });

  it("toggles the graph strip without dropping commit rows", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await screen.findByText("Wire real data");

    expect(screen.getByRole("img", { name: "Git graph" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide Git Graph" }));

    expect(screen.queryByRole("img", { name: "Git graph" })).not.toBeInTheDocument();
    expect(screen.getByText("Second real commit")).toBeInTheDocument();
  });

  it("opens the compare overlay from the commit context menu", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await screen.findByText("Wire real data");
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getAllByTestId("commit-row")[0]!
    });
    await user.click(screen.getByRole("menuitem", { name: "Compare Selected (2)" }));

    expect(screen.getByRole("region", { name: "Compare Commits" })).toBeInTheDocument();
  });
});

function createTestRpcClient(): RpcClient & { post: ReturnType<typeof vi.fn<(request: RpcRequest) => void>> } {
  return { post: vi.fn<(request: RpcRequest) => void>() };
}

function dispatchHistoryResponse(rpcClient: ReturnType<typeof createTestRpcClient>): void {
  const historyRequest = rpcClient.post.mock.calls[0]![0];
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: historyRequest.id,
          ok: true,
          type: "history.load",
          payload: {
            branches: {
              locals: [],
              remotes: []
            },
            commits: [
              {
                author: "Ada",
                canEditMessage: true,
                date: "2026-05-07 10:00:00 +0800",
                hash: "abc1234567890abcdef",
                message: "Wire real data",
                parents: [],
                refs: [{ name: "main", type: "local" }],
                shortHash: "abc1234"
              },
              {
                author: "Grace",
                canEditMessage: false,
                date: "2026-05-07 09:00:00 +0800",
                hash: "def4567890abcdefabc",
                message: "Second real commit",
                parents: ["abc1234567890abcdef"],
                refs: [],
                shortHash: "def4567"
              }
            ],
            hasMore: false,
            repositories: [{ id: "/repo", name: "repo", rootPath: "/repo" }]
          }
        } satisfies RpcResponse
      })
    );
  });
}

function dispatchDetailsResponse(id: string, commit: { body: string; hash: string; message: string }): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type: "commits.getDetails",
          payload: {
            commit: {
              author: "Ada",
              body: commit.body,
              canEditMessage: true,
              date: "2026-05-07 10:00:00 +0800",
              email: "ada@example.com",
              files: [],
              hash: commit.hash,
              message: commit.message,
              refs: []
            }
          }
        } satisfies RpcResponse
      })
    );
  });
}
