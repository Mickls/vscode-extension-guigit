import * as vscode from "vscode";
import { GitHistoryProvider } from "./providers/git/gitHistoryProvider";
import { GitHistoryViewProvider } from "./views/gitHistoryViewProvider";
import { GitBlameProvider } from "./providers/blame/gitBlameProvider";
import { GitBlameDecorator } from "./decorators/gitBlameDecorator";

export function activate(context: vscode.ExtensionContext) {
  console.log("GUI Git extension is now active!");

  // 创建Git历史数据提供者
  const gitHistoryProvider = new GitHistoryProvider();

  // 创建Git历史视图提供者
  const gitHistoryViewProvider = new GitHistoryViewProvider(
    context.extensionUri,
    gitHistoryProvider,
    context.workspaceState
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

  // 新增：查看文件历史命令（资源管理器/编辑器右键）
  const viewFileHistoryCommand = vscode.commands.registerCommand(
    "guigit.viewFileHistory",
    async (resource?: vscode.Uri) => {
      await gitHistoryViewProvider.showFileHistoryForUri(resource);
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
        return;
      }
      const commitDetails = await gitHistoryProvider.getCommitDetails(commitHash);
      if (!commitDetails) {
        vscode.window.showErrorMessage("Commit details not found");
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "guigit.commitDetails",
        `Commit Details: ${commitDetails.commit.hash.substring(0, 7)}`,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      panel.webview.html = getCommitDetailsHtml({
        hash: commitDetails.commit.hash,
        author: commitDetails.commit.author,
        email: commitDetails.commit.email,
        date: new Date(commitDetails.commit.date),
        message: commitDetails.commit.message,
        body: commitDetails.commit.body,
      });
    }
  );

  // 统一刷新函数，防抖处理
  const refreshDelay = 500; // 500ms 防抖
  let refreshTimeout: NodeJS.Timeout | undefined;
  function unifiedDebouncedRefresh(reason: string) {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      gitHistoryViewProvider.refresh();
    }, refreshDelay);
  }

  // 监听扩展激活
  const onDidChangeActiveTextEditorDisposable = vscode.window.onDidChangeActiveTextEditor(
    () => {
      unifiedDebouncedRefresh('active editor changed');
    }
  );
  context.subscriptions.push(onDidChangeActiveTextEditorDisposable);

  // 监听Git扩展和仓库事件
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (gitExtension) {
    const git = gitExtension.exports.getAPI(1);
    
    // 监听新仓库打开
    git.onDidOpenRepository((repo: any) => {
      // 仓库首次打开时刷新
      setTimeout(() => {
        gitHistoryViewProvider.refresh();
      }, 1000);
      
      // 为新打开的仓库添加状态变化监听
      if (repo && repo.state && repo.state.onDidChange) {
        const stateChangeDisposable = repo.state.onDidChange(() => {
          unifiedDebouncedRefresh('repository state change');
        });
        context.subscriptions.push(stateChangeDisposable);
      }
    });
    
    // 为已存在的仓库添加状态变化监听
    git.repositories.forEach((repo: any) => {
      if (repo && repo.state && repo.state.onDidChange) {
        const stateChangeDisposable = repo.state.onDidChange(() => {
          unifiedDebouncedRefresh('repository state change');
        });
        context.subscriptions.push(stateChangeDisposable);
      }
    });
  }
  
  // 监听Git文件系统变化
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    // 监听HEAD文件变化（分支切换）
    const gitHeadWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolders[0], '.git/HEAD')
    );
    gitHeadWatcher.onDidChange(() => unifiedDebouncedRefresh('HEAD file change'));
    context.subscriptions.push(gitHeadWatcher);

    // 监听refs/heads 变化（分支更新）
    const gitRefsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolders[0], '.git/refs/heads/**')
    );
    gitRefsWatcher.onDidChange(() => unifiedDebouncedRefresh('refs changed'));
    gitRefsWatcher.onDidCreate(() => unifiedDebouncedRefresh('refs created'));
    gitRefsWatcher.onDidDelete(() => unifiedDebouncedRefresh('refs deleted'));
    context.subscriptions.push(gitRefsWatcher);
  }

  context.subscriptions.push(
    provider,
    showHistoryCommand,
    refreshCommand,
    viewFileHistoryCommand,
    toggleBlameCommand,
    showCommitDetailsCommand
  );
}

export function deactivate() {}

function getCommitDetailsHtml(commitDetails: {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  body: string;
}): string {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Commit Details</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; padding: 16px; }
      .header { margin-bottom: 12px; }
      .hash { font-family: monospace; color: #888; }
      .author { font-weight: bold; }
      .date { color: #666; }
      .message { margin-top: 12px; font-size: 1.1em; }
      .body { margin-top: 12px; white-space: pre-wrap; border-top: 1px solid #eee; padding-top: 12px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="hash">${commitDetails.hash}</div>
      <div><span class="author">${escapeHtml(commitDetails.author)}</span> &lt;${escapeHtml(commitDetails.email)}&gt;</div>
      <div class="date">${commitDetails.date.toLocaleString()}</div>
    </div>
    <div class="message">${escapeHtml(commitDetails.message)}</div>
    <div class="body">${escapeHtml(commitDetails.body)}</div>
  </body>
  </html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
