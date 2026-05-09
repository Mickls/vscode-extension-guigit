/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CommitListItemViewModel, GraphNodeViewModel, I18nBundleViewModel } from "./rpcContract.generated";
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

  it("positions the settings menu under the settings button", async () => {
    const user = userEvent.setup();

    render(<App />);
    const settingsButton = screen.getByRole("button", { name: "Settings" });
    settingsButton.getBoundingClientRect = vi.fn(() => ({
      bottom: 36,
      height: 28,
      left: 480,
      right: 540,
      top: 8,
      width: 60,
      x: 480,
      y: 8,
      toJSON: () => undefined
    }));

    await user.click(settingsButton);

    expect(screen.getByRole("menu", { name: "Settings actions" })).toHaveStyle({
      left: "320px",
      top: "40px"
    });
  });

  it("posts settings menu actions to the backend", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    rpcClient.post.mockClear();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: "Reset Auto Stash Preference" }));
    expect(latestRequest(rpcClient, "settings.resetAutoStash")).toEqual(expect.objectContaining({
      type: "settings.resetAutoStash"
    }));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: "Configure Proxy" }));
    expect(latestRequest(rpcClient, "proxy.configure")).toEqual(expect.objectContaining({
      type: "proxy.configure"
    }));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: "Refresh Proxy" }));
    expect(latestRequest(rpcClient, "proxy.refresh")).toEqual(expect.objectContaining({
      type: "proxy.refresh"
    }));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: "Change Language" }));
    expect(latestRequest(rpcClient, "settings.changeLanguage")).toEqual(expect.objectContaining({
      type: "settings.changeLanguage"
    }));
  });

  it("refreshes webview labels from settings bootstrap without reloading history", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    const settingsRequest = latestRequest(rpcClient, "settings.get");
    dispatchSettingsResponse(settingsRequest.id, "tree", "settings.get", {
      locale: "zh",
      messages: {
        remoteManager: {
          title: "管理远程"
        },
        settingsMenu: {
          changeLanguage: "切换语言",
          manageRemotes: "管理远程"
        }
      }
    });
    const historyLoadCount = rpcClient.post.mock.calls.filter(([request]) => request.type === "history.load").length;

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("menuitem", { name: "切换语言" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "管理远程" }));

    expect(screen.getByRole("dialog", { name: "管理远程" })).toBeInTheDocument();
    expect(rpcClient.post.mock.calls.filter(([request]) => request.type === "history.load")).toHaveLength(historyLoadCount);
  });

  it("localizes the main webview surfaces from the settings bundle", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    const settingsRequest = latestRequest(rpcClient, "settings.get");
    dispatchSettingsResponse(settingsRequest.id, "tree", "settings.get", {
      locale: "zh",
      messages: {
        authorFilterPlaceholder: "输入作者",
        compare: {
          baseCommit: "基础提交",
          changedFiles: "变更文件",
          close: "关闭比较",
          from: "从",
          openDiff: "打开 {0} 的比较差异",
          targetCommit: "目标提交",
          title: "比较提交",
          to: "到"
        },
        contextMenu: {
          cherryPick: "拣选",
          compareSelected: "比较选中",
          compareSelectedCount: "比较选中 ({0})",
          copyHash: "复制哈希",
          createBranch: "创建分支",
          editCommitMessage: "编辑提交消息",
          menuLabel: "提交操作",
          pushToCommit: "推送到此提交",
          resetHard: "硬重置",
          resetMixed: "混合重置",
          resetSoft: "软重置",
          revert: "回滚",
          squashCommits: "压缩提交",
          squashCommitsCount: "压缩 {0} 个提交"
        },
        files: {
          binary: "二进制",
          changed: "文件变更",
          collapseDirectory: "折叠 {0}",
          expandDirectory: "展开 {0}",
          list: "列表",
          listView: "列表视图",
          openDiff: "打开 {0} 的差异",
          openFile: "打开文件 {0}",
          openFileHistory: "打开 {0} 的文件历史",
          tree: "树",
          treeView: "树视图"
        },
        gitOperations: {
          fetch: "抓取",
          pull: "拉取",
          push: "推送",
          settings: "设置"
        },
        graph: {
          hide: "隐藏 Git 图谱",
          label: "Git 图谱",
          selectCommit: "在图谱中选择提交 {0}",
          show: "显示 Git 图谱",
          toggle: "图谱"
        },
        headers: {
          author: "作者",
          date: "日期",
          hash: "哈希",
          message: "消息",
          refs: "引用"
        },
        placeholderCommitMessage: "搜索提交",
        refreshTooltip: "刷新",
        selectCommit: "选择一个提交以查看详情",
        status: {
          running: "{0} 正在执行..."
        }
      }
    });

    expect(screen.getByRole("button", { name: "拉取" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "推送" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "抓取" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "隐藏 Git 图谱" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索提交")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入作者")).toBeInTheDocument();
    expect(screen.getByText("哈希")).toBeInTheDocument();
    expect(screen.getByText("消息")).toBeInTheDocument();
    expect(screen.getByText("引用")).toBeInTheDocument();
    expect(screen.getByText("作者")).toBeInTheDocument();
    expect(screen.getByText("日期")).toBeInTheDocument();
    expect(screen.getByText("选择一个提交以查看详情")).toBeInTheDocument();

    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    const detailsRequest = latestRequest(rpcClient, "commits.getDetails");
    dispatchDetailsResponse(detailsRequest.id, {
      body: "Backend details",
      files: [
        {
          binary: true,
          deletions: 0,
          insertions: 0,
          path: "assets/logo.png",
          status: "added"
        }
      ],
      hash: "abc1234567890abcdef",
      message: "Wire real data"
    });

    expect(await screen.findByText("文件变更 (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "树视图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "列表视图" })).toBeInTheDocument();
    expect(screen.getByText("二进制")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "折叠 assets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 assets/logo.png 的差异" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开文件 assets/logo.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 assets/logo.png 的文件历史" })).toBeInTheDocument();

    const commitRows = screen.getAllByTestId("commit-row");
    fireEvent.click(commitRows[1]!, { metaKey: true });
    await openContextMenu(user, commitRows[1]!);
    expect(screen.getByRole("menu", { name: "提交操作" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "复制哈希" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "比较选中 (2)" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "压缩 2 个提交" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "比较选中 (2)" }));
    const compareRequest = latestRequest(rpcClient, "git.compareCommits");
    dispatchCompareResponse(compareRequest.id);

    expect(screen.getByRole("region", { name: "比较提交" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭比较" })).toBeInTheDocument();
    expect(screen.getByText("从: abc1234")).toBeInTheDocument();
    expect(screen.getByText("基础提交")).toBeInTheDocument();
    expect(screen.getByText("到: def4567")).toBeInTheDocument();
    expect(screen.getByText("目标提交")).toBeInTheDocument();
    expect(screen.getByText("变更文件 (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 src/shared.ts 的比较差异" })).toBeInTheDocument();
  });

  it("loads and updates remotes through the remote manager", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    rpcClient.post.mockClear();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitem", { name: "Manage Remotes" }));
    const listRequest = latestRequest(rpcClient, "remotes.list");
    expect(listRequest).toEqual(expect.objectContaining({ repositoryId: "/repo", type: "remotes.list" }));
    dispatchRemoteListResponse(listRequest.id);

    expect(screen.getByDisplayValue("https://example.com/repo.git")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Remote name"), "upstream");
    await user.type(screen.getByPlaceholderText("Remote URL (https://... or git@...)"), "https://example.com/up.git");
    await user.click(screen.getByRole("button", { name: "Add Remote" }));
    const addRequest = latestRequest(rpcClient, "remotes.add");
    expect(addRequest).toEqual(expect.objectContaining({
      name: "upstream",
      repositoryId: "/repo",
      type: "remotes.add",
      url: "https://example.com/up.git"
    }));
    dispatchRemoteOperationResponse(addRequest.id, "remotes.add", "Added remote upstream");
    expect(screen.getByRole("status")).toHaveTextContent("Added remote upstream");
    expect(rpcClient.post).toHaveBeenCalledWith(expect.objectContaining({ repositoryId: "/repo", type: "remotes.list" }));

    const remoteUrl = screen.getByLabelText("origin URL");
    await user.clear(remoteUrl);
    await user.type(remoteUrl, "https://example.com/new.git");
    await user.click(screen.getByRole("button", { name: "Save origin" }));
    expect(latestRequest(rpcClient, "remotes.update")).toEqual(expect.objectContaining({
      name: "origin",
      repositoryId: "/repo",
      type: "remotes.update",
      url: "https://example.com/new.git"
    }));

    await user.click(screen.getByRole("button", { name: "Delete origin" }));
    expect(latestRequest(rpcClient, "remotes.delete")).toEqual(expect.objectContaining({
      name: "origin",
      repositoryId: "/repo",
      type: "remotes.delete"
    }));
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
    expect(screen.getByText("New top commit")).toBeInTheDocument();
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

  it("sends changed file open and history intents from commit details", async () => {
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

    await user.click(await screen.findByRole("button", { name: "Open file src/app/App.tsx" }));
    await user.click(screen.getByRole("button", { name: "Open file history for src/app/App.tsx" }));

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "src/app/App.tsx",
        repositoryId: "/repo",
        type: "files.openWorkingFile"
      })
    );
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "src/app/App.tsx",
        repositoryId: "/repo",
        type: "files.openHistory"
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

  it("posts toolbar git operations, shows status notifications, and reloads history after they complete", async () => {
    const rpcClient = createTestRpcClient();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    fireEvent.click(screen.getByText("Second real commit"));
    rpcClient.post.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    const pullRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.pull")![0];
    expect(pullRequest).toEqual(expect.objectContaining({ repositoryId: "/repo", type: "git.pull" }));
    expect(screen.getByRole("status")).toHaveTextContent("Pull is running...");
    expect(screen.getByRole("button", { name: "Pull" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Push" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    expect(rpcClient.post.mock.calls.filter(([request]) => request.type === "git.pull")).toHaveLength(1);

    dispatchOperationResponse(pullRequest.id, "git.pull");
    expect(screen.getByRole("status")).toHaveTextContent("Git operation completed");
    expect(screen.getByRole("button", { name: "Pull" })).not.toBeDisabled();

    const pullReloadRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "history.load" && request.repositoryId === "/repo"
    )![0];
    dispatchHistoryResponse(rpcClient, { requestId: pullReloadRequest.id });
    expect(screen.getAllByText("Second real commit").length).toBeGreaterThan(0);

    rpcClient.post.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Push" }));
    const pushRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.push")![0];
    expect(pushRequest).toEqual(expect.objectContaining({ repositoryId: "/repo", type: "git.push" }));
    dispatchOperationResponse(pushRequest.id, "git.push");

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "/repo",
        type: "history.load"
      })
    );

    rpcClient.post.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    const fetchRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.fetch")![0];
    expect(fetchRequest).toEqual(expect.objectContaining({ repositoryId: "/repo", type: "git.fetch" }));
    dispatchOperationResponse(fetchRequest.id, "git.fetch");

    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "/repo",
        type: "history.load"
      })
    );

    const closeNotification = setTimeoutSpy.mock.calls.at(-1)?.[0];
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 3500);
    act(() => {
      closeNotification?.();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    setTimeoutSpy.mockRestore();
  });

  it("shows conflict actions and posts explicit continue or abort intents", async () => {
    const rpcClient = createTestRpcClient();
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    rpcClient.post.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    const pullRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.pull")![0];
    dispatchOperationResponse(pullRequest.id, "git.pull", {
      message: "Pull has conflicts. Resolve all conflicted files, stage them, then continue from GUI Git History.",
      status: "conflict"
    });

    expect(screen.getByRole("status")).toHaveTextContent("Pull has conflicts");
    expect(screen.getByRole("button", { name: "Pull" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resolved and Staged" })).not.toBeDisabled();
    expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 2500);

    const pollOperationState = setIntervalSpy.mock.calls.at(-1)?.[0];
    act(() => {
      pollOperationState?.();
    });
    const stateRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.operationState")![0];
    expect(stateRequest).toEqual(expect.objectContaining({ repositoryId: "/repo", type: "git.operationState" }));

    fireEvent.click(screen.getByRole("button", { name: "Resolved and Staged" }));
    const continueRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.continueOperation")![0];
    expect(continueRequest).toEqual(expect.objectContaining({ repositoryId: "/repo", type: "git.continueOperation" }));
    dispatchOperationResponse(continueRequest.id, "git.continueOperation", {
      message: "Pull conflicts resolved",
      status: "ok"
    });
    expect(screen.queryByRole("button", { name: "Resolved and Staged" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    const secondPullRequest = rpcClient.post.mock.calls.filter(([request]) => request.type === "git.pull").at(-1)![0];
    dispatchOperationResponse(secondPullRequest.id, "git.pull", {
      message: "Pull has conflicts. Resolve all conflicted files, stage them, then continue from GUI Git History.",
      status: "conflict"
    });

    fireEvent.click(screen.getByRole("button", { name: "Abort" }));
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "/repo",
        type: "git.abortOperation"
      })
    );
    setIntervalSpy.mockRestore();
  });

  it("runs advanced pull and push when pull or push is command-clicked", async () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    rpcClient.post.mockClear();

    expect(screen.queryByRole("button", { name: "Advanced Pull" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Advanced Push" })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Pull" }), { metaKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    const advancedPullRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.advancedPull")![0];
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "/repo",
        type: "git.advancedPull"
      })
    );
    expect(rpcClient.post.mock.calls.some(([request]) => request.type === "git.pull")).toBe(false);
    dispatchOperationResponse(advancedPullRequest.id, "git.advancedPull");

    rpcClient.post.mockClear();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Push" }), { metaKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Push" }));
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "/repo",
        type: "git.advancedPush"
      })
    );
    expect(rpcClient.post.mock.calls.some(([request]) => request.type === "git.push")).toBe(false);
  });

  it("keeps control-click on pull and push as normal toolbar clicks", async () => {
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    rpcClient.post.mockClear();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Pull" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "/repo",
        type: "git.pull"
      })
    );
    expect(rpcClient.post.mock.calls.some(([request]) => request.type === "git.advancedPull")).toBe(false);

    const pullRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "git.pull")![0];
    dispatchOperationResponse(pullRequest.id, "git.pull");

    rpcClient.post.mockClear();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Push" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Push" }));
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "/repo",
        type: "git.push"
      })
    );
    expect(rpcClient.post.mock.calls.some(([request]) => request.type === "git.advancedPush")).toBe(false);
  });

  it("loads history context and selects a commit requested by the backend", () => {
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

    const firstRevealRequest = rpcClient.post.mock.calls.find(([request]) => request.type === "history.load")![0] as Extract<
      RpcRequest,
      { type: "history.load" }
    >;
    expect(firstRevealRequest.search).toBeUndefined();

    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "first11111111111111", message: "First visible commit" })],
      hasMore: true,
      nextCursor: "50",
      requestId: firstRevealRequest.id
    });

    const nextRevealRequest = rpcClient.post.mock.calls.find(
      ([request]) => request.type === "history.load" && request.cursor === "50"
    )![0];
    dispatchHistoryResponse(rpcClient, {
      commits: [createCommit({ hash: "abc1234ffffffffffff", message: "Revealed commit" })],
      requestId: nextRevealRequest.id
    });

    expect(screen.getByText("First visible commit")).toBeInTheDocument();
    expect(screen.getAllByText("Revealed commit").length).toBeGreaterThan(0);
    expect(rpcClient.post).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "abc1234ffffffffffff",
        repositoryId: "/repo",
        type: "commits.getDetails"
      })
    );
  });

  it("opens the compare overlay from the commit context menu", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    const rows = screen.getAllByTestId("commit-row");
    fireEvent.click(rows[1]!, { metaKey: true });
    await user.pointer({
      keys: "[MouseRight]",
      target: rows[1]!
    });
    await user.click(screen.getByRole("menuitem", { name: "Compare Selected (2)" }));
    const compareRequest = latestRequest(rpcClient, "git.compareCommits");
    dispatchCompareResponse(compareRequest.id);

    expect(screen.getByRole("region", { name: "Compare Commits" })).toBeInTheDocument();
    expect(screen.getByText("src/shared.ts")).toBeInTheDocument();
  });

  it("closes the commit context menu when clicking outside it", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();

    await openContextMenu(user, screen.getAllByTestId("commit-row")[1]!);
    expect(screen.getByRole("menu", { name: "Commit actions" })).toBeInTheDocument();

    await user.click(screen.getByRole("main"));

    expect(screen.queryByRole("menu", { name: "Commit actions" })).not.toBeInTheDocument();
  });

  it("posts commit context menu operations for the right-clicked commit and selected pair", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    rpcClient.post.mockClear();

    const commitRows = screen.getAllByTestId("commit-row");
    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Copy Hash" }));
    const copyRequest = latestRequest(rpcClient, "git.copyHash");
    expect(copyRequest).toEqual(expect.objectContaining({
      hash: "def4567890abcdefabc",
      repositoryId: "/repo",
      type: "git.copyHash"
    }));
    dispatchOperationResponse(copyRequest.id, "git.copyHash");

    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Cherry Pick" }));
    const cherryPickRequest = latestRequest(rpcClient, "git.cherryPick");
    expect(cherryPickRequest).toEqual(expect.objectContaining({
      hash: "def4567890abcdefabc",
      repositoryId: "/repo",
      type: "git.cherryPick"
    }));
    dispatchOperationResponse(cherryPickRequest.id, "git.cherryPick");

    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Revert" }));
    const revertRequest = latestRequest(rpcClient, "git.revert");
    expect(revertRequest).toEqual(expect.objectContaining({
      hash: "def4567890abcdefabc",
      repositoryId: "/repo",
      type: "git.revert"
    }));
    dispatchOperationResponse(revertRequest.id, "git.revert");

    await user.click(commitRows[0]!);
    fireEvent.click(commitRows[1]!, { metaKey: true });
    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Compare Selected (2)" }));
    const compareRequest = latestRequest(rpcClient, "git.compareCommits");
    expect(compareRequest).toEqual(expect.objectContaining({
      hashes: ["abc1234567890abcdef", "def4567890abcdefabc"],
      repositoryId: "/repo",
      type: "git.compareCommits"
    }));
    expect(screen.getByRole("region", { name: "Compare Commits" })).toBeInTheDocument();
    dispatchCompareResponse(compareRequest.id);
    expect(screen.getByText("src/shared.ts")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close compare" }));

    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Squash 2 Commits" }));
    const squashRequest = latestRequest(rpcClient, "git.squashCommits");
    expect(squashRequest).toEqual(expect.objectContaining({
      hashes: ["abc1234567890abcdef", "def4567890abcdefabc"],
      repositoryId: "/repo",
      type: "git.squashCommits"
    }));
    dispatchOperationResponse(squashRequest.id, "git.squashCommits");

    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Create Branch" }));
    const branchRequest = latestRequest(rpcClient, "git.createBranchFromCommit");
    expect(branchRequest).toEqual(expect.objectContaining({
      hash: "def4567890abcdefabc",
      repositoryId: "/repo",
      type: "git.createBranchFromCommit"
    }));
    dispatchOperationResponse(branchRequest.id, "git.createBranchFromCommit");

    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Push All Commits to Here" }));
    const pushToCommitRequest = latestRequest(rpcClient, "git.pushAllCommitsToHere");
    expect(pushToCommitRequest).toEqual(expect.objectContaining({
      hash: "def4567890abcdefabc",
      repositoryId: "/repo",
      type: "git.pushAllCommitsToHere"
    }));
    dispatchOperationResponse(pushToCommitRequest.id, "git.pushAllCommitsToHere");

    await openContextMenu(user, commitRows[1]!);
    await user.click(screen.getByRole("menuitem", { name: "Reset Hard" }));
    const resetRequest = latestRequest(rpcClient, "git.reset");
    expect(resetRequest).toEqual(expect.objectContaining({
      hash: "def4567890abcdefabc",
      mode: "hard",
      repositoryId: "/repo",
      type: "git.reset"
    }));
    dispatchOperationResponse(resetRequest.id, "git.reset");
  });

  it("posts edit commit message only for editable commits", async () => {
    const user = userEvent.setup();
    const rpcClient = createTestRpcClient();

    render(<App rpcClient={rpcClient} />);
    dispatchHistoryResponse(rpcClient);
    await waitForCommitRows();
    rpcClient.post.mockClear();

    const commitRows = screen.getAllByTestId("commit-row");
    await openContextMenu(user, commitRows[1]!);
    expect(screen.getByRole("menuitem", { name: "Edit Commit Message" })).toHaveAttribute("aria-disabled", "true");

    await openContextMenu(user, commitRows[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Edit Commit Message" }));
    const editRequest = latestRequest(rpcClient, "git.editCommitMessage");
    expect(editRequest).toEqual(expect.objectContaining({
      hash: "abc1234567890abcdef",
      repositoryId: "/repo",
      type: "git.editCommitMessage"
    }));
  });
});

function createTestRpcClient(): RpcClient & { post: ReturnType<typeof vi.fn<(request: RpcRequest) => void>> } {
  return { post: vi.fn<(request: RpcRequest) => void>() };
}

async function waitForCommitRows(): Promise<void> {
  await screen.findAllByTestId("commit-row");
}

async function openContextMenu(user: ReturnType<typeof userEvent.setup>, target: HTMLElement): Promise<void> {
  await user.pointer({
    keys: "[MouseRight]",
    target
  });
}

function latestRequest<TType extends RpcRequest["type"]>(
  rpcClient: ReturnType<typeof createTestRpcClient>,
  type: TType
): Extract<RpcRequest, { type: TType }> {
  for (let index = rpcClient.post.mock.calls.length - 1; index >= 0; index -= 1) {
    const request = rpcClient.post.mock.calls[index]![0];
    if (request.type === type) {
      return request as Extract<RpcRequest, { type: TType }>;
    }
  }

  throw new Error(`Missing ${type} request`);
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
                parents: ["def4567890abcdefabc"],
                refs: [{ name: "main", type: "local" }],
                shortHash: "abc1234"
              },
              {
                author: "Grace",
                canEditMessage: false,
                date: "2026-05-07 09:00:00 +0800",
                hash: "def4567890abcdefabc",
                message: "Second real commit",
                parents: [],
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

function dispatchSettingsResponse(
  id: string,
  fileViewMode: "tree" | "list",
  type: "settings.get" | "settings.update" = "settings.get",
  i18n: I18nBundleViewModel = {
    locale: "en",
    messages: {}
  }
): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type,
          payload: {
            i18n,
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

function dispatchRemoteListResponse(id: string): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type: "remotes.list",
          payload: {
            remotes: [
              {
                fetchUrl: "https://example.com/repo.git",
                name: "origin",
                pushUrl: "https://example.com/repo.git"
              }
            ]
          }
        } satisfies RpcResponse
      })
    );
  });
}

function dispatchRemoteOperationResponse(
  id: string,
  type: "remotes.add" | "remotes.delete" | "remotes.update",
  message: string
): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type,
          payload: {
            message,
            status: "ok"
          }
        } satisfies RpcResponse
      })
    );
  });
}

function dispatchOperationResponse(
  id: string,
  type:
    | "git.abortOperation"
    | "git.advancedPull"
    | "git.advancedPush"
    | "git.cherryPick"
    | "git.copyHash"
    | "git.createBranchFromCommit"
    | "git.editCommitMessage"
    | "git.continueOperation"
    | "git.fetch"
    | "git.operationState"
    | "git.pull"
    | "git.push"
    | "git.pushAllCommitsToHere"
    | "git.reset"
    | "git.revert"
    | "git.squashCommits",
  result: { message: string; status: "cancelled" | "conflict" | "ok" } = {
    message: "Git operation completed",
    status: "ok"
  }
): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type,
          payload: result
        } satisfies RpcResponse
      })
    );
  });
}

function dispatchCompareResponse(id: string): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id,
          ok: true,
          type: "git.compareCommits",
          payload: {
            files: [
              {
                binary: false,
                deletions: 1,
                insertions: 2,
                path: "src/shared.ts",
                status: "modified"
              }
            ],
            result: {
              message: "Compared commits",
              status: "ok"
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
