import * as vscode from 'vscode';
import { GitHistoryProvider } from './gitHistoryProvider';

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
        _context: vscode.WebviewViewResolveContext,
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
                    await this._sendCommitHistory(data.branch, data.skip);
                    break;
                case 'getTotalCommitCount':
                    await this._sendTotalCommitCount(data.branch);
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
                    await this._showFileDiff(data.hash, data.file);
                    break;
                case 'openFile':
                    await this._openFile(data.file);
                    break;
                case 'showFileHistory':
                    await this._showFileHistory(data.file);
                    break;
                case 'viewFileOnline':
                    await this._viewFileOnline(data.hash, data.file);
                    break;
                case 'squashCommits':
                    await this._squashCommits(data.hashes);
                    break;
                case 'saveViewMode':
                    await this._saveViewMode(data.viewMode);
                    break;
            }
        });

        // 初始化加载数据
        this._sendBranches();
        this._sendCommitHistory();
        this._sendViewMode();
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

    private async _sendCommitHistory(branch?: string, skip: number = 0) {
        if (!this._view) return;
        
        const commits = await this._gitHistoryProvider.getCommitHistory(branch, 50, skip);
        this._view.webview.postMessage({
            type: 'commitHistory',
            data: {
                commits,
                skip,
                hasMore: commits.length === 50
            }
        });
    }

    private async _sendTotalCommitCount(branch?: string) {
        if (!this._view) return;
        
        const totalCount = await this._gitHistoryProvider.getTotalCommitCount(branch);
        this._view.webview.postMessage({
            type: 'totalCommitCount',
            data: totalCount
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

    private async _squashCommits(hashes: string[]) {
        if (hashes.length < 2) {
            vscode.window.showErrorMessage('Please select at least 2 commits to squash');
            return;
        }

        // 检查提交是否连续
        const canSquash = await this._canSquashCommits(hashes);
        if (!canSquash) {
            vscode.window.showErrorMessage('Selected commits are not consecutive and cannot be squashed');
            return;
        }

        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to squash ${hashes.length} commits?`,
            'Yes', 'No'
        );
        
        if (result === 'Yes') {
            const success = await this._gitHistoryProvider.squashCommits(hashes);
            if (success) {
                vscode.window.showInformationMessage('Squash completed successfully');
                this.refresh();
            }
        }
    }

    private async _openFile(filePath: string) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
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
                    preview: true
                });
            } catch (error) {
                vscode.window.showErrorMessage(`File ${filePath} does not exist in the current workspace`);
            }
        } catch (error) {
            console.error('Error opening file:', error);
            vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async _showFileHistory(filePath: string) {
        try {
            // 使用 Git 命令显示文件历史
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            // 创建一个新的 webview 来显示文件历史
            const panel = vscode.window.createWebviewPanel(
                'fileHistory',
                `History: ${filePath}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // 获取文件历史
            const fileHistory = await this._gitHistoryProvider.getFileHistory(filePath);
            
            panel.webview.html = this._getFileHistoryHtml(filePath, fileHistory);
        } catch (error) {
            console.error('Error showing file history:', error);
            vscode.window.showErrorMessage(`Failed to show file history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async _viewFileOnline(hash: string, filePath: string) {
        try {
            // 获取远程仓库 URL
            const remoteUrl = await this._gitHistoryProvider.getRemoteUrl();
            if (!remoteUrl) {
                vscode.window.showErrorMessage('No remote repository found');
                return;
            }

            // 构建在线查看 URL（支持 GitHub, GitLab, Bitbucket）
            let onlineUrl = '';
            
            if (remoteUrl.includes('github.com')) {
                // GitHub URL 格式
                const repoMatch = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
                if (repoMatch) {
                    onlineUrl = `https://github.com/${repoMatch[1]}/blob/${hash}/${filePath}`;
                }
            } else if (remoteUrl.includes('gitlab.com')) {
                // GitLab URL 格式
                const repoMatch = remoteUrl.match(/gitlab\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
                if (repoMatch) {
                    onlineUrl = `https://gitlab.com/${repoMatch[1]}/-/blob/${hash}/${filePath}`;
                }
            } else if (remoteUrl.includes('bitbucket.org')) {
                // Bitbucket URL 格式
                const repoMatch = remoteUrl.match(/bitbucket\.org[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
                if (repoMatch) {
                    onlineUrl = `https://bitbucket.org/${repoMatch[1]}/src/${hash}/${filePath}`;
                }
            }

            if (onlineUrl) {
                await vscode.env.openExternal(vscode.Uri.parse(onlineUrl));
            } else {
                vscode.window.showErrorMessage('Unsupported remote repository provider');
            }
        } catch (error) {
            console.error('Error viewing file online:', error);
            vscode.window.showErrorMessage(`Failed to view file online: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private _getFileHistoryHtml(filePath: string, history: any[]): string {
        const commits = history.map(commit => `
            <div class="commit-item">
                <div class="commit-hash">${commit.hash.substring(0, 8)}</div>
                <div class="commit-message">${commit.message}</div>
                <div class="commit-author">${commit.author}</div>
                <div class="commit-date">${new Date(commit.date).toLocaleDateString()}</div>
            </div>
        `).join('');

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
                <div class="file-path">File History: ${filePath}</div>
                <div class="commits">
                    ${commits}
                </div>
            </body>
            </html>
        `;
    }

    private async _canSquashCommits(hashes: string[]): Promise<boolean> {
        // 简单检查：如果提交数量少于2个，不能squash
        if (hashes.length < 2) {
            return false;
        }
        
        // 这里可以添加更复杂的逻辑来检查提交是否连续
        // 目前简化处理，假设用户选择的提交是可以squash的
        return true;
    }

    private async _saveViewMode(viewMode: string) {
        const config = vscode.workspace.getConfiguration('guigit');
        await config.update('fileViewMode', viewMode, vscode.ConfigurationTarget.Workspace);
    }

    private async _sendViewMode() {
        if (!this._view) return;
        
        const config = vscode.workspace.getConfiguration('guigit');
        const viewMode = config.get<string>('fileViewMode', 'list');
        
        this._view.webview.postMessage({
            type: 'viewMode',
            data: viewMode
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
                // 对于初始提交，也使用diff视图显示（空文件 vs 新文件）
                const fileContent = await this._gitHistoryProvider.getFileContent(hash, filePath);
                if (fileContent) {
                    const baseFileName = filePath.split('/').pop() || 'file';
                    const shortHash = hash.substring(0, 8);
                    
                    // 创建空文件URI和新文件URI进行差异对比
                    const leftUri = this._createReadOnlyUri('', `${baseFileName} (empty)`, filePath);
                    const rightUri = this._createReadOnlyUri(fileContent, `${baseFileName} (${shortHash})`, filePath);

                    // 显示差异视图
                    const title = `${baseFileName} (${shortHash}) - Initial Commit`;
                    await vscode.commands.executeCommand(
                        'vscode.diff',
                        leftUri,
                        rightUri,
                        title,
                        { 
                            viewColumn: vscode.ViewColumn.One,
                            preview: true
                        }
                    );
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
                // 创建空文件URI和新文件URI进行差异对比
                const leftUri = this._createReadOnlyUri('', `${baseFileName} (empty)`, filePath);
                const rightUri = this._createReadOnlyUri(newContent, `${baseFileName} (${shortHash})`, filePath);

                // 显示差异视图
                const title = `${baseFileName} (${shortHash}) - New File`;
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    leftUri,
                    rightUri,
                    title,
                    { 
                        viewColumn: vscode.ViewColumn.One,
                        preview: true
                    }
                );
                return;
            }

            // 如果是删除文件（新版本不存在）
            if (oldContent !== null && newContent === null) {
                // 创建旧文件URI和空文件URI进行差异对比
                const leftUri = this._createReadOnlyUri(oldContent, `${baseFileName} (${shortHash}^)`, filePath);
                const rightUri = this._createReadOnlyUri('', `${baseFileName} (deleted)`, filePath);

                // 显示差异视图
                const title = `${baseFileName} (${shortHash}) - Deleted File`;
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    leftUri,
                    rightUri,
                    title,
                    { 
                        viewColumn: vscode.ViewColumn.One,
                        preview: true
                    }
                );
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
                    viewColumn: vscode.ViewColumn.One,
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
        const random = Math.random().toString(36).substring(2, 8);
        const uniqueKey = `${fileName}-${timestamp}-${random}`;
        const scheme = `git-history-${random}`;
        const uri = vscode.Uri.parse(`${scheme}:${fileName}?${timestamp}`);
        
        // 清理之前的内容提供者
        const existingProvider = this._contentProviders.get(uniqueKey);
        if (existingProvider) {
            existingProvider.dispose();
        }
        
        // 确定语言模式（当前未使用，但保留以备将来扩展）
        // const isDiffFile = fileName.endsWith('.diff');
        // const language = isDiffFile ? 'diff' : this._getLanguageFromFilePath(originalPath);
        
        // 注册新的文本文档内容提供者，使用唯一的scheme
        const disposable = vscode.workspace.registerTextDocumentContentProvider(scheme, {
            provideTextDocumentContent: (requestUri: vscode.Uri) => {
                if (requestUri.toString() === uri.toString()) {
                    return content;
                }
                return null;
            }
        });

        // 保存提供者引用
        this._contentProviders.set(uniqueKey, disposable);

        // 在一段时间后清理提供者（避免内存泄漏）
        setTimeout(() => {
            const provider = this._contentProviders.get(uniqueKey);
            if (provider === disposable) {
                provider.dispose();
                this._contentProviders.delete(uniqueKey);
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
                    <div class="menu-item" data-action="squash" id="squashMenuItem">Squash Commits</div>
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