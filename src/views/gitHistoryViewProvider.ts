import * as vscode from "vscode";
import { GitHistoryProvider } from "../providers/git/gitHistoryProvider";
import { GitCommit } from "../providers/git/types/gitTypes";
import * as path from "path";

/**
 * Git历史视图提供者，负责管理Git历史的WebView界面
 */
export class GitHistoryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "guigit.historyView";
  private _view?: vscode.WebviewView;
  private _refreshTimeout?: NodeJS.Timeout;
  private _contentProviders: Map<string, vscode.Disposable> = new Map();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _gitHistoryProvider: GitHistoryProvider,
    private readonly _state: vscode.Memento
  ) {}

  /**
   * 从资源URI显示该文件的历史（供命令调用）
   */
  public async showFileHistoryForUri(resource?: vscode.Uri) {
    try {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri || uri.scheme !== "file") {
        vscode.window.showErrorMessage("请选择一个本地文件来查看历史");
        return;
      }

      const fileFsPath = uri.fsPath;
      const repositories = this._gitHistoryProvider.getAvailableRepositories();

      // 匹配包含该文件的仓库
      let targetRepo = repositories.find(
        (r) => fileFsPath === r.path || fileFsPath.startsWith(r.path + path.sep)
      );

      if (!targetRepo) {
        const current = this._gitHistoryProvider.getCurrentRepository();
        if (
          current &&
          (fileFsPath === current.path ||
            fileFsPath.startsWith(current.path + path.sep))
        ) {
          targetRepo = current;
        }
      }

      if (!targetRepo) {
        vscode.window.showErrorMessage("无法为所选文件确定Git仓库");
        return;
      }

      const currentRepo = this._gitHistoryProvider.getCurrentRepository();
      if (!currentRepo || currentRepo.path !== targetRepo.path) {
        await this._gitHistoryProvider.setCurrentRepository(targetRepo);
      }

      // 转为仓库相对路径以兼容git命令
      let relativePath = path.relative(targetRepo.path, fileFsPath);
      if (!relativePath || relativePath.startsWith("..")) {
        vscode.window.showErrorMessage("所选文件不在当前仓库内");
        return;
      }
      relativePath = relativePath.split(path.sep).join("/");

      await this._showFileHistory(relativePath);
    } catch (error) {
      console.error("Error showing file history for uri:", error);
      vscode.window.showErrorMessage(
        `Failed to show file history: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 解析WebView视图
   * @param webviewView WebView视图实例
   * @param _context WebView视图解析上下文
   * @param _token 取消令牌
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 处理来自webview的消息
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "getCommitHistory":
          await this._sendCommitHistory(
            data.branch,
            data.skip,
            data.authorFilter
          );
          break;
        case "searchCommits":
          await this._sendSearchResults(
            data.searchTerm,
            data.branch,
            data.authorFilter
          );
          break;
        case "getTotalCommitCount":
          await this._sendTotalCommitCount(data.branch, data.authorFilter);
          break;
        case "getBranches":
          await this._sendBranches();
          break;
        case "getCommitDetails":
          await this._sendCommitDetails(data.hash);
          break;
        case "jumpToHead":
          await this._jumpToHead();
          break;
        case "copyHash":
          await vscode.env.clipboard.writeText(data.hash);
          vscode.window.showInformationMessage(
            "Commit hash copied to clipboard"
          );
          break;
        case "cherryPick":
          await this._cherryPickCommit(data.hash);
          break;
        case "revert":
          await this._revertCommit(data.hash);
          break;
        case "reset":
          await this._resetToCommit(data.hash, data.mode);
          break;
        case "compareCommits":
          await this._compareCommits(data.hashes);
          break;
        case "showFileDiff":
          await this._showFileDiff(data.hash, data.file);
          break;
        case "showCompareFileDiff":
          await this._showCompareFileDiff(
            data.fromHash,
            data.toHash,
            data.file
          );
          break;
        case "openFile":
          await this._openFile(data.file);
          break;
        case "showFileHistory":
          await this._showFileHistory(data.file);
          break;
        case "viewFileOnline":
          await this._viewFileOnline(data.hash, data.file);
          break;
        case "squashCommits":
          await this._squashCommits(data.commits);
          break;
        case "saveViewMode":
          await this._saveViewMode(data.viewMode);
          break;
        case "gitPull":
          await this._handleGitPull();
          break;
        case "gitPush":
          this._handleGitPush();
          break;
        case "gitPullAdvanced":
          this._handleGitPullAdvanced();
          break;
        case "gitPushAdvanced":
          this._handleGitPushAdvanced();
          break;
        case "gitFetch":
          this._handleGitFetch();
          break;
        case "gitClone":
          await this._handleGitClone();
          break;
        case "gitCheckout":
          await this._handleGitCheckout();
          break;
        case "createBranchFromCommit":
          await this._createBranchFromCommit(data.hash);
          break;
        case "pushAllCommitsToHere":
          await this._pushAllCommitsToHere(data.hash);
          break;
        case "editCommitMessage":
          await this._editCommitMessage(data.hash);
          break;
        case "getCurrentUser":
          await this._sendCurrentUser();
          break;
        case "getRepositories":
          await this._sendRepositories();
          break;
        case "switchRepository":
          await this._switchRepository(data.repositoryPath);
          break;
        case "resetAutoStashPreference":
          await this._handleResetAutoStashPreference();
          break;
        case "refreshProxy":
          await this._handleRefreshProxy();
          break;
        case "currentFilterState":
          await this._initializeViewWithFilter(data.filterState);
          break;
        // 删除了checkCommitEditable处理，现在直接使用预计算的canEditMessage值
      }
    });

    // 检查Git仓库状态并初始化加载数据
    this._initializeView();
  }

  /**
   * 处理刷新代理配置操作
   */
  private async _handleRefreshProxy() {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Refreshing proxy configuration...",
          cancellable: false,
        },
        async () => {
          await this._gitHistoryProvider.refreshProxyConfig();
        }
      );

      vscode.window.showInformationMessage(
        "Proxy configuration refreshed successfully"
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to refresh proxy configuration: ${errorMessage}`
      );
    }
  }

  /**
   * 初始化视图
   */
  private async _initializeView() {
    if (!this._view) return;

    // 检查是否有Git仓库
    const hasGitRepo = await this._checkForGitRepository();
    if (!hasGitRepo) {
      // 显示无Git仓库的提示
      this._view.webview.postMessage({
        type: "noGitRepository",
        message: "No Git repository found in the current workspace.",
      });
      return;
    }

    // 有Git仓库，按顺序初始化以减少并发压力
    await this._sendRepositories();
    await this._sendBranches();
    await this._sendCommitHistory();
    await this._sendTotalCommitCount(); // 添加发送总提交数
    this._sendViewMode();
  }

  /**
   * 使用筛选状态初始化视图
   * @param filterState 筛选状态
   */
  private async _initializeViewWithFilter(filterState: any) {
    if (!this._view) return;

    // 检查是否有Git仓库
    const hasGitRepo = await this._checkForGitRepository();
    if (!hasGitRepo) {
      // 显示无Git仓库的提示
      this._view.webview.postMessage({
        type: "noGitRepository",
        message: "No Git repository found in the current workspace.",
      });
      return;
    }

    // 有Git仓库，按顺序初始化以减少并发压力
    await this._sendRepositories();
    await this._sendBranches();

    // 根据筛选状态决定发送什么数据
    if (filterState && filterState.searchTerm) {
      // 如果有搜索词，发送搜索结果
      await this._sendSearchResults(
        filterState.searchTerm,
        filterState.currentBranch,
        filterState.authorFilter
      );
    } else {
      // 否则发送普通的提交历史
      await this._sendCommitHistory(
        filterState?.currentBranch,
        0,
        filterState?.authorFilter
      );
    }

    // 发送总提交数
    await this._sendTotalCommitCount(
      filterState?.currentBranch,
      filterState?.authorFilter
    );

    this._sendViewMode();
  }

  /**
   * 检查是否有Git仓库
   */
  private async _checkForGitRepository(): Promise<boolean> {
    try {
      const gitExtension = vscode.extensions.getExtension("vscode.git");
      if (!gitExtension) {
        return false;
      }

      // 确保Git扩展已激活
      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      const git = gitExtension.exports.getAPI(1);
      return git.repositories.length > 0;
    } catch (error) {
      console.error("Error checking Git repositories:", error);
      return false;
    }
  }

  /**
   * 刷新Git历史视图（优化版本）
   * 使用防抖机制避免频繁刷新，增加延迟时间
   * 保持当前的筛选状态
   * @param immediate 是否立即刷新，绕过防抖延迟
   */
  public refresh(immediate: boolean = false) {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }

    const doRefresh = async () => {
      if (this._view) {
        console.time("refresh-view");

        // 清理后端缓存并重新计算canEditMessage状态
        await this._gitHistoryProvider.clearCache();

        // 请求前端当前的筛选状态，响应将通过 currentFilterState 消息处理
        this._view.webview.postMessage({
          type: "requestCurrentFilterState",
        });

        console.timeEnd("refresh-view");
      }
    };

    if (immediate) {
      // 立即刷新，绕过防抖延迟
      void doRefresh();
      return;
    }

    this._refreshTimeout = setTimeout(doRefresh, 1500); // 增加到1.5秒防抖延迟，减少频繁刷新
  }

  /**
   * 发送仓库列表到WebView
   */
  private async _sendRepositories() {
    if (!this._view) return;

    try {
      const repositories = this._gitHistoryProvider.getAvailableRepositories();
      const currentRepo = this._gitHistoryProvider.getCurrentRepository();

      // 确保当前仓库的活动状态正确
      const repositoriesWithStatus = repositories.map((repo) => ({
        ...repo,
        isActive: currentRepo ? repo.path === currentRepo.path : false,
      }));

      this._view.webview.postMessage({
        type: "repositories",
        data: repositoriesWithStatus,
      });
    } catch (error) {
      console.error("Error getting repositories:", error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to load repositories: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  /**
   * 切换当前仓库
   * @param repositoryPath 仓库路径
   */
  private async _switchRepository(repositoryPath: string) {
    if (!this._view) return;

    try {
      const repositories = this._gitHistoryProvider.getAvailableRepositories();
      const repository = repositories.find(
        (repo) => repo.path === repositoryPath
      );

      if (repository) {
        await this._gitHistoryProvider.setCurrentRepository(repository);

        // 通知前端仓库已切换
        this._view.webview.postMessage({
          type: "repositorySwitched",
          data: repository,
        });

        // 刷新视图数据
        this._sendBranches();
        this._sendCommitHistory();
      } else {
        throw new Error(`Repository not found: ${repositoryPath}`);
      }
    } catch (error) {
      console.error(`Error switching repository to ${repositoryPath}:`, error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to switch repository: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  /**
   * 发送分支列表到WebView
   */
  private async _sendBranches() {
    if (!this._view) return;

    // 检查 Git 是否已初始化
    const hasGitRepo = await this._checkForGitRepository();
    if (!hasGitRepo) {
      // Git 未初始化时，发送空的分支列表而不是错误信息
      this._view.webview.postMessage({
        type: "branches",
        data: [],
      });
      return;
    }

    try {
      const branches = await this._gitHistoryProvider.getBranches();
      this._view.webview.postMessage({
        type: "branches",
        data: branches,
      });
    } catch (error) {
      console.error("Error getting branches:", error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to load branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  /**
   * 发送提交历史到WebView
   * @param branch 分支名称
   * @param skip 跳过的提交数量
   * @param authorFilter 作者筛选
   */
  private async _sendCommitHistory(
    branch?: string,
    skip: number = 0,
    authorFilter?: string[]
  ) {
    if (!this._view) return;

    // 检查 Git 是否已初始化
    const hasGitRepo = await this._checkForGitRepository();
    if (!hasGitRepo) {
      // Git 未初始化时，发送空的提交历史而不是错误信息
      this._view.webview.postMessage({
        type: "commitHistory",
        data: {
          commits: [],
          skip: 0,
          hasMore: false,
        },
      });
      return;
    }

    try {
      const commits = await this._gitHistoryProvider.getCommitHistory(
        branch,
        50,
        skip,
        authorFilter
      );
      this._view.webview.postMessage({
        type: "commitHistory",
        data: {
          commits,
          skip,
          hasMore: commits.length === 50,
        },
      });
    } catch (error) {
      console.error("Error getting commit history:", error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to load commit history: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  /**
   * 发送搜索结果到WebView
   * @param searchTerm 搜索词
   * @param branch 分支名称
   */
  private async _sendSearchResults(
    searchTerm: string,
    branch?: string,
    authorFilter?: string[]
  ) {
    if (!this._view) return;

    // 检查 Git 是否已初始化
    const hasGitRepo = await this._checkForGitRepository();
    if (!hasGitRepo) {
      // Git 未初始化时，发送空的搜索结果而不是错误信息
      this._view.webview.postMessage({
        type: "searchResults",
        data: {
          commits: [],
          searchTerm,
          branch,
        },
      });
      return;
    }

    try {
      const commits = await this._gitHistoryProvider.searchCommits(
        searchTerm,
        branch,
        50,
        authorFilter
      );
      this._view.webview.postMessage({
        type: "searchResults",
        data: {
          commits,
          searchTerm,
          branch,
        },
      });
    } catch (error) {
      console.error("Error searching commits:", error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to search commits: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  /**
   * 发送提交总数到WebView
   * @param branch 分支名称
   * @param authorFilter 作者筛选
   */
  private async _sendTotalCommitCount(
    branch?: string,
    authorFilter?: string[]
  ) {
    if (!this._view) return;

    // 检查 Git 是否已初始化
    const hasGitRepo = await this._checkForGitRepository();
    if (!hasGitRepo) {
      // Git 未初始化时，发送0作为提交总数
      this._view.webview.postMessage({
        type: "totalCommitCount",
        data: 0,
      });
      return;
    }

    try {
      const totalCount = await this._gitHistoryProvider.getTotalCommitCount(
        branch,
        authorFilter
      );
      this._view.webview.postMessage({
        type: "totalCommitCount",
        data: totalCount,
      });
    } catch (error) {
      console.error("Error getting total commit count:", error);
      // 如果获取总数失败，设置为0，这样前端就不会等待更多提交
      this._view.webview.postMessage({
        type: "totalCommitCount",
        data: 0,
      });
    }
  }

  /**
   * 发送提交详情到WebView
   * @param hash 提交哈希
   */
  private async _sendCommitDetails(hash: string) {
    if (!this._view) return;

    try {
      const details = await this._gitHistoryProvider.getCommitDetails(hash);

      if (details) {
        this._view.webview.postMessage({
          type: "commitDetails",
          data: details,
        });
      } else {
        this._view.webview.postMessage({
          type: "error",
          message: `Failed to load commit details for ${hash.substring(0, 8)}`,
          context: "commitDetails",
          hash,
        });
      }
    } catch (error) {
      console.error(`Error getting commit details for ${hash}:`, error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to load commit details: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        context: "commitDetails",
        hash,
      });
    }
  }

  /**
   * 跳转到HEAD提交
   */
  private async _jumpToHead() {
    if (!this._view) return;

    try {
      const headCommit = await this._gitHistoryProvider.getHeadCommit();
      this._view.webview.postMessage({
        type: "jumpToHead",
        data: headCommit,
      });
    } catch (error) {
      vscode.window.showErrorMessage("Failed to get HEAD commit");
    }
  }

  /**
   * 执行cherry-pick操作
   * @param hash 提交哈希
   */
  private async _cherryPickCommit(hash: string) {
    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to cherry-pick commit ${hash.substring(0, 8)}?`,
      "Yes",
      "No"
    );

    if (result === "Yes") {
      const success = await this._gitHistoryProvider.cherryPickCommit(hash);
      if (success) {
        vscode.window.showInformationMessage(
          "Cherry-pick completed successfully"
        );
        this.refresh(true);
      }
    }
  }

  /**
   * 执行revert操作
   * @param hash 提交哈希
   */
  private async _revertCommit(hash: string) {
    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to revert commit ${hash.substring(0, 8)}?`,
      "Yes",
      "No"
    );

    if (result === "Yes") {
      const success = await this._gitHistoryProvider.revertCommit(hash);
      if (success) {
        vscode.window.showInformationMessage("Revert completed successfully");
        this.refresh(true);
      }
    }
  }

  /**
   * 执行reset操作
   * @param hash 提交哈希
   * @param mode reset模式
   */
  private async _resetToCommit(hash: string, mode: "soft" | "mixed" | "hard") {
    const result = await vscode.window.showWarningMessage(
      `Are you sure you want to reset to commit ${hash.substring(
        0,
        8
      )} (${mode})?`,
      "Yes",
      "No"
    );

    if (result === "Yes") {
      const success = await this._gitHistoryProvider.resetToCommit(hash, mode);
      if (success) {
        vscode.window.showInformationMessage(
          `Reset (${mode}) completed successfully`
        );
        this.refresh(true);
      }
    }
  }

  /**
   * 比较两个提交
   * @param hashes 提交哈希数组
   */
  private async _compareCommits(hashes: string[]) {
    if (hashes.length !== 2) {
      vscode.window.showErrorMessage(
        "Please select exactly 2 commits to compare"
      );
      return;
    }

    const changes = await this._gitHistoryProvider.compareCommits(
      hashes[0],
      hashes[1]
    );
    this._view?.webview.postMessage({
      type: "compareResult",
      data: {
        commits: hashes,
        changes: changes,
      },
    });
  }

  /**
   * 压缩多个提交
   * @param commits 提交对象数组
   */
  private async _squashCommits(commits: GitCommit[]) {
    if (commits.length < 2) {
      vscode.window.showErrorMessage(
        "Please select at least 2 commits to squash"
      );
      return;
    }

    // 检查提交是否连续
    const hashes = commits.map((c) => c.hash);
    const canSquash = await this._canSquashCommits(hashes);
    if (!canSquash) {
      vscode.window.showErrorMessage(
        "Selected commits are not consecutive and cannot be squashed"
      );
      return;
    }

    const success = await this._gitHistoryProvider.squashCommits(commits);
    if (success) {
      vscode.window.showInformationMessage("Squash completed successfully");
      this.refresh(true);
    }
  }

  /**
   * 打开文件
   * @param filePath 文件路径
   */
  private async _openFile(filePath: string) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, filePath);

      // 检查文件是否存在
      try {
        await vscode.workspace.fs.stat(fullPath);
        // 文件存在，打开它
        const document = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preview: true,
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          `File ${filePath} does not exist in the current workspace`
        );
      }
    } catch (error) {
      console.error("Error opening file:", error);
      vscode.window.showErrorMessage(
        `Failed to open file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 显示文件历史
   * @param filePath 文件路径
   */
  private async _showFileHistory(filePath: string) {
    try {
      // 使用 Git 命令显示文件历史
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      // 创建一个新的 webview 来显示文件历史
      const panel = vscode.window.createWebviewPanel(
        "fileHistory",
        `History: ${filePath}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      // 获取文件历史
      const fileHistory = await this._gitHistoryProvider.getFileHistory(
        filePath
      );

      panel.webview.html = this._getFileHistoryHtml(filePath, fileHistory);

      // 处理来自文件历史页面的消息
      panel.webview.onDidReceiveMessage((message) => {
        switch (message.type) {
          case "jumpToCommit":
            this._jumpToCommitInMainView(message.hash);
            break;
        }
      }, undefined);
    } catch (error) {
      console.error("Error showing file history:", error);
      vscode.window.showErrorMessage(
        `Failed to show file history: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 在线查看文件
   * @param hash 提交哈希
   * @param filePath 文件路径
   */
  private async _viewFileOnline(hash: string, filePath: string) {
    try {
      const remoteUrl = await this._gitHistoryProvider.getRemoteUrl();
      if (!remoteUrl) {
        vscode.window.showErrorMessage("No remote repository found");
        return;
      }

      let onlineUrl = "";

      if (remoteUrl.includes("github.com")) {
        // GitHub URL 格式
        const repoMatch = remoteUrl.match(
          /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/
        );
        if (repoMatch) {
          onlineUrl = `https://github.com/${repoMatch[1]}/blob/${hash}/${filePath}`;
        }
      } else if (remoteUrl.includes("gitlab.com")) {
        // GitLab URL 格式
        const repoMatch = remoteUrl.match(
          /gitlab\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/
        );
        if (repoMatch) {
          onlineUrl = `https://gitlab.com/${repoMatch[1]}/-/blob/${hash}/${filePath}`;
        }
      } else if (remoteUrl.includes("bitbucket.org")) {
        // Bitbucket URL 格式
        const repoMatch = remoteUrl.match(
          /bitbucket\.org[:/]([^/]+\/[^/]+?)(?:\.git)?$/
        );
        if (repoMatch) {
          onlineUrl = `https://bitbucket.org/${repoMatch[1]}/src/${hash}/${filePath}`;
        }
      }

      if (onlineUrl) {
        await vscode.env.openExternal(vscode.Uri.parse(onlineUrl));
      } else {
        vscode.window.showErrorMessage(
          "Unsupported remote repository provider"
        );
      }
    } catch (error) {
      console.error("Error viewing file online:", error);
      vscode.window.showErrorMessage(
        `Failed to view file online: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 跳转到主视图中的指定提交
   * @param hash 提交哈希
   */
  private _jumpToCommitInMainView(hash: string) {
    if (!this._view) return;

    // 向主视图发送跳转消息
    this._view.webview.postMessage({
      type: "jumpToCommit",
      data: { hash },
    });
  }

  /**
   * HTML转义函数
   * @param text 需要转义的文本
   * @returns 转义后的文本
   */
  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * 生成文件历史的HTML内容
   * @param filePath 文件路径
   * @param history 文件历史记录
   * @returns HTML字符串
   */
  private _getFileHistoryHtml(filePath: string, history: any[]): string {
    const commits = history
      .map(
        (commit) => `
            <div class="commit-item" onclick="jumpToCommit('${commit.hash}')">
                <div class="commit-hash">${commit.hash.substring(0, 8)}</div>
                <div class="commit-message">${this._escapeHtml(
                  commit.message
                )}</div>
                <div class="commit-author">${this._escapeHtml(
                  commit.author
                )}</div>
                <div class="commit-date">${new Date(
                  commit.date
                ).toLocaleDateString()}</div>
            </div>
        `
      )
      .join("");

    return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>File History: ${filePath}</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        margin: 0;
                        padding: 20px;
                    }
                    .file-path {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 20px;
                        color: var(--vscode-textLink-foreground);
                    }
                    .commit-item {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 12px;
                        margin-bottom: 8px;
                        background-color: var(--vscode-editor-background);
                        cursor: pointer;
                        transition: background-color 0.2s ease;
                    }
                    .commit-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                        border-color: var(--vscode-list-hoverForeground);
                    }
                    .commit-hash {
                        font-family: monospace;
                        color: var(--vscode-textLink-foreground);
                        font-weight: bold;
                        margin-bottom: 4px;
                    }
                    .commit-message {
                        font-weight: bold;
                        margin-bottom: 4px;
                    }
                    .commit-author {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                    }
                    .commit-date {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                        float: right;
                    }
                </style>
            </head>
            <body>
                <div class="file-path">File History: ${this._escapeHtml(
                  filePath
                )}</div>
                <div class="commits">
                    ${commits}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function jumpToCommit(hash) {
                        vscode.postMessage({
                            type: 'jumpToCommit',
                            hash: hash
                        });
                    }
                </script>
            </body>
            </html>
        `;
  }

  /**
   * 检查是否可以压缩提交
   * @param hashes 提交哈希数组
   * @returns 是否可以压缩
   */
  private async _canSquashCommits(hashes: string[]): Promise<boolean> {
    if (hashes.length < 2) {
      return false;
    }

    return true;
  }

  /**
   * 保存视图模式
   * @param viewMode 视图模式
   */
  private async _saveViewMode(viewMode: string) {
    const config = vscode.workspace.getConfiguration("guigit");
    await config.update(
      "fileViewMode",
      viewMode,
      vscode.ConfigurationTarget.Workspace
    );
  }

  /**
   * 发送视图模式到WebView
   */
  private async _sendViewMode() {
    if (!this._view) return;

    const config = vscode.workspace.getConfiguration("guigit");
    const viewMode = config.get<string>("fileViewMode", "list");

    this._view.webview.postMessage({
      type: "viewMode",
      data: viewMode,
    });
  }

  /**
   * 显示文件差异
   * @param hash 提交哈希
   * @param filePath 文件路径
   */
  private async _showFileDiff(hash: string, filePath: string) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const isInitialCommit = await this._gitHistoryProvider.isInitialCommit(
        hash
      );

      if (isInitialCommit) {
        const fileContent = await this._gitHistoryProvider.getFileContent(
          hash,
          filePath
        );
        if (fileContent) {
          const baseFileName = filePath.split("/").pop() || "file";
          const shortHash = hash.substring(0, 8);

          const leftUri = this._createReadOnlyUri(
            "",
            `${baseFileName} (empty)`,
            filePath
          );
          const rightUri = this._createReadOnlyUri(
            fileContent,
            `${baseFileName} (${shortHash})`,
            filePath
          );

          const title = `${baseFileName} (${shortHash}) - Initial Commit`;
          await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            title,
            {
              viewColumn: vscode.ViewColumn.One,
              preview: true,
            }
          );
        } else {
          vscode.window.showErrorMessage(
            `Failed to get file content for ${filePath}`
          );
        }
      } else {
        await this._showCustomFileDiff(hash, filePath);
      }
    } catch (error) {
      console.error("Error showing file diff:", error);
      vscode.window.showErrorMessage(
        `Failed to show file diff: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 显示比较文件差异
   * @param fromHash 源提交哈希
   * @param toHash 目标提交哈希
   * @param filePath 文件路径
   */
  private async _showCompareFileDiff(
    fromHash: string,
    toHash: string,
    filePath: string
  ) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const fromContent = await this._gitHistoryProvider.getFileContent(
        fromHash,
        filePath
      );
      const toContent = await this._gitHistoryProvider.getFileContent(
        toHash,
        filePath
      );

      if (fromContent === null && toContent === null) {
        vscode.window.showErrorMessage(
          `Failed to get file content for ${filePath}`
        );
        return;
      }

      const baseFileName = filePath.split("/").pop() || "file";
      const shortFromHash = fromHash.substring(0, 8);
      const shortToHash = toHash.substring(0, 8);

      if (fromContent === null && toContent !== null) {
        // 文件在源提交中不存在，在目标提交中新增
        const leftUri = this._createReadOnlyUri(
          "",
          `${baseFileName} (empty)`,
          filePath
        );
        const rightUri = this._createReadOnlyUri(
          toContent,
          `${baseFileName} (${shortToHash})`,
          filePath
        );

        const title = `${baseFileName} (${shortFromHash}..${shortToHash}) - New File`;
        await vscode.commands.executeCommand(
          "vscode.diff",
          leftUri,
          rightUri,
          title,
          {
            viewColumn: vscode.ViewColumn.One,
            preview: true,
          }
        );
        return;
      }

      if (fromContent !== null && toContent === null) {
        // 文件在源提交中存在，在目标提交中被删除
        const leftUri = this._createReadOnlyUri(
          fromContent,
          `${baseFileName} (${shortFromHash})`,
          filePath
        );
        const rightUri = this._createReadOnlyUri(
          "",
          `${baseFileName} (deleted)`,
          filePath
        );

        const title = `${baseFileName} (${shortFromHash}..${shortToHash}) - Deleted File`;
        await vscode.commands.executeCommand(
          "vscode.diff",
          leftUri,
          rightUri,
          title,
          {
            viewColumn: vscode.ViewColumn.One,
            preview: true,
          }
        );
        return;
      }

      if (fromContent === toContent) {
        vscode.window.showInformationMessage(
          `No changes in ${filePath} between these commits`
        );
        return;
      }

      const leftUri = this._createReadOnlyUri(
        fromContent || "",
        `${baseFileName} (${shortFromHash})`,
        filePath
      );
      const rightUri = this._createReadOnlyUri(
        toContent || "",
        `${baseFileName} (${shortToHash})`,
        filePath
      );

      const title = `${baseFileName} (${shortFromHash}..${shortToHash})`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        leftUri,
        rightUri,
        title,
        {
          viewColumn: vscode.ViewColumn.One,
          preview: true,
        }
      );
    } catch (error) {
      console.error("Error showing compare file diff:", error);
      vscode.window.showErrorMessage(
        `Failed to show file diff: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 显示自定义文件差异
   * @param hash 提交哈希
   * @param filePath 文件路径
   */
  private async _showCustomFileDiff(hash: string, filePath: string) {
    try {
      const oldContent = await this._gitHistoryProvider.getFileContent(
        `${hash}^`,
        filePath
      );
      const newContent = await this._gitHistoryProvider.getFileContent(
        hash,
        filePath
      );

      if (oldContent === null && newContent === null) {
        vscode.window.showErrorMessage(
          `Failed to get file content for ${filePath}`
        );
        return;
      }

      const baseFileName = filePath.split("/").pop() || "file";
      const shortHash = hash.substring(0, 8);

      if (oldContent === null && newContent !== null) {
        const leftUri = this._createReadOnlyUri(
          "",
          `${baseFileName} (empty)`,
          filePath
        );
        const rightUri = this._createReadOnlyUri(
          newContent,
          `${baseFileName} (${shortHash})`,
          filePath
        );

        const title = `${baseFileName} (${shortHash}) - New File`;
        await vscode.commands.executeCommand(
          "vscode.diff",
          leftUri,
          rightUri,
          title,
          {
            viewColumn: vscode.ViewColumn.One,
            preview: true,
          }
        );
        return;
      }

      if (oldContent !== null && newContent === null) {
        const leftUri = this._createReadOnlyUri(
          oldContent,
          `${baseFileName} (${shortHash}^)`,
          filePath
        );
        const rightUri = this._createReadOnlyUri(
          "",
          `${baseFileName} (deleted)`,
          filePath
        );

        const title = `${baseFileName} (${shortHash}) - Deleted File`;
        await vscode.commands.executeCommand(
          "vscode.diff",
          leftUri,
          rightUri,
          title,
          {
            viewColumn: vscode.ViewColumn.One,
            preview: true,
          }
        );
        return;
      }

      if (oldContent === newContent) {
        vscode.window.showInformationMessage(`No changes in ${filePath}`);
        return;
      }

      const leftUri = this._createReadOnlyUri(
        oldContent || "",
        `${baseFileName} (${shortHash}^)`,
        filePath
      );
      const rightUri = this._createReadOnlyUri(
        newContent || "",
        `${baseFileName} (${shortHash})`,
        filePath
      );

      const title = `${baseFileName} (${shortHash})`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        leftUri,
        rightUri,
        title,
        {
          viewColumn: vscode.ViewColumn.One,
          preview: true,
        }
      );
    } catch (error) {
      console.error("Error showing custom file diff:", error);
      vscode.window.showErrorMessage(
        `Failed to show file diff: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 创建只读URI
   * @param content 文件内容
   * @param fileName 文件名
   * @param originalPath 原始文件路径
   * @returns 只读URI
   */
  private _createReadOnlyUri(
    content: string,
    fileName: string,
    originalPath: string
  ): vscode.Uri {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const uniqueKey = `${fileName}-${timestamp}-${random}`;
    const scheme = `git-history-${random}`;
    const uri = vscode.Uri.parse(`${scheme}:${fileName}?${timestamp}`);

    const existingProvider = this._contentProviders.get(uniqueKey);
    if (existingProvider) {
      existingProvider.dispose();
    }

    const disposable = vscode.workspace.registerTextDocumentContentProvider(
      scheme,
      {
        provideTextDocumentContent: (requestUri: vscode.Uri) => {
          if (requestUri.toString() === uri.toString()) {
            return content;
          }
          return null;
        },
      }
    );

    this._contentProviders.set(uniqueKey, disposable);

    setTimeout(() => {
      const provider = this._contentProviders.get(uniqueKey);
      if (provider === disposable) {
        provider.dispose();
        this._contentProviders.delete(uniqueKey);
      }
    }, 300000);

    return uri;
  }

  /**
   * 生成WebView的HTML内容
   * @param webview WebView实例
   * @returns HTML字符串
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.css")
    );

    // 图标映射表 - 与前端icons.js保持一致
    const getCodiconHtml = (iconName: string, size: string = "medium") => {
      const iconMap: { [key: string]: string } = {
        pull: "repo-pull",
        push: "repo-push",
        fetch: "git-fetch",
        clone: "repo-clone",
        checkout: "git-branch",
        settings: "settings-gear",
        resetStash: "settings-gear",
        jumpToHead: "target",
        refresh: "refresh",
        globe: "globe",
        collapseLeft: "chevron-left",
        collapseRight: "chevron-right",
        close: "close",
      };

      const codiconName = iconMap[iconName];
      if (!codiconName) {
        console.warn(`Icon "${iconName}" not found in iconMap`);
        return "";
      }

      const sizeStyles: { [key: string]: string } = {
        small: "font-size: 12px;",
        medium: "font-size: 16px;",
        large: "font-size: 20px;",
      };

      const style = sizeStyles[size] || sizeStyles.medium;
      return `<i class="codicon codicon-${codiconName}" style="${style}"></i>`;
    };

    // Git操作按钮配置
    const gitOperations = [
      {
        id: "pullBtn",
        action: "pull",
        title: "Pull (Ctrl+Click for advanced options)",
      },
      {
        id: "pushBtn",
        action: "push",
        title: "Push (Ctrl+Click for advanced options)",
      },
      { id: "fetchBtn", action: "fetch", title: "Fetch" },
      { id: "cloneBtn", action: "clone", title: "Clone" },
      { id: "checkoutBtn", action: "checkout", title: "Checkout" },
      {
        id: "settingsBtn",
        action: "settings",
        title: "Settings",
      },
    ];

    // 头部控制按钮配置
    const headerControls = [
      { id: "jumpToHeadBtn", action: "jumpToHead", title: "Jump to HEAD" },
      { id: "refreshBtn", action: "refresh", title: "Refresh" },
    ];

    // 上下文菜单项配置
    const contextMenuItems = [
      { action: "copyHash", label: "Copy Hash" },
      { action: "cherryPick", label: "Cherry Pick" },
      { action: "revert", label: "Revert" },
      { separator: true },
      {
        action: "editCommitMessage",
        label: "Edit Commit Message",
        id: "editCommitMessageMenuItem",
      },
      { separator: true },
      { action: "compare", label: "Compare Selected", id: "compareMenuItem" },
      { action: "squash", label: "Squash Commits", id: "squashMenuItem" },
      { separator: true },
      { action: "createBranch", label: "Create Branch from Here" },
      { action: "pushToCommit", label: "Push All Commits to Here" },
      { separator: true },
      { action: "resetSoft", label: "Reset (Soft)" },
      { action: "resetMixed", label: "Reset (Mixed)" },
      { action: "resetHard", label: "Reset (Hard)" },
    ];

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Git History</title>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="header-left">
                            <select id="repositorySelect" class="repository-select">
                            <!-- 仓库选项将通过JavaScript动态填充 -->
                        </select>
                            <select id="branchSelect" class="branch-select">
                                <option value="">All branches</option>
                            </select>
                            <div class="search-container">
                                <input type="text" id="commitSearchInput" class="commit-search-input" placeholder="搜索提交信息或哈希..." />
                                <button id="clearSearchBtn" class="clear-search-btn" title="清除搜索" style="display: none;">
                                    ${getCodiconHtml("close", "small")}
                                </button>
                            </div>
                        </div>
                        <div class="header-right">
                            <div class="git-operations">
                                ${gitOperations
                                  .map(
                                    (op) => `
                                    <button id="${
                                      op.id
                                    }" class="git-btn" title="${
                                      op.title
                                    }" data-action="${op.action}">
                                        ${getCodiconHtml(op.action, "small")}
                                        ${
                                          op.action.charAt(0).toUpperCase() +
                                          op.action.slice(1)
                                        }
                                    </button>
                                `
                                  )
                                  .join("")}
                            </div>
                            <div class="header-controls">
                                ${headerControls
                                  .map(
                                    (ctrl) => `
                                    <button id="${
                                      ctrl.id
                                    }" class="icon-btn" title="${
                                      ctrl.title
                                    }" data-action="${ctrl.action}">
                                        ${getCodiconHtml(ctrl.action, "medium")}
                                    </button>
                                `
                                  )
                                  .join("")}
                            </div>
                        </div>
                    </div>
                    
                    <div class="content">
                        <div class="commit-list" id="commitList">
                            <div class="panel-header">
                                <div class="commit-list-headers">
                                    <div class="header-hash">Hash</div>
                                    <div class="header-message">Message</div>
                                    <div class="header-refs">Tags</div>
                                    <div class="header-author">Author</div>
                                    <div class="header-date">Date</div>
                                </div>
                                <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">
                                    ${getCodiconHtml("collapseLeft", "medium")}
                                </button>
                            </div>
                            <div class="loading">Loading commits...</div>
                        </div>
                        
                        <div class="resizer" id="resizer"></div>
                        
                        <div class="commit-details" id="commitDetails">
                            <div class="panel-header">
                                <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">
                                    ${getCodiconHtml("collapseRight", "medium")}
                                </button>
                            </div>
                            <div class="placeholder">Select a commit to view details</div>
                        </div>
                    </div>
                    
                    <div class="compare-panel" id="comparePanel" style="display: none;">
                        <div class="compare-header">
                            <h3>Compare Commits</h3>
                            <button id="closeCompare">×</button>
                        </div>
                        <div class="compare-content" id="compareContent"></div>
                    </div>
                </div>

                <!-- Context Menu -->
                <div id="contextMenu" class="context-menu" style="display: none;">
                    ${contextMenuItems
                      .map((item) =>
                        item.separator
                          ? '<div class="menu-separator"></div>'
                          : `<div class="menu-item" data-action="${
                              item.action
                            }"${item.id ? ` id="${item.id}"` : ""}>${
                              item.label
                            }</div>`
                      )
                      .join("")}
                </div>

                <!-- Settings Dropdown Menu -->
                <div id="settingsMenu" class="settings-menu" style="display: none;">
                    <div class="menu-item" data-action="resetStash">
                        ${getCodiconHtml("refresh", "small")}
                        Reset Stash Preference
                    </div>
                    <div class="menu-separator"></div>
                    <div class="menu-item" data-action="refreshProxy">
                        ${getCodiconHtml("globe", "small")}
                        Refresh Proxy
                    </div>
                </div>

                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
  }

  /**
   * 处理Git Pull操作
   */
  private async _handleGitPull() {
    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Pulling from remote...",
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.safePull();
        }
      );

      if (result) {
        vscode.window.showInformationMessage("Successfully pulled from remote");
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Push操作
   */
  private async _handleGitPush() {
    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Pushing to remote...",
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.pushToRemote();
        }
      );

      if (result) {
        vscode.window.showInformationMessage("Successfully pushed to remote");
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Fetch操作
   */
  private async _handleGitFetch() {
    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Fetching from remote...",
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.fetchFromRemote(true);
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          "Successfully fetched from remote"
        );
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Clone操作
   */
  private async _handleGitClone() {
    try {
      const repoUrl = await vscode.window.showInputBox({
        prompt: "Enter repository URL to clone",
        placeHolder: "https://github.com/user/repo.git",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Repository URL is required";
          }
          return null;
        },
      });

      if (!repoUrl) {
        return;
      }

      const targetFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Clone Location",
      });

      if (!targetFolder || targetFolder.length === 0) {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Cloning repository...",
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.cloneRepository(
            repoUrl.trim(),
            targetFolder[0].fsPath
          );
        }
      );

      if (result) {
        const openChoice = await vscode.window.showInformationMessage(
          "Repository cloned successfully",
          "Open Folder"
        );
        if (openChoice === "Open Folder") {
          await vscode.commands.executeCommand(
            "vscode.openFolder",
            vscode.Uri.file(result)
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Checkout操作
   */
  private async _handleGitCheckout() {
    try {
      const branches = await this._gitHistoryProvider.getBranches();
      const branchNames = branches.map((branch) => branch.name);

      // 添加创建新分支选项
      const branchOptions = [...branchNames, "+ Create new branch"];

      const selectedOption = await vscode.window.showQuickPick(branchOptions, {
        placeHolder: "Select a branch to checkout or create new one",
        canPickMany: false,
      });

      if (!selectedOption) {
        return;
      }

      let targetBranch: string;
      let isNewBranch = false;

      if (selectedOption === "+ Create new branch") {
        // 创建新分支
        const newBranchName = await vscode.window.showInputBox({
          prompt: "Enter new branch name",
          placeHolder: "new-branch-name",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Branch name is required";
            }
            if (branchNames.includes(value.trim())) {
              return "Branch name already exists";
            }
            // 检查分支名称格式
            if (!/^[a-zA-Z0-9._/-]+$/.test(value.trim())) {
              return "Invalid branch name. Use only letters, numbers, dots, hyphens, underscores, and slashes";
            }
            return null;
          },
        });

        if (!newBranchName) {
          return;
        }

        targetBranch = newBranchName.trim();
        isNewBranch = true;
      } else {
        targetBranch = selectedOption;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: isNewBranch
            ? `Creating and checking out branch ${targetBranch}...`
            : `Checking out branch ${targetBranch}...`,
          cancellable: false,
        },
        async () => {
          if (isNewBranch) {
            return await this._gitHistoryProvider.createAndCheckoutBranch(
              targetBranch
            );
          } else {
            return await this._gitHistoryProvider.checkoutBranch(targetBranch);
          }
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          isNewBranch
            ? `Successfully created and checked out branch: ${targetBranch}`
            : `Successfully checked out branch: ${targetBranch}`
        );
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Pull高级选项
   */
  private async _handleGitPullAdvanced() {
    try {
      // 并行获取远程分支、当前分支与上游分支，提高效率
      const [remoteBranches, currentBranch, upstream] = await Promise.all([
        this._gitHistoryProvider.getAllRemoteBranches(),
        this._gitHistoryProvider.getCurrentBranchName(),
        this._gitHistoryProvider.getUpstreamBranch(),
      ]);

      if (!remoteBranches || remoteBranches.length === 0) {
        vscode.window.showErrorMessage("未发现任何远程分支");
        return;
      }

      // 读取上次选择的拉取方式，并在列表中置顶（使用 Memento，不暴露到设置中）
      const lastMethod = this._state.get<"merge" | "rebase">("guigit:lastPullMethod");

      let methodOptions: (vscode.QuickPickItem & { isRebase: boolean; key: "merge" | "rebase" })[] = [
        { label: "$(git-merge) Merge", description: "使用 merge 拉取", isRebase: false, key: "merge" },
        { label: "$(git-pull-request) Rebase", description: "使用 rebase 拉取", isRebase: true, key: "rebase" },
      ];
      if (lastMethod) {
        methodOptions = methodOptions.sort((a, b) => (a.key === lastMethod ? -1 : b.key === lastMethod ? 1 : 0));
      }

      // 第一步：先选择拉取方式（Merge 或 Rebase）
      const methodPick = await vscode.window.showQuickPick(methodOptions, {
        placeHolder: `选择拉取方式 (Merge 或 Rebase)${lastMethod ? `，上次使用：${lastMethod === "rebase" ? "Rebase" : "Merge"}` : ""}`,
        canPickMany: false,
        matchOnDescription: true,
      });
      if (!methodPick) return;
      const isRebase = (methodPick as any).isRebase as boolean;

      // 记住本次选择（使用 Memento）
      await this._state.update(
        "guigit:lastPullMethod",
        isRebase ? "rebase" : "merge"
      );

      // 第二步：选择目标远程分支，优先展示当前分支的上游分支
      const items: (vscode.QuickPickItem & { branch?: string })[] = [];
      if (upstream && remoteBranches.includes(upstream)) {
        items.push({
          label: `$(arrow-up) Upstream: ${upstream}`,
          description: currentBranch
            ? `当前分支 ${currentBranch} 的上游`
            : "当前分支的上游",
          branch: upstream,
        });
        items.push({ label: "建议", kind: vscode.QuickPickItemKind.Separator } as any);
      }

      items.push({ label: "远程分支", kind: vscode.QuickPickItemKind.Separator } as any);
      items.push(
        ...remoteBranches.map((branch) => ({
          label: branch,
          description: "远程分支",
          branch,
        }))
      );

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `选择要从远程拉取的分支 (${isRebase ? "Rebase" : "Merge"})` ,
        canPickMany: false,
        matchOnDescription: true,
      });

      if (!selected || !(selected as any).branch) {
        return;
      }

      const branch = (selected as any).branch as string;

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${isRebase ? "使用 rebase 拉取" : "正在拉取"}：${branch}...`,
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.safePullFromFullRemoteBranch(
            branch,
            isRebase
          );
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          `${isRebase ? "已使用 rebase 拉取" : "已拉取"}：${branch}`
        );
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Push高级选项
   */
  private async _handleGitPushAdvanced() {
    try {
      // 获取所有远程分支列表
      const remoteBranches =
        await this._gitHistoryProvider.getAllRemoteBranches();

      // 创建一个 QuickPick 来显示所有远程分支并支持输入筛选
      const quickPick = vscode.window.createQuickPick();
      quickPick.placeholder =
        "Select a remote branch or type to create new one";
      quickPick.items = remoteBranches.map((branch) => ({
        label: branch,
        description: "Existing remote branch",
      }));
      quickPick.canSelectMany = false;
      quickPick.matchOnDescription = true;

      return new Promise<void>((resolve) => {
        let selectedBranch: string | undefined;
        let isNewBranch = false;

        quickPick.onDidChangeValue((value) => {
          const trimmedValue = value.trim();

          if (!trimmedValue) {
            // 如果输入为空，显示所有远程分支
            quickPick.items = remoteBranches.map((branch) => ({
              label: branch,
              description: "Existing remote branch",
            }));
            return;
          }

          // 筛选现有分支
          const filteredBranches = remoteBranches.filter((branch) =>
            branch.toLowerCase().includes(trimmedValue.toLowerCase())
          );

          const items: vscode.QuickPickItem[] = [];

          // 添加筛选出的现有分支
          items.push(
            ...filteredBranches.map((branch) => ({
              label: branch,
              description: "Existing remote branch",
            }))
          );

          // 如果筛选结果为空或用户输入的不是现有分支的完全匹配，
          // 则提供创建新分支的选项
          let targetBranch = trimmedValue;

          // 智能处理远程仓库前缀：如果输入不包含斜杠，自动添加 origin/ 前缀
          if (!trimmedValue.includes("/")) {
            targetBranch = `origin/${trimmedValue}`;
          }

          // 检查是否完全匹配现有分支
          const exactMatch = remoteBranches.find(
            (branch) => branch.toLowerCase() === targetBranch.toLowerCase()
          );

          if (!exactMatch) {
            items.push({
              label: `$(add) Create: ${targetBranch}`,
              description: "Create new remote branch",
              detail: "This will create a new branch and push to it",
            });
          }

          quickPick.items = items;
        });

        quickPick.onDidAccept(() => {
          const selected = quickPick.selectedItems[0];
          if (selected) {
            if (selected.label.startsWith("$(add) Create: ")) {
              // 用户选择创建新分支
              selectedBranch = selected.label.replace("$(add) Create: ", "");
              isNewBranch = true;
            } else {
              // 用户选择现有分支
              selectedBranch = selected.label;
              isNewBranch = false;
            }
            quickPick.hide();
          }
        });

        quickPick.onDidHide(() => {
          quickPick.dispose();
          if (selectedBranch) {
            this._performPushOperation(selectedBranch, isNewBranch).then(() =>
              resolve()
            );
          } else {
            resolve();
          }
        });

        quickPick.show();
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 执行推送操作
   */
  private async _performPushOperation(
    targetBranch: string,
    isNewBranch: boolean
  ) {
    try {
      let isForce = false;

      // 对于新分支，自动选择 normal push；对于现有分支，让用户选择
      if (!isNewBranch) {
        const pushOptions = await vscode.window.showQuickPick(
          [
            { label: "Normal push", value: "normal" },
            { label: "Force push (--force)", value: "force" },
          ],
          {
            placeHolder: "Select push option",
            canPickMany: false,
          }
        );

        if (!pushOptions) {
          return;
        }

        isForce = pushOptions.value === "force";

        // 如果是强制推送，显示警告
        if (isForce) {
          const confirm = await vscode.window.showWarningMessage(
            "Force push can overwrite remote changes and may cause data loss. Are you sure?",
            { modal: true },
            "Yes, force push",
            "Cancel"
          );

          if (confirm !== "Yes, force push") {
            return;
          }
        }
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${isForce ? "Force pushing" : "Pushing"} to ${targetBranch}${
            isNewBranch ? " (new branch)" : ""
          }...`,
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.pushToFullRemoteBranch(
            targetBranch,
            isForce
          );
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          `Successfully ${
            isForce ? "force pushed" : "pushed"
          } to ${targetBranch}${isNewBranch ? " (new branch created)" : ""}`
        );
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 从指定提交创建新分支
   */
  private async _createBranchFromCommit(hash: string) {
    try {
      const branchName = await vscode.window.showInputBox({
        prompt: "Enter new branch name",
        placeHolder: "feature/new-branch",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Branch name is required";
          }
          if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
            return "Invalid branch name. Use only letters, numbers, hyphens, underscores and slashes";
          }
          return null;
        },
      });

      if (!branchName) {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating branch '${branchName}' from commit ${hash.substring(
            0,
            8
          )}...`,
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.createBranchFromCommit(
            hash,
            branchName
          );
        }
      );

      if (result) {
        const checkoutResult = await vscode.window.showInformationMessage(
          `Successfully created branch '${branchName}' from commit ${hash.substring(
            0,
            8
          )}`,
          "Checkout branch",
          "Stay on current branch"
        );

        if (checkoutResult === "Checkout branch") {
          await this._gitHistoryProvider.checkoutBranch(branchName);
          vscode.window.showInformationMessage(
            `Checked out to branch '${branchName}'`
          );
        }

        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 推送此前所有提交到指定分支
   */
  private async _pushAllCommitsToHere(hash: string) {
    try {
      // 获取所有远程分支列表
      const remoteBranches =
        await this._gitHistoryProvider.getAllRemoteBranches();

      // 添加"新建分支"选项
      const branchOptions = [...remoteBranches, "+ Create new remote branch"];

      // 选择目标分支
      const selectedOption = await vscode.window.showQuickPick(branchOptions, {
        placeHolder: "Select target remote branch or create new one",
        canPickMany: false,
      });

      if (!selectedOption) {
        return;
      }

      let targetBranch: string;
      if (selectedOption === "+ Create new remote branch") {
        // 创建新远程分支
        const newBranchName = await vscode.window.showInputBox({
          prompt: "Enter new remote branch name (format: remote/branch)",
          placeHolder: "origin/feature-branch",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Branch name is required";
            }
            if (!value.includes("/")) {
              return "Invalid format. Please use 'remote/branch' format.";
            }
            return null;
          },
        });
        if (!newBranchName) {
          return;
        }
        targetBranch = newBranchName;
      } else {
        targetBranch = selectedOption;
      }

      // 确认操作
      const confirm = await vscode.window.showWarningMessage(
        `This will push all commits up to ${hash.substring(
          0,
          8
        )} to ${targetBranch}. Continue?`,
        { modal: true },
        "Yes, push commits",
        "Cancel"
      );

      if (confirm !== "Yes, push commits") {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Pushing commits to ${targetBranch}...`,
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.pushCommitsToRemoteBranch(
            hash,
            targetBranch
          );
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          `Successfully pushed commits to ${targetBranch}`
        );
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 编辑提交信息
   */
  private async _editCommitMessage(hash: string) {
    try {
      // 获取当前提交信息
      const commitDetails = await this._gitHistoryProvider.getCommitDetails(
        hash
      );
      if (!commitDetails) {
        vscode.window.showErrorMessage("Failed to get commit details");
        return;
      }

      // 显示输入框让用户编辑提交信息
      const newMessage = await vscode.window.showInputBox({
        prompt: "Edit commit message",
        value: commitDetails.commit.message,
        placeHolder: "Enter new commit message",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Commit message cannot be empty";
          }
          return null;
        },
      });

      if (!newMessage || newMessage.trim() === commitDetails.commit.message) {
        return; // 用户取消或没有修改
      }

      // 执行编辑操作
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Editing commit message...",
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.amendCommitMessage(
            hash,
            newMessage.trim()
          );
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          "Commit message updated successfully"
        );
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to edit commit message: ${errorMessage}`
      );
    }
  }

  // 删除了_checkCommitEditable方法，现在直接使用预计算的canEditMessage值

  /**
   * 发送当前用户信息到WebView
   */
  private async _sendCurrentUser() {
    if (!this._view) return;

    try {
      const currentUser = await this._gitHistoryProvider.getCurrentUser();
      this._view.webview.postMessage({
        type: "currentUser",
        data: currentUser,
      });
    } catch (error) {
      console.error("Error getting current user:", error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to get current user: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  /**
   * 处理重置自动暂存偏好设置
   */
  private async _handleResetAutoStashPreference() {
    try {
      const result = await this._gitHistoryProvider.resetAutoStashPreference();
      if (result) {
        // 成功重置，刷新视图
        this.refresh(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`重置偏好设置失败: ${errorMessage}`);
    }
  }

  /**
   * 释放资源
   */
  public dispose() {
    for (const disposable of this._contentProviders.values()) {
      disposable.dispose();
    }
    this._contentProviders.clear();

    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }
  }
}
