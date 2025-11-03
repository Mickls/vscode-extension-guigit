import * as vscode from "vscode";
import { GitHistoryProvider } from "../providers/git/gitHistoryProvider";
import { GitCommit } from "../providers/git/types/gitTypes";
import { LanguageService } from "../services/languageService";
import { i18n } from "../utils/i18n";
import * as path from "path";

/**
 * Git历史视图提供者，负责管理Git历史的WebView界面
 */
export class GitHistoryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "guigit.historyView";
  private _view?: vscode.WebviewView;
  private _refreshTimeout?: NodeJS.Timeout;
  private _contentProviders: Map<string, vscode.Disposable> = new Map();

  private _languageChangeListener: vscode.Disposable | undefined;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _gitHistoryProvider: GitHistoryProvider,
    private readonly _state: vscode.Memento
  ) {
    // 确保语言服务在实例化时初始化
    const languageService = LanguageService.getInstance();
    
    // 监听语言变化
    this._languageChangeListener = languageService.onLanguageChange(() => {
      this.refreshViewWithNewLanguage();
    });
  }

  /**
   * 从资源URI显示该文件的历史（供命令调用）
   */
  public async showFileHistoryForUri(resource?: vscode.Uri) {
    try {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri || uri.scheme !== "file") {
        vscode.window.showErrorMessage(i18n.t("errors.noLocalFile"));
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
        vscode.window.showErrorMessage(i18n.t("errors.repositoryNotFound"));
        return;
      }

      const currentRepo = this._gitHistoryProvider.getCurrentRepository();
      if (!currentRepo || currentRepo.path !== targetRepo.path) {
        await this._gitHistoryProvider.setCurrentRepository(targetRepo);
      }

      // 转为仓库相对路径以兼容git命令
      let relativePath = path.relative(targetRepo.path, fileFsPath);
      if (!relativePath || relativePath.startsWith("..")) {
        vscode.window.showErrorMessage(i18n.t("errors.fileNotInRepo"));
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

    // 确保语言服务已初始化
    LanguageService.getInstance();
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
        case "notify": {
          const level = data.level as "info" | "warn" | "error";
          const msg = typeof data.message === "string" ? data.message : "";
          if (!msg) break;
          if (level === "error") vscode.window.showErrorMessage(msg);
          else if (level === "warn") vscode.window.showWarningMessage(msg);
          else vscode.window.showInformationMessage(msg);
          break;
        }
        case "branchSwitchSuggestion": {
          const { hash, branches } = data as { hash: string; branches: string[] };
          if (!hash || !Array.isArray(branches) || branches.length === 0) {
            break;
          }
          const buttons = branches.map((b: string) => ({ title: `切换到 ${b}` }));
          vscode.window
            .showInformationMessage(
              `提交 ${hash.substring(0, 8)} 存在于其他分支，选择一个分支进行跳转`,
              ...buttons
            )
            .then((selection) => {
              if (!selection) return;
              const idx = buttons.findIndex((b) => b.title === selection.title);
              if (idx >= 0) {
                const targetBranch = branches[idx];
                this._view?.webview.postMessage({
                  type: "switchToBranchAndJump",
                  branchName: targetBranch,
                  hash,
                });
              }
            });
          break;
        }
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
        case "configureProxy":
          await this._handleConfigureProxy();
          break;
        case "currentFilterState":
          await this._initializeViewWithFilter(data.filterState);
          break;
        case "generateGitGraph":
          await this._sendGitGraphData(data.commits);
          break;
        case "changeLanguage":
          await this._handleChangeLanguage();
          break;
        // 删除了checkCommitEditable处理，现在直接使用预计算的canEditMessage值
      }
    });

    // 检查Git仓库状态并初始化加载数据
    this._initializeView();
  }

  /**
   * 处理查看代理状态操作
   */
  private async _handleRefreshProxy() {
    try {
      let configSource = "";
      let proxyConfig: any = null;
      
      // 获取当前代理配置信息
      const { ProxyManager } = await import("../services/proxyManager");
      const proxyManager = ProxyManager.getInstance();
      
      // 刷新配置缓存
      proxyManager.clearCache();
      
      configSource = await proxyManager.getProxyConfigSource();
      proxyConfig = await proxyManager.getProxyConfig();

      // 构建详细的配置信息
      let configDetails = `📋 代理配置状态\n\n`;
      configDetails += `🔍 配置来源: ${configSource}\n`;
      
      if (proxyConfig.enabled) {
        configDetails += `✅ 状态: 已启用\n`;
        if (proxyConfig.http) {
          configDetails += `🌐 HTTP代理: ${proxyConfig.http}\n`;
        }
        if (proxyConfig.https) {
          configDetails += `🔒 HTTPS代理: ${proxyConfig.https}\n`;
        }
        if (proxyConfig.noProxy) {
          configDetails += `🚫 排除主机: ${proxyConfig.noProxy}\n`;
        }
      } else {
        configDetails += `❌ 状态: 未启用代理\n`;
        configDetails += `💡 提示: 可通过 "Configure Proxy" 启用自定义代理`;
      }

      // 直接显示详细信息
      vscode.window.showInformationMessage(configDetails);

    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `${i18n.t("errors.proxyStatusFailed")}: ${errorMessage}`
      );
    }
  }

  /**
   * 处理代理配置操作
   */
  private async _handleConfigureProxy() {
    try {
      const config = vscode.workspace.getConfiguration("guigit.proxy");
      const currentEnabled = config.get<boolean>("enabled", false);
      const currentHttp = config.get<string>("http", "");
      const currentHttps = config.get<string>("https", "");
      const currentNoProxy = config.get<string>("noProxy", "");

      // 询问是否启用自定义代理
      const enabledOptions = [
        { label: "启用自定义代理", value: true },
        { label: "禁用自定义代理", value: false }
      ];
      
      const enabledChoice = await vscode.window.showQuickPick(
        enabledOptions.map(opt => ({
          label: opt.label,
          picked: opt.value === currentEnabled
        })),
        {
          placeHolder: "选择代理配置模式",
          canPickMany: false
        }
      );

      if (!enabledChoice) return;

      const enabled = enabledOptions.find(opt => opt.label === enabledChoice.label)?.value || false;
      
      await config.update("enabled", enabled, vscode.ConfigurationTarget.Global);

      if (enabled) {
        // 配置HTTP代理
        const httpProxy = await vscode.window.showInputBox({
          prompt: "输入HTTP代理地址",
          placeHolder: "例如: http://127.0.0.1:7890",
          value: currentHttp,
          validateInput: (value) => {
            if (value && !value.match(/^https?:\/\/.+/)) {
              return "请输入有效的HTTP代理地址 (以http://或https://开头)";
            }
            return null;
          }
        });

        if (httpProxy !== undefined) {
          await config.update("http", httpProxy, vscode.ConfigurationTarget.Global);
        }

        // 配置HTTPS代理
        const httpsProxy = await vscode.window.showInputBox({
          prompt: "输入HTTPS代理地址 (留空则使用HTTP代理)",
          placeHolder: "例如: http://127.0.0.1:7890",
          value: currentHttps,
          validateInput: (value) => {
            if (value && !value.match(/^https?:\/\/.+/)) {
              return "请输入有效的HTTPS代理地址 (以http://或https://开头)";
            }
            return null;
          }
        });

        if (httpsProxy !== undefined) {
          await config.update("https", httpsProxy, vscode.ConfigurationTarget.Global);
        }

        // 配置No Proxy
        const noProxy = await vscode.window.showInputBox({
          prompt: "输入不使用代理的主机列表 (可选)",
          placeHolder: "例如: localhost,127.0.0.1,.local",
          value: currentNoProxy
        });

        if (noProxy !== undefined) {
          await config.update("noProxy", noProxy, vscode.ConfigurationTarget.Global);
        }

        const action = await vscode.window.showInformationMessage(
          "✅ 代理配置已保存并生效",
          "查看状态"
        );
        
        if (action === "查看状态") {
          await this._handleRefreshProxy();
        }
      } else {
        vscode.window.showInformationMessage("❌ 已禁用自定义代理配置，将使用自动检测");
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${i18n.t("errors.proxyConfigFailed")}: ${errorMessage}`);
    }
  }

  /**
   * 初始化视图
   */
  private async _initializeView() {
    if (!this._view) return;

    try {
      console.log("Initializing Git History view...");
      
      // 等待Git扩展完全激活
      await this._ensureGitExtensionReady();
      
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

      console.log("Git repository found, loading data...");
      
      // 有Git仓库，按顺序初始化以减少并发压力
      // 添加小延迟确保每个操作都有时间完成
      await this._sendRepositories();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this._sendBranches();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this._sendCommitHistory();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await this._sendTotalCommitCount();
      this._sendViewMode();
      
      console.log("Git History view initialization completed");
    } catch (error) {
      console.error("Error during view initialization:", error);
      if (this._view) {
        this._view.webview.postMessage({
          type: "error",
          message: `Failed to initialize Git History view: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    }
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
   * 确保Git扩展已准备就绪
   */
  private async _ensureGitExtensionReady(): Promise<void> {
    const maxWaitTime = 10000; // 最多等待10秒
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const gitExtension = vscode.extensions.getExtension("vscode.git");
        if (!gitExtension) {
          throw new Error("Git extension not found");
        }

        // 确保Git扩展已激活
        if (!gitExtension.isActive) {
          console.log("Activating Git extension...");
          await gitExtension.activate();
        }

        const git = gitExtension.exports.getAPI(1);
        if (git && git.repositories) {
          console.log("Git extension is ready");
          return;
        }
      } catch (error) {
        console.log("Git extension not ready yet, waiting...", error);
      }
      
      // 等待500ms后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error("Git extension failed to initialize within timeout");
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
      // Git 未初始化时，发送空的分支列表，但不影响加载状态
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
   * 发送Git图表数据到WebView
   * @param commits 提交记录数组
   */
  private async _sendGitGraphData(commits: any[]) {
    if (!this._view) return;

    try {
      const gitGraph = await this._gitHistoryProvider.generateGitGraph(commits);
      
      this._view.webview.postMessage({
        type: "gitGraphData",
        data: gitGraph,
      });
    } catch (error) {
      console.error("Error generating git graph:", error);
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
      // Git 未初始化时，不要发送任何消息，让前端保持加载状态
      // 直到有真正的Git仓库数据
      return;
    }

    // 添加重试机制
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Loading commit history, attempt ${attempt}/${maxRetries}`);
        
        const commits = await this._gitHistoryProvider.getCommitHistory(
          branch,
          50,
          skip,
          authorFilter
        );

        // 生成 Git Graph 布局
        // 注意：这里只为当前批次的commits生成图表
        // 完整的图表将由前端在收到新数据后重新请求
        let gitGraph = null;
        if (skip === 0) {
          // 首次加载时生成图表
          gitGraph = await this._gitHistoryProvider.generateGitGraph(commits);
        }
        // 对于加载更多的情况，我们不在这里生成图表，
        // 而是让前端在合并数据后重新请求完整的图表

        this._view.webview.postMessage({
          type: "commitHistory",
          data: {
            commits,
            skip,
            hasMore: commits.length === 50,
            gitGraph,
          },
        });
        
        console.log(`Successfully loaded ${commits.length} commits on attempt ${attempt}`);
        return; // 成功，退出重试循环
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Error getting commit history (attempt ${attempt}/${maxRetries}):`, error);
        
        // 如果不是最后一次尝试，等待一段时间后重试
        if (attempt < maxRetries) {
          const delay = attempt * 500; // 递增延迟：500ms, 1000ms
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有重试都失败了，发送错误消息
    console.error("All retry attempts failed, sending error message");
    this._view.webview.postMessage({
      type: "error",
      message: `Failed to load commit history after ${maxRetries} attempts: ${
        lastError?.message || "Unknown error"
      }`,
    });
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
      // Git 未初始化时，不要发送任何消息，让前端保持加载状态
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
      // Git 未初始化时，不要发送任何消息，让前端保持加载状态
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
   * 在推送到非主分支后提醒创建 Pull Request
   */
  private async _promptForPullRequestCreation() {
    try {
      const branchName = (await this._gitHistoryProvider.getCurrentBranchName())?.trim();
      if (!branchName) {
        return;
      }

      const normalizedBranch = branchName.toLowerCase();
      if (normalizedBranch === "main" || normalizedBranch === "master") {
        return;
      }

      const remoteUrl = await this._gitHistoryProvider.getRemoteUrl();
      if (!remoteUrl) {
        return;
      }

      const pullRequestUrl = this._buildPullRequestUrl(remoteUrl, branchName);
      if (!pullRequestUrl) {
        return;
      }

      const countdownSeconds = 5;
      const message = i18n.t(
        "postPush.createPullRequestPrompt",
        branchName,
        countdownSeconds
      );
      const openAction = i18n.t("postPush.openPullRequestAction");
      const dismissAction = i18n.t("postPush.dismissAction");

      const selection = await this._showTimedInformationMessage(
        message,
        countdownSeconds * 1000,
        openAction,
        dismissAction
      );

      if (selection === openAction) {
        await vscode.env.openExternal(vscode.Uri.parse(pullRequestUrl));
      }
    } catch (error) {
      console.warn("Failed to prompt for pull request creation:", error);
    }
  }

  /**
   * 构建远程仓库的创建 Pull Request URL
   */
  private _buildPullRequestUrl(remoteUrl: string, branchName: string): string | null {
    const trimmedRemote = remoteUrl.trim();
    const encodedBranch = encodeURIComponent(branchName);

    if (trimmedRemote.includes("github.com")) {
      const match = trimmedRemote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      if (match) {
        return `https://github.com/${match[1]}/compare/${encodedBranch}?expand=1`;
      }
    } else if (trimmedRemote.includes("gitlab.com")) {
      const match = trimmedRemote.match(/gitlab\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      if (match) {
        return `https://gitlab.com/${match[1]}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodedBranch}`;
      }
    } else if (trimmedRemote.includes("bitbucket.org")) {
      const match = trimmedRemote.match(/bitbucket\.org[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      if (match) {
        return `https://bitbucket.org/${match[1]}/pull-requests/new?source=${encodedBranch}`;
      }
    }

    return null;
  }

  /**
   * 显示带超时自动关闭的提示消息
   */
  private async _showTimedInformationMessage<T extends string>(
    message: string,
    timeoutMs: number,
    ...actions: T[]
  ): Promise<T | undefined> {
    let dismissed = false;

    const timer = setTimeout(() => {
      if (!dismissed) {
        dismissed = true;
        void vscode.commands.executeCommand("workbench.action.closeMessages");
      }
    }, timeoutMs);

    try {
      const selection = await vscode.window.showInformationMessage(message, ...actions);
      dismissed = true;
      return selection as T | undefined;
    } finally {
      clearTimeout(timer);
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
   * 跳转到指定的提交
   * @param hash 提交哈希
   */
  public jumpToCommit(hash: string) {
    this._jumpToCommitInMainView(hash);
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
        toggleGraph: "git-branch",
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
        title: i18n.t("pullTooltip"),
      },
      {
        id: "pushBtn",
        action: "push",
        title: i18n.t("pushTooltip"),
      },
      { id: "fetchBtn", action: "fetch", title: i18n.t("fetchTooltip") },
      { id: "cloneBtn", action: "clone", title: i18n.t("cloneTooltip") },
      { id: "checkoutBtn", action: "checkout", title: i18n.t("checkoutTooltip") },
      {
        id: "settingsBtn",
        action: "settings",
        title: i18n.t("settingsTooltip"),
      },
    ];

    // 头部控制按钮配置
    const headerControls = [
      { id: "jumpToHeadBtn", action: "jumpToHead", title: i18n.t("jumpToHeadTooltip") },
      { id: "refreshBtn", action: "refresh", title: i18n.t("refreshTooltip") },
      { id: "toggleGraphBtn", action: "toggleGraph", title: i18n.t("toggleGraphTooltip") },
    ];

    // 上下文菜单项配置
    const contextMenuItems = [
      { action: "copyHash", label: i18n.t("contextMenu.copyHash") },
      { action: "cherryPick", label: i18n.t("contextMenu.cherryPick") },
      { action: "revert", label: i18n.t("contextMenu.revert") },
      { separator: true },
      {
        action: "editCommitMessage",
        label: i18n.t("contextMenu.editCommitMessage"),
        id: "editCommitMessageMenuItem",
      },
      { separator: true },
      { action: "compare", label: i18n.t("contextMenu.compareSelected"), id: "compareMenuItem" },
      { action: "squash", label: i18n.t("contextMenu.squashCommits"), id: "squashMenuItem" },
      { separator: true },
      { action: "createBranch", label: i18n.t("contextMenu.createBranch") },
      { action: "pushToCommit", label: i18n.t("contextMenu.pushToCommit") },
      { separator: true },
      { action: "resetSoft", label: i18n.t("contextMenu.resetSoft") },
      { action: "resetMixed", label: i18n.t("contextMenu.resetMixed") },
      { action: "resetHard", label: i18n.t("contextMenu.resetHard") },
    ];

    // 获取带有默认值的翻译
    const translateWithFallback = (key: string, fallback: string) => {
      const value = i18n.t(key);
      if (!value || value === key) {
        return fallback;
      }
      return value;
    };

    // 获取当前语言的所有翻译
    const currentTranslations = JSON.stringify(i18n.getTranslations());
    
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Git History</title>
                <script>
                    // i18n support for frontend
                    window.i18n = {
                        translations: ${currentTranslations},
                        t: function(key, ...args) {
                            const keys = key.split('.');
                            let value = this.translations;
                            
                            for (const k of keys) {
                                if (value && typeof value === 'object' && k in value) {
                                    value = value[k];
                                } else {
                                    return key;
                                }
                            }
                            
                            if (typeof value !== 'string') {
                                return key;
                            }
                            
                            if (args.length > 0) {
                                return value.replace(/\{(\d+)\}/g, (match, index) => {
                                    const idx = parseInt(index, 10);
                                    return args[idx] !== undefined ? String(args[idx]) : match;
                                });
                            }
                            
                            return value;
                        }
                    };
                </script>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="header-left">
                            <select id="repositorySelect" class="repository-select">
                            <!-- 仓库选项将通过JavaScript动态填充 -->
                        </select>
                            <select id="branchSelect" class="branch-select">
                                <option value="">${i18n.t("allBranches")}</option>
                            </select>
                            <div class="search-container">
                                <input type="text" id="commitSearchInput" class="commit-search-input" placeholder="${i18n.t("placeholderCommitMessage")}" />
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
                        <div class="left-panel">
                            <div class="git-graph-container" id="gitGraphContainer" style="display: block;">
                                <!-- Git Graph 将在这里渲染 -->
                            </div>
                            <div class="commit-list" id="commitList">
                                <div class="panel-header">
                                    <div class="commit-list-headers">
                                        <div class="header-hash">${translateWithFallback("headers.hash", "Hash")}</div>
                                        <div class="header-message">${translateWithFallback("headers.message", "Message")}</div>
                                        <div class="header-refs">${translateWithFallback("headers.tags", "Tags")}</div>
                                        <div class="header-author">${translateWithFallback("headers.author", "Author")}</div>
                                        <div class="header-date">${translateWithFallback("headers.date", "Date")}</div>
                                    </div>
                                    <button class="panel-collapse-btn" id="leftCollapseBtn" title="${translateWithFallback("collapseTooltip", "Collapse panel")}">
                                        ${getCodiconHtml("collapseLeft", "medium")}
                                    </button>
                                </div>
                                <div class="commit-list-content" id="commitListContent">
                                    <div class="loading">${translateWithFallback("loading", "Loading commits...")}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="resizer" id="resizer"></div>
                        
                        <div class="commit-details" id="commitDetails">
                            <div class="panel-header">
                                <button class="panel-collapse-btn" id="rightCollapseBtn" title="${translateWithFallback("collapseTooltip", "Collapse panel")}">
                                    ${getCodiconHtml("collapseRight", "medium")}
                                </button>
                            </div>
                            <div class="placeholder">${translateWithFallback("selectCommit", "Select a commit to view details")}</div>
                        </div>
                    </div>
                    
                    <div class="compare-panel" id="comparePanel" style="display: none;">
                        <div class="compare-header">
                            <h3>${i18n.t("headers.compareCommits")}</h3>
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
                        ${i18n.t("settingsMenu.resetStash")}
                    </div>
                    <div class="menu-separator"></div>
                    <div class="menu-item" data-action="configureProxy">
                        ${getCodiconHtml("settings-gear", "small")}
                        ${i18n.t("settingsMenu.configureProxy")}
                    </div>
                    <div class="menu-item" data-action="refreshProxy">
                        ${getCodiconHtml("info", "small")}
                        ${i18n.t("settingsMenu.refreshProxy")}
                    </div>
                    <div class="menu-separator"></div>
                    <div class="menu-item" data-action="changeLanguage">
                        ${getCodiconHtml("globe", "small")}
                        ${i18n.t("settingsMenu.changeLanguage")}
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
        void this._promptForPullRequestCreation();
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
        void this._promptForPullRequestCreation();
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
        void this._promptForPullRequestCreation();
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
   * 处理语言切换操作
   */
  private async _handleChangeLanguage() {
    try {
      const languageService = LanguageService.getInstance();
      await languageService.showLanguageSelector();
      
      // 刷新视图以应用新的语言设置
      this.refresh(true);
      
    } catch (error) {
      console.error("Error handling language change:", error);
      vscode.window.showErrorMessage(
        `Failed to change language: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * 释放资源
   */
  /**
   * 使用新语言刷新视图
   */
  private refreshViewWithNewLanguage() {
    if (this._view) {
      // 重新生成HTML内容
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
      
      // 重新初始化视图数据
      this._initializeView();
    }
  }

  public dispose() {
    for (const disposable of this._contentProviders.values()) {
      disposable.dispose();
    }
    this._contentProviders.clear();

    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }
    
    // 清理语言变化监听器
    if (this._languageChangeListener) {
      this._languageChangeListener.dispose();
    }
  }
}
