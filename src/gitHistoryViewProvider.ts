import * as vscode from "vscode";
import { GitHistoryProvider, GitCommit } from "./gitHistoryProvider";

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
    private readonly _gitHistoryProvider: GitHistoryProvider
  ) {}

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
          await this._sendCommitHistory(data.branch, data.skip);
          break;
        case "getTotalCommitCount":
          await this._sendTotalCommitCount(data.branch);
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
          await this._showCompareFileDiff(data.fromHash, data.toHash, data.file);
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
      }
    });

    // 初始化加载数据
    this._sendBranches();
    this._sendCommitHistory();
    this._sendViewMode();
  }

  /**
   * 刷新Git历史视图
   * 使用防抖机制避免频繁刷新
   */
  public refresh() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }

    this._refreshTimeout = setTimeout(() => {
      if (this._view) {
        // 清理后端缓存
        this._gitHistoryProvider.clearCache();
        this._sendBranches();
        this._sendCommitHistory();
      }
    }, 300);
  }

  /**
   * 发送分支列表到WebView
   */
  private async _sendBranches() {
    if (!this._view) return;

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
   */
  private async _sendCommitHistory(branch?: string, skip: number = 0) {
    if (!this._view) return;

    try {
      const commits = await this._gitHistoryProvider.getCommitHistory(
        branch,
        50,
        skip
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
   * 发送提交总数到WebView
   * @param branch 分支名称
   */
  private async _sendTotalCommitCount(branch?: string) {
    if (!this._view) return;

    try {
      const totalCount = await this._gitHistoryProvider.getTotalCommitCount(
        branch
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
        });
      }
    } catch (error) {
      console.error(`Error getting commit details for ${hash}:`, error);
      this._view.webview.postMessage({
        type: "error",
        message: `Failed to load commit details: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
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
        this.refresh();
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
        this.refresh();
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
        this.refresh();
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
    const hashes = commits.map(c => c.hash);
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
      this.refresh();
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
  private async _showCompareFileDiff(fromHash: string, toHash: string, filePath: string) {
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
        vscode.window.showInformationMessage(`No changes in ${filePath} between these commits`);
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
                            <select id="branchSelect" class="branch-select">
                                <option value="">All branches</option>
                            </select>
                        </div>
                        <div class="header-right">
                            <div class="git-operations">
                                <button id="pullBtn" class="git-btn" title="Pull (Ctrl+Click for advanced options)">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M7.5 6.5V1h1v5.5l1.5-1.5.707.707L8 8.414 5.293 5.707 6 5l1.5 1.5z"/>
                                        <path d="M2 10v3h12v-3h1v4H1v-4h1z"/>
                                    </svg>
                                    Pull
                                </button>
                                <button id="pushBtn" class="git-btn" title="Push (Ctrl+Click for advanced options)">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8.5 9.5V15h-1V9.5L6 11l-.707-.707L8 7.586l2.707 2.707L10 11l-1.5-1.5z"/>
                                        <path d="M14 6V3H2v3H1V2h14v4h-1z"/>
                                    </svg>
                                    Push
                                </button>
                                <button id="fetchBtn" class="git-btn" title="Fetch">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM7 3v6L5.5 7.5 4.793 8.207 8 11.414l3.207-3.207L10.5 7.5 9 9V3H7z"/>
                                    </svg>
                                    Fetch
                                </button>
                                <button id="cloneBtn" class="git-btn" title="Clone">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v10h10V3H3z"/>
                                        <path d="M5 5h6v1H5V5zm0 2h6v1H5V7zm0 2h4v1H5V9z"/>
                                    </svg>
                                    Clone
                                </button>
                                <button id="checkoutBtn" class="git-btn" title="Checkout">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM4.5 7.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H4.5z"/>
                                    </svg>
                                    Checkout
                                </button>
                            </div>
                            <div class="header-controls">
                                <button id="jumpToHeadBtn" class="icon-btn" title="Jump to HEAD">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 1l3 3-3 3V5H3v2h5v2L5 6l3-3V1z"/>
                                        <path d="M13 8v5H3V8h2v3h6V8h2z"/>
                                    </svg>
                                </button>
                                <button id="refreshBtn" class="icon-btn" title="Refresh">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                                        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                                    </svg>
                                </button>
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
                                <button class="panel-collapse-btn" id="leftCollapseBtn" title="Collapse panel">‹</button>
                            </div>
                            <div class="loading">Loading commits...</div>
                        </div>
                        
                        <div class="resizer" id="resizer"></div>
                        
                        <div class="commit-details" id="commitDetails">
                            <div class="panel-header">
                                <button class="panel-collapse-btn" id="rightCollapseBtn" title="Collapse panel">›</button>
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
                    <div class="menu-item" data-action="copyHash">Copy Hash</div>
                    <div class="menu-item" data-action="cherryPick">Cherry Pick</div>
                    <div class="menu-item" data-action="revert">Revert</div>
                    <div class="menu-separator"></div>
                    <div class="menu-item" data-action="compare" id="compareMenuItem">Compare Selected</div>
                    <div class="menu-item" data-action="squash" id="squashMenuItem">Squash Commits</div>
                    <div class="menu-separator"></div>
                    <div class="menu-item" data-action="createBranch">Create Branch from Here</div>
                    <div class="menu-item" data-action="pushToCommit">Push All Commits to Here</div>
                    <div class="menu-separator"></div>
                    <div class="menu-item" data-action="resetSoft">Reset (Soft)</div>
                    <div class="menu-item" data-action="resetMixed">Reset (Mixed)</div>
                    <div class="menu-item" data-action="resetHard">Reset (Hard)</div>
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
          return await this._gitHistoryProvider.pullFromRemote();
        }
      );

      if (result) {
        vscode.window.showInformationMessage("Successfully pulled from remote");
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
          return await this._gitHistoryProvider.fetchFromRemote();
        }
      );

      if (result) {
        vscode.window.showInformationMessage("Successfully fetched from remote");
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
      const errorMessage = error instanceof Error ? error.message : String(error);
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
          title: isNewBranch ? `Creating and checking out branch ${targetBranch}...` : `Checking out branch ${targetBranch}...`,
          cancellable: false,
        },
        async () => {
          if (isNewBranch) {
            return await this._gitHistoryProvider.createAndCheckoutBranch(targetBranch);
          } else {
            return await this._gitHistoryProvider.checkoutBranch(targetBranch);
          }
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          isNewBranch ? `Successfully created and checked out branch: ${targetBranch}` : `Successfully checked out branch: ${targetBranch}`
        );
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Pull高级选项
   */
  private async _handleGitPullAdvanced() {
    try {
      // 获取所有远程分支列表
      const remoteBranches = await this._gitHistoryProvider.getAllRemoteBranches();
      if (remoteBranches.length === 0) {
        vscode.window.showErrorMessage("No remote branches found");
        return;
      }

      // 选择远程分支
      const selectedBranch = await vscode.window.showQuickPick(remoteBranches, {
        placeHolder: "Select remote branch to pull from (e.g., origin/master)",
        canPickMany: false,
      });

      if (!selectedBranch) {
        return;
      }

      // 选择操作类型
      const operation = await vscode.window.showQuickPick(
        [
          { label: "Pull (merge)", value: "pull" },
          { label: "Pull with rebase", value: "rebase" },
        ],
        {
          placeHolder: "Select pull operation",
          canPickMany: false,
        }
      );

      if (!operation) {
        return;
      }

      const isRebase = operation.value === "rebase";
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${isRebase ? 'Pulling with rebase' : 'Pulling'} from ${selectedBranch}...`,
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.pullFromFullRemoteBranch(
            selectedBranch,
            isRebase
          );
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          `Successfully ${isRebase ? 'pulled with rebase' : 'pulled'} from ${selectedBranch}`
        );
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 处理Git Push高级选项
   */
  private async _handleGitPushAdvanced() {
    try {
      // 获取所有远程分支列表
      const remoteBranches = await this._gitHistoryProvider.getAllRemoteBranches();
      
      // 添加"新建分支"选项
      const branchOptions = [...remoteBranches, "+ Create new branch"];
      
      // 选择目标分支
      const selectedOption = await vscode.window.showQuickPick(branchOptions, {
        placeHolder: "Select target branch or create new one (e.g., origin/master)",
        canPickMany: false,
      });

      if (!selectedOption) {
        return;
      }

      let targetBranch: string;
      if (selectedOption === "+ Create new branch") {
        // 创建新分支 - 需要用户输入完整的远程分支名称
        const newBranchName = await vscode.window.showInputBox({
          prompt: "Enter new remote branch name (format: remote/branch)",
          placeHolder: "origin/new-branch-name",
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "Branch name is required";
            }
            if (!value.includes('/')) {
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

      // 选择推送选项
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

      const isForce = pushOptions.value === "force";
      
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

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${isForce ? 'Force pushing' : 'Pushing'} to ${targetBranch}...`,
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
          `Successfully ${isForce ? 'force pushed' : 'pushed'} to ${targetBranch}`
        );
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
          title: `Creating branch '${branchName}' from commit ${hash.substring(0, 8)}...`,
          cancellable: false,
        },
        async () => {
          return await this._gitHistoryProvider.createBranchFromCommit(hash, branchName);
        }
      );

      if (result) {
        const checkoutResult = await vscode.window.showInformationMessage(
          `Successfully created branch '${branchName}' from commit ${hash.substring(0, 8)}`,
          "Checkout branch",
          "Stay on current branch"
        );
        
        if (checkoutResult === "Checkout branch") {
          await this._gitHistoryProvider.checkoutBranch(branchName);
          vscode.window.showInformationMessage(`Checked out to branch '${branchName}'`);
        }
        
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * 推送此前所有提交到指定分支
   */
  private async _pushAllCommitsToHere(hash: string) {
    try {
      // 获取所有远程分支列表
      const remoteBranches = await this._gitHistoryProvider.getAllRemoteBranches();
      
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
            if (!value.includes('/')) {
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
        `This will push all commits up to ${hash.substring(0, 8)} to ${targetBranch}. Continue?`,
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
          return await this._gitHistoryProvider.pushCommitsToRemoteBranch(hash, targetBranch);
        }
      );

      if (result) {
        vscode.window.showInformationMessage(
          `Successfully pushed commits to ${targetBranch}`
        );
        this.refresh();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMessage);
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
