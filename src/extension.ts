import * as vscode from "vscode";
import { GitHistoryProvider } from "./gitHistoryProvider";
import { GitHistoryViewProvider } from "./gitHistoryViewProvider";
import { GitBlameProvider } from "./gitBlameProvider";
import { GitBlameDecorator } from "./gitBlameDecorator";

export function activate(context: vscode.ExtensionContext) {
  console.log("GUI Git extension is now active!");

  // 创建Git历史数据提供者
  const gitHistoryProvider = new GitHistoryProvider();

  // 创建Git历史视图提供者
  const gitHistoryViewProvider = new GitHistoryViewProvider(
    context.extensionUri,
    gitHistoryProvider
  );

  // 创建Git blame提供者和装饰器
  const gitBlameProvider = new GitBlameProvider();
  const gitBlameDecorator = new GitBlameDecorator(gitBlameProvider);

  // 注册webview视图
  const provider = vscode.window.registerWebviewViewProvider(
    "guigit.historyView",
    gitHistoryViewProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  // 注册命令
  const showHistoryCommand = vscode.commands.registerCommand(
    "guigit.showHistory",
    () => {
      vscode.commands.executeCommand("workbench.view.extension.guigit");
    }
  );

  const refreshCommand = vscode.commands.registerCommand(
    "guigit.refresh",
    () => {
      gitHistoryViewProvider.refresh();
    }
  );

  // 注册Git blame相关命令
  const toggleBlameCommand = vscode.commands.registerCommand(
    "guigit.toggleBlame",
    () => {
      gitBlameDecorator.toggleBlame();
    }
  );

  const showCommitDetailsCommand = vscode.commands.registerCommand(
    "guigit.showCommitDetails",
    async (commitHash: string) => {
      if (!commitHash) {
        vscode.window.showErrorMessage("No commit hash provided");
        return;
      }

      try {
        const commitDetails = await gitBlameProvider.getCommitDetails(commitHash);
        if (commitDetails) {
          const panel = vscode.window.createWebviewPanel(
            'commitDetails',
            `Commit ${commitHash.substring(0, 7)}`,
            vscode.ViewColumn.One,
            {
              enableScripts: true,
              retainContextWhenHidden: true
            }
          );

          panel.webview.html = getCommitDetailsHtml(commitDetails);
        } else {
          vscode.window.showErrorMessage("Failed to get commit details");
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
      }
    }
  );

  // 监听Git仓库变化
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (gitExtension) {
    const git = gitExtension.exports.getAPI(1);
    
    // 创建防抖刷新函数，避免频繁刷新
    let refreshTimeout: NodeJS.Timeout | undefined;
    const debouncedRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      refreshTimeout = setTimeout(() => {
        gitHistoryViewProvider.refresh();
      }, 1000); // 1秒防抖延迟
    };
    
    // 监听Git状态变化（减少频率）
    git.onDidChangeState(debouncedRefresh);
    
    // 监听新仓库打开
    git.onDidOpenRepository((repo: any) => {
      // 监听仓库状态变化（使用防抖）
      if (repo.state && repo.state.onDidChange) {
        repo.state.onDidChange(debouncedRefresh);
      }
    });
    
    // 对已存在的仓库也添加监听（使用防抖）
    git.repositories.forEach((repo: any) => {
      if (repo.state && repo.state.onDidChange) {
        repo.state.onDidChange(debouncedRefresh);
      }
    });
  }
  
  // 监听关键的Git文件变化（减少监听范围）
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    // 只监听关键的Git文件，而不是整个.git目录
    const gitHeadWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolders[0], '.git/HEAD')
    );
    const gitRefsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolders[0], '.git/refs/**')
    );
    
    // 创建防抖刷新函数
    let gitFileRefreshTimeout: NodeJS.Timeout | undefined;
    const debouncedGitFileRefresh = () => {
      if (gitFileRefreshTimeout) {
        clearTimeout(gitFileRefreshTimeout);
      }
      gitFileRefreshTimeout = setTimeout(() => {
        gitHistoryViewProvider.refresh();
      }, 500); // 500ms防抖延迟
    };
    
    gitHeadWatcher.onDidChange(debouncedGitFileRefresh);
    gitRefsWatcher.onDidChange(debouncedGitFileRefresh);
    gitRefsWatcher.onDidCreate(debouncedGitFileRefresh);
    gitRefsWatcher.onDidDelete(debouncedGitFileRefresh);
    
    context.subscriptions.push(gitHeadWatcher, gitRefsWatcher);
  }

  context.subscriptions.push(
    provider, 
    showHistoryCommand, 
    refreshCommand,
    toggleBlameCommand,
    showCommitDetailsCommand,
    gitBlameDecorator
  );
}

/**
 * 生成提交详情的HTML内容
 */
function getCommitDetailsHtml(commitDetails: {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  body: string;
}): string {
  const formattedDate = commitDetails.date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Commit Details</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                line-height: 1.6;
            }
            .commit-header {
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 15px;
                margin-bottom: 20px;
            }
            .commit-hash {
                font-family: var(--vscode-editor-font-family);
                background-color: var(--vscode-textBlockQuote-background);
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.9em;
            }
            .commit-message {
                font-size: 1.2em;
                font-weight: bold;
                margin: 10px 0;
            }
            .commit-meta {
                color: var(--vscode-descriptionForeground);
                margin: 5px 0;
            }
            .commit-body {
                margin-top: 20px;
                white-space: pre-wrap;
                background-color: var(--vscode-textBlockQuote-background);
                padding: 15px;
                border-radius: 4px;
                border-left: 4px solid var(--vscode-textBlockQuote-border);
            }
            .label {
                font-weight: bold;
                color: var(--vscode-foreground);
            }
        </style>
    </head>
    <body>
        <div class="commit-header">
            <div class="commit-message">${escapeHtml(commitDetails.message)}</div>
            <div class="commit-meta">
                <span class="label">提交哈希:</span> 
                <span class="commit-hash">${commitDetails.hash}</span>
            </div>
            <div class="commit-meta">
                <span class="label">作者:</span> ${escapeHtml(commitDetails.author)} &lt;${escapeHtml(commitDetails.email)}&gt;
            </div>
            <div class="commit-meta">
                <span class="label">提交时间:</span> ${formattedDate}
            </div>
        </div>
        ${commitDetails.body ? `
        <div class="commit-body">
            <div class="label">详细描述:</div>
            ${escapeHtml(commitDetails.body)}
        </div>
        ` : ''}
    </body>
    </html>
  `;
}

/**
 * HTML转义函数
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function deactivate() {}
