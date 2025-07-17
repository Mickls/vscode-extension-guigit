import * as vscode from "vscode";
import { GitHistoryProvider } from "./gitHistoryProvider";
import { GitHistoryViewProvider } from "./gitHistoryViewProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log("GUI Git extension is now active!");

  // 创建Git历史数据提供者
  const gitHistoryProvider = new GitHistoryProvider();

  // 创建Git历史视图提供者
  const gitHistoryViewProvider = new GitHistoryViewProvider(
    context.extensionUri,
    gitHistoryProvider
  );

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

  // 监听Git仓库变化
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (gitExtension) {
    const git = gitExtension.exports.getAPI(1);
    
    // 监听Git状态变化
    git.onDidChangeState(() => {
      gitHistoryViewProvider.refresh();
    });
    
    // 监听新仓库打开
    git.onDidOpenRepository((repo: any) => {
      // 监听仓库状态变化
      if (repo.state && repo.state.onDidChange) {
        repo.state.onDidChange(() => {
          gitHistoryViewProvider.refresh();
        });
      }
    });
    
    // 对已存在的仓库也添加监听
    git.repositories.forEach((repo: any) => {
      if (repo.state && repo.state.onDidChange) {
        repo.state.onDidChange(() => {
          gitHistoryViewProvider.refresh();
        });
      }
    });
  }
  
  // 监听文件系统变化（作为备用方案）
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const gitDirWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolders[0], '.git/**')
    );
    
    gitDirWatcher.onDidChange(() => {
      gitHistoryViewProvider.refresh();
    });
    
    gitDirWatcher.onDidCreate(() => {
      gitHistoryViewProvider.refresh();
    });
    
    gitDirWatcher.onDidDelete(() => {
      gitHistoryViewProvider.refresh();
    });
    
    context.subscriptions.push(gitDirWatcher);
  }

  context.subscriptions.push(provider, showHistoryCommand, refreshCommand);
}

export function deactivate() {}
