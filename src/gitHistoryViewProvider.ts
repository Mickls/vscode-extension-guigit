import * as vscode from 'vscode';
import { GitHistoryProvider, GitCommit } from './gitHistoryProvider';

export class GitHistoryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'guigit.historyView';
    private _view?: vscode.WebviewView;
    private _refreshTimeout?: NodeJS.Timeout;
    private _contentProviders: Map<string, vscode.Disposable> = new Map();

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gitHistoryProvider: GitHistoryProvider
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'getCommitHistory':
                    await this._sendCommitHistory(data.branch);
                    break;
                case 'getBranches':
                    await this._sendBranches();
                    break;
                case 'getCommitDetails':
                    await this._sendCommitDetails(data.hash);
                    break;
                case 'jumpToHead':
                    await this._jumpToHead();
                    break;
                case 'copyHash':
                    await vscode.env.clipboard.writeText(data.hash);
                    vscode.window.showInformationMessage('Commit hash copied to clipboard');
                    break;
                case 'cherryPick':
                    await this._cherryPickCommit(data.hash);
                    break;
                case 'revert':
                    await this._revertCommit(data.hash);
                    break;
                case 'reset':
                    await this._resetToCommit(data.hash, data.mode);
                    break;
                case 'compareCommits':
                    await this._compareCommits(data.hashes);
                    break;
                case 'showFileDiff':
                    await this._showFileDiff(data.hash, data.filePath);
                    break;
            }
        });

        // 初始化加载数据
        this._sendBranches();
        this._sendCommitHistory();
    }

    public refresh() {
        // 防抖机制，避免频繁刷新
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
        }
        
        this._refreshTimeout = setTimeout(() => {
            if (this._view) {
                this._sendBranches();
                this._sendCommitHistory();
            }
        }, 300); // 300ms防抖延迟
    }

    private async _sendBranches() {
        if (!this._view) return;
        
        const branches = await this._gitHistoryProvider.getBranches();
        this._view.webview.postMessage({
            type: 'branches',
            data: branches
        });
    }

    private async _sendCommitHistory(branch?: string) {
        if (!this._view) return;
        
        const commits = await this._gitHistoryProvider.getCommitHistory(branch);
        this._view.webview.postMessage({
            type: 'commitHistory',
            data: commits
        });
    }

    private async _sendCommitDetails(hash: string) {
        if (!this._view) return;
        
        try {
            console.log(`Getting commit details for: ${hash}`);
            const details = await this._gitHistoryProvider.getCommitDetails(hash);
            
            if (details) {
                console.log(`Successfully got details for commit: ${hash.substring(0, 8)}`);
                this._view.webview.postMessage({
                    type: 'commitDetails',
                    data: details
                });
            } else {
                console.log(`No details found for commit: ${hash.substring(0, 8)}`);
                this._view.webview.postMessage({
                    type: 'error',
                    message: `Failed to load commit details for ${hash.substring(0, 8)}`
                });
            }
        } catch (error) {
            console.error(`Error getting commit details for ${hash}:`, error);
            this._view.webview.postMessage({
                type: 'error',
                message: `Failed to load commit details: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }

    private async _jumpToHead() {
        if (!this._view) return;
        
        try {
            const headCommit = await this._gitHistoryProvider.getHeadCommit();
            this._view.webview.postMessage({
                type: 'jumpToHead',
                data: headCommit
            });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to get HEAD commit');
        }
    }

    private async _cherryPickCommit(hash: string) {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to cherry-pick commit ${hash.substring(0, 8)}?`,
            'Yes', 'No'
        );
        
        if (result === 'Yes') {
            const success = await this._gitHistoryProvider.cherryPickCommit(hash);
            if (success) {
                vscode.window.showInformationMessage('Cherry-pick completed successfully');
                this.refresh();
            }
        }
    }

    private async _revertCommit(hash: string) {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to revert commit ${hash.substring(0, 8)}?`,
            'Yes', 'No'
        );
        
        if (result === 'Yes') {
            const success = await this._gitHistoryProvider.revertCommit(hash);
            if (success) {
                vscode.window.showInformationMessage('Revert completed successfully');
                this.refresh();
            }
        }
    }

    private async _resetToCommit(hash: string, mode: 'soft' | 'mixed' | 'hard') {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to reset to commit ${hash.substring(0, 8)} (${mode})?`,
            'Yes', 'No'
        );
        
        if (result === 'Yes') {
            const success = await this._gitHistoryProvider.resetToCommit(hash, mode);
            if (success) {
                vscode.window.showInformationMessage(`Reset (${mode}) completed successfully`);
                this.refresh();
            }
        }
    }

    private async _compareCommits(hashes: string[]) {
        if (hashes.length !== 2) {
            vscode.window.showErrorMessage('Please select exactly 2 commits to compare');
            return;
        }

        const changes = await this._gitHistoryProvider.compareCommits(hashes[0], hashes[1]);
        this._view?.webview.postMessage({
            type: 'compareResult',
            data: {
                commits: hashes,
                changes: changes
            }
        });
    }

    private async _showFileDiff(hash: string, filePath: string) {
        try {
            // 获取工作区根目录
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            // 检查是否是初始提交
            const isInitialCommit = await this._gitHistoryProvider.isInitialCommit(hash);

            if (isInitialCommit) {
                // 对于初始提交，显示整个文件内容
                const fileContent = await this._gitHistoryProvider.getFileContent(hash, filePath);
                if (fileContent) {
                    // 创建一个临时文档来显示文件内容
                    const doc = await vscode.workspace.openTextDocument({
                        content: fileContent,
                        language: this._getLanguageFromFilePath(filePath)
                    });
                    await vscode.window.showTextDocument(doc, { 
                        preview: true,
                        viewColumn: vscode.ViewColumn.Beside
                    });
                } else {
                    vscode.window.showErrorMessage(`Failed to get file content for ${filePath}`);
                }
            } else {
                // 对于普通提交，直接使用自定义的差异显示方法
                await this._showCustomFileDiff(hash, filePath);
            }
        } catch (error) {
            console.error('Error showing file diff:', error);
            vscode.window.showErrorMessage(`Failed to show file diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async _showCustomFileDiff(hash: string, filePath: string) {
        try {
            // 获取文件的两个版本内容
            const oldContent = await this._gitHistoryProvider.getFileContent(`${hash}^`, filePath);
            const newContent = await this._gitHistoryProvider.getFileContent(hash, filePath);

            // 处理文件不存在的情况
            if (oldContent === null && newContent === null) {
                vscode.window.showErrorMessage(`Failed to get file content for ${filePath}`);
                return;
            }

            const baseFileName = filePath.split('/').pop() || 'file';
            const shortHash = hash.substring(0, 8);

            // 如果是新增文件（旧版本不存在）
            if (oldContent === null && newContent !== null) {
                const uri = this._createReadOnlyUri(newContent || '', `${baseFileName} (${shortHash}) - New File`, filePath);
                await vscode.window.showTextDocument(uri, { 
                    preview: true,
                    viewColumn: vscode.ViewColumn.Beside 
                });
                vscode.window.showInformationMessage(`${filePath} is a new file in this commit`);
                return;
            }

            // 如果是删除文件（新版本不存在）
            if (oldContent !== null && newContent === null) {
                const uri = this._createReadOnlyUri(oldContent || '', `${baseFileName} (${shortHash}) - Deleted File`, filePath);
                await vscode.window.showTextDocument(uri, { 
                    preview: true,
                    viewColumn: vscode.ViewColumn.Beside 
                });
                vscode.window.showInformationMessage(`${filePath} was deleted in this commit`);
                return;
            }

            // 如果内容相同，不需要显示差异
            if (oldContent === newContent) {
                vscode.window.showInformationMessage(`No changes in ${filePath}`);
                return;
            }

            // 创建只读的临时URI进行差异对比
            const leftUri = this._createReadOnlyUri(oldContent || '', `${baseFileName} (${shortHash}^)`, filePath);
            const rightUri = this._createReadOnlyUri(newContent || '', `${baseFileName} (${shortHash})`, filePath);

            // 显示差异视图
            const title = `${baseFileName} (${shortHash})`;
            await vscode.commands.executeCommand(
                'vscode.diff',
                leftUri,
                rightUri,
                title,
                { 
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: true
                }
            );

        } catch (error) {
            console.error('Error showing custom file diff:', error);
            vscode.window.showErrorMessage(`Failed to show file diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private _createReadOnlyUri(content: string, fileName: string, originalPath: string): vscode.Uri {
        // 创建唯一的URI
        const timestamp = Date.now();
        const uri = vscode.Uri.parse(`git-history:${fileName}?${timestamp}`);
        
        // 清理之前的内容提供者
        const existingProvider = this._contentProviders.get(fileName);
        if (existingProvider) {
            existingProvider.dispose();
        }
        
        // 注册新的文本文档内容提供者
        const disposable = vscode.workspace.registerTextDocumentContentProvider('git-history', {
            provideTextDocumentContent: (requestUri: vscode.Uri) => {
                if (requestUri.path === uri.path) {
                    return content;
                }
                return null;
            }
        });

        // 保存提供者引用
        this._contentProviders.set(fileName, disposable);

        // 在一段时间后清理提供者（避免内存泄漏）
        setTimeout(() => {
            const provider = this._contentProviders.get(fileName);
            if (provider === disposable) {
                provider.dispose();
                this._contentProviders.delete(fileName);
            }
        }, 300000); // 5分钟后清理

        return uri;
    }

    private _getLanguageFromFilePath(filePath: string): string {
        const extension = filePath.split('.').pop()?.toLowerCase();
        const languageMap: { [key: string]: string } = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'swift': 'swift',
            'kt': 'kotlin',
            'scala': 'scala',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'less': 'less',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'sh': 'shellscript',
            'bash': 'shellscript',
            'zsh': 'shellscript',
            'fish': 'shellscript',
            'ps1': 'powershell',
            'sql': 'sql',
            'dockerfile': 'dockerfile'
        };
        
        return languageMap[extension || ''] || 'plaintext';
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

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
                    
                    <div class="content">
                        <div class="commit-list" id="commitList">
                            <div class="loading">Loading commits...</div>
                        </div>
                        
                        <div class="commit-details" id="commitDetails">
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
                    <div class="menu-item" data-action="resetSoft">Reset (Soft)</div>
                    <div class="menu-item" data-action="resetMixed">Reset (Mixed)</div>
                    <div class="menu-item" data-action="resetHard">Reset (Hard)</div>
                </div>

                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    public dispose() {
        // 清理所有内容提供者
        for (const disposable of this._contentProviders.values()) {
            disposable.dispose();
        }
        this._contentProviders.clear();
        
        // 清理刷新定时器
        if (this._refreshTimeout) {
            clearTimeout(this._refreshTimeout);
        }
    }
}