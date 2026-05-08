/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CommitListItemViewModel, GraphNodeViewModel } from "./rpcContract.generated";
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

    await waitForCommitRows();
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
    await waitForCommitRows();

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

  it("shows selected commit summary while full details are loading", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();

    await user.click(screen.getByText("Second real commit"));

    expect(screen.queryByText("Select a commit to view details.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Second real commit")).toHaveLength(2);
    expect(screen.getByText("Grace - 2026-05-07 09:00:00 +0800")).toBeInTheDocument();
  });

  it("preserves the selected commit when history reloads with that commit still present", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();

    await user.click(screen.getByText("Second real commit"));
    const detailsRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "commits.getDetails" && request.hash === "def4567890abcdefabc"
    )![0];
    dispatchDetailsResponse(detailsRequest.id, {
      body: "Second commit details",
      hash: "def4567890abcdefabc",
      message: "Second real commit"
    });
    expect(await screen.findByText("Second commit details")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            reason: "watcher",
            type: "history.changed"
          }
        })
      );
    });
    const reloadRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "history.load" && request.repositoryId === "/repo"
    )![0];
    dispatchHistoryResponse(rpcClient, {
      requestId: reloadRequest.id
    });

    expect(screen.getByText("Second commit details")).toBeInTheDocument();
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "def4567890abcdefabc",
        repositoryId: "/repo",
        type: "commits.getDetails"
      })
    );
  });

  it("keeps selected commit details and probes the selected hash when watcher reload misses it", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();

    await user.click(screen.getByText("Second real commit"));
    const detailsRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "commits.getDetails" && request.hash === "def4567890abcdefabc"
    )![0];
    dispatchDetailsResponse(detailsRequest.id, {
      body: "Second commit details",
      hash: "def4567890abcdefabc",
      message: "Second real commit"
    });
    expect(await screen.findByText("Second commit details")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            reason: "watcher",
            type: "history.changed"
          }
        })
      );
    });
    const reloadRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "history.load" && request.repositoryId === "/repo"
    )![0];
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "new1234567890abcdef", message: "New top commit" })],
      requestId: reloadRequest.id
    });

    expect(screen.getByText("Second commit details")).toBeInTheDocument();
    expect(screen.queryByText("New top commit")).not.toBeInTheDocument();
    expect(screen.getAllByText("Second real commit").length).toBeGreaterThan(0);
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 50,
        repositoryId: "/repo",
        search: "def4567890abcdefabc",
        type: "history.load"
      })
    );
  });

  it("sends commit file diff intents from commit details", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    dispatchDetailsResponse(rpcClient.post.mock.calls[1]![0].id, {
      body: "First commit details",
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
      message: "Wire real data"
    });

    await user.click(await screen.findByRole("button", { name: "Open diff for src/app/App.tsx" }));

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "src/app/App.tsx",
        hash: "abc1234567890abcdef",
        repositoryId: "/repo",
        type: "diff.openCommitFile"
      })
    );
  });

  it("uses backend file view mode settings and sends update intents from changed files", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "settings.get"
      })
    );

    const settingsRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "settings.get")![0];
    dispatchSettingsResponse(settingsRequest.id, "tree");
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();

    const detailsRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "commits.getDetails")![0];
    dispatchDetailsResponse(detailsRequest.id, {
      body: "First commit details",
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
      message: "Wire real data"
    });

    expect(await screen.findByText("App.tsx")).toBeInTheDocument();
    expect(screen.queryByText("src/app/App.tsx")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "List view" }));

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { fileViewMode: "list" },
        type: "settings.update"
      })
    );

    const updateRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "settings.update")![0];
    dispatchSettingsResponse(updateRequest.id, "list", "settings.update");

    expect(screen.getByText("src/app/App.tsx")).toBeInTheDocument();
  });

  it("requests backend graph layout and uses graph node clicks to select commits", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();

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
                    row: 0,
                    x: 8,
                    y: 18
                  },
                  {
                    color: "#f56565",
                    column: 0,
                    hash: "def4567890abcdefabc",
                    row: 1,
                    x: 8,
                    y: 54
                  }
                ],
                width: 120
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

  it("ignores stale graph responses after newer history pages request a new layout", async () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "abc1234567890abcdef", message: "First page commit" })],
      hasMore: true,
      nextCursor: "1"
    });
    await waitForCommitRows();

    const firstGraphRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "graph.getLayout")![0];
    const scrollContainer = screen.getByTestId("commit-scroll-container");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100 }
    });
    fireEvent.scroll(scrollContainer);

    const nextPageRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "history.load" && request.cursor === "1"
    )![0];
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "def4567890abcdefabc", message: "Second page commit" })],
      hasMore: false,
      requestId: nextPageRequest.id
    });

    const graphRequests = rpcClient.post.mock.calls.filter(([request]) => request.type === "graph.getLayout");
    const latestGraphRequest = graphRequests.at(-1)![0];

    dispatchGraphResponse(firstGraphRequest.id, [
      {
        color: "#f56565",
        column: 0,
        hash: "abc1234567890abcdef",
        row: 2,
        x: 8,
        y: 90
      }
    ]);
    dispatchGraphResponse(latestGraphRequest.id, [
      {
        color: "#f56565",
        column: 0,
        hash: "abc1234567890abcdef",
        row: 0,
        x: 8,
        y: 18
      },
      {
        color: "#4299e1",
        column: 1,
        hash: "def4567890abcdefabc",
        row: 1,
        x: 18,
        y: 54
      }
    ]);

    const graph = screen.getByRole("img", { name: "Git graph" });
    expect(graph.querySelector('[data-hash="abc1234567890abcdef"] circle')).toHaveAttribute("cy", "18");
    expect(graph.querySelectorAll("circle")).toHaveLength(2);
  });

  it("keeps the current graph visible while a newer history page is waiting for layout", async () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "abc1234567890abcdef", message: "First page commit" })],
      hasMore: true,
      nextCursor: "1"
    });
    await waitForCommitRows();

    const firstGraphRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "graph.getLayout")![0];
    dispatchGraphResponse(firstGraphRequest.id, [
      {
        color: "#f56565",
        column: 0,
        hash: "abc1234567890abcdef",
        row: 0,
        x: 8,
        y: 18
      }
    ]);
    expect(screen.getByRole("img", { name: "Git graph" }).querySelectorAll("circle")).toHaveLength(1);

    const scrollContainer = screen.getByTestId("commit-scroll-container");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100 }
    });
    fireEvent.scroll(scrollContainer);
    const nextPageRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "history.load" && request.cursor === "1"
    )![0];
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "def4567890abcdefabc", message: "Second page commit" })],
      hasMore: false,
      requestId: nextPageRequest.id
    });

    expect(screen.getByRole("img", { name: "Git graph" }).querySelectorAll("circle")).toHaveLength(1);
  });

  it("toggles the graph strip without dropping commit rows", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();

    expect(screen.getByRole("img", { name: "Git graph" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide Git Graph" }));

    expect(screen.queryByRole("img", { name: "Git graph" })).not.toBeInTheDocument();
    expect(screen.getByText("Second real commit")).toBeInTheDocument();
  });

  it("loads the next commit page when the commit list scroll reaches the bottom", async () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "abc1234567890abcdef", message: "First page commit" })],
      hasMore: true,
      nextCursor: "1"
    });
    await waitForCommitRows();

    const scrollContainer = screen.getByTestId("commit-scroll-container");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100 }
    });
    fireEvent.scroll(scrollContainer);

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: "1",
        pageSize: 50,
        repositoryId: "/repo",
        type: "history.load"
      })
    );

    const nextPageRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "history.load" && request.cursor === "1"
    )![0];
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "def4567890abcdefabc", message: "Second page commit" })],
      hasMore: false,
      requestId: nextPageRequest.id
    });

    expect(await screen.findByText("Second page commit")).toBeInTheDocument();
    expect(screen.getAllByText("First page commit").length).toBeGreaterThan(0);
  });

  it("keeps the app shell viewport-bound so panels scroll without hiding the header", () => {
    render(<App />);

    expect(screen.getByRole("main")).toHaveClass("h-screen", "overflow-hidden");
  });

  it("reloads history when the backend reports repository history changes", () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    rpcClient.post.mockClear();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            reason: "watcher",
            type: "history.changed"
          }
        })
      );
    });

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 50,
        type: "history.load"
      })
    );
  });

  it("loads and selects a commit requested by the backend", () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    rpcClient.post.mockClear();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            hash: "abc1234",
            type: "history.revealCommit"
          }
        })
      );
    });

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 50,
        search: "abc1234",
        type: "history.load"
      })
    );
  });

  it("opens the compare overlay from the commit context menu", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
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

async function waitForCommitRows(): Promise<void> {
  await screen.findAllByTestId("commit-row");
}

interface HistoryResponseOptions {
  commits?: readonly ReturnType<typeof createCommit>[];
  hasMore?: boolean;
  nextCursor?: string;
  requestId?: string;
}

function dispatchHistoryResponse(
  rpcClient: ReturnType<typeof createTestRpcClient>,
  options: HistoryResponseOptions = {}
): void {
  const historyRequest = rpcClient.post.mock.calls[0]![0];
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: options.requestId ?? historyRequest.id,
          ok: true,
          type: "history.load",
          payload: {
            branches: {
              locals: [],
              remotes: []
            },
            commits: options.commits ?? [
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
            hasMore: options.hasMore ?? false,
            nextCursor: options.nextCursor,
            repositories: [{ id: "/repo", name: "repo", rootPath: "/repo" }]
          }
        } satisfies RpcResponse
      })
    );
  });
}

function createCommit(input: {
  hash: string;
  message: string;
  parents?: readonly string[];
}): CommitListItemViewModel {
  return {
    author: "Ada",
    canEditMessage: true,
    date: "2026-05-07 10:00:00 +0800",
    hash: input.hash,
    message: input.message,
    parents: input.parents ?? [],
    refs: [],
    shortHash: input.hash.slice(0, 7)
  };
}

function dispatchDetailsResponse(
  id: string,
  commit: {
    body: string;
    files?: readonly {
      binary: boolean;
      deletions: number;
      insertions: number;
      path: string;
      status: "added" | "deleted" | "modified" | "renamed" | "copied" | "unchanged";
    }[];
    hash: string;
    message: string;
  }
): void {
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
              files: commit.files ?? [],
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

function dispatchSettingsResponse(id: string, fileViewMode: "tree" | "list", type: "settings.get" | "settings.update" = "settings.get"): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type,
          payload: {
            settings: {
              autoStashOnPull: "ask",
              blameEnabled: true,
              blameFormat: "${author}, ${time}: ${summary}",
              blameShowOnlyCurrentLine: false,
              fileViewMode,
              language: "auto",
              proxy: {
                enabled: false,
                http: "",
                https: "",
                noProxy: ""
              }
            }
          }
        } satisfies RpcResponse
      })
    );
  });
}

function dispatchGraphResponse(id: string, nodes: readonly GraphNodeViewModel[]): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type: "graph.getLayout",
          payload: {
            graph: {
              edges: [],
              nodes,
              width: 120
            }
          }
        } satisfies RpcResponse
      })
    );
  });
}
