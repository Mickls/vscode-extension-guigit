import * as vscode from 'vscode';
import { simpleGit, SimpleGit } from 'simple-git';

export interface GitCommit {
    hash: string;
    date: string;
    message: string;
    author: string;
    email: string;
    refs: string;
    body: string;
}

export interface GitBranch {
    name: string;
    current: boolean;
    commit: string;
}

export interface GitFileChange {
    file: string;
    insertions: number;
    deletions: number;
    binary: boolean;
}

export class GitHistoryProvider {
    private git: SimpleGit | null = null;
    private workspaceRoot: string | null = null;

    constructor() {
        this.initializeGit();
    }

    private initializeGit() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.workspaceRoot = workspaceFolders[0].uri.fsPath;
            this.git = simpleGit(this.workspaceRoot, {
                config: [
                    'core.quotepath=false',  // 禁用路径引用，正确显示中文文件名
                    'log.showSignature=false' // 禁用签名显示
                ]
            });
        }
    }

    async getBranches(): Promise<GitBranch[]> {
        if (!this.git) {
            return [];
        }

        try {
            const branchSummary = await this.git.branch();
            return branchSummary.all.map(branch => ({
                name: branch,
                current: branch === branchSummary.current,
                commit: ''
            }));
        } catch (error) {
            console.error('Error getting branches:', error);
            return [];
        }
    }

    async getCommitHistory(branch?: string, limit: number = 50, skip: number = 0): Promise<GitCommit[]> {
        if (!this.git) {
            return [];
        }

        try {
            // 使用 raw 方法直接调用 git log 命令
            const args = [
                'log',
                '--pretty=format:%H|%ai|%s|%an|%ae|%D|%b',
                '--encoding=UTF-8',  // 指定UTF-8编码
                `--max-count=${limit}`
            ];

            if (skip > 0) {
                args.push(`--skip=${skip}`);
            }

            if (branch) {
                args.push(branch);
            }

            const result = await this.git.raw(args);
            const lines = result.trim().split('\n').filter(line => line.trim());
            
            return lines.map(line => {
                const parts = line.split('|');
                return {
                    hash: parts[0] || '',
                    date: parts[1] || '',
                    message: parts[2] || '',
                    author: parts[3] || '',
                    email: parts[4] || '',
                    refs: parts[5] || '',
                    body: parts[6] || ''
                };
            });
        } catch (error) {
            console.error('Error getting commit history:', error);
            return [];
        }
    }

    async getTotalCommitCount(branch?: string): Promise<number> {
        if (!this.git) {
            return 0;
        }

        try {
            const options: string[] = ['rev-list', '--count'];
            if (branch) {
                options.push(branch);
            } else {
                options.push('HEAD');
            }
            
            const result = await this.git.raw(options);
            return parseInt(result.trim()) || 0;
        } catch (error) {
            console.error('Error getting total commit count:', error);
            return 0;
        }
    }

    async getCommitDetails(hash: string): Promise<{ commit: GitCommit; files: GitFileChange[] } | null> {
        if (!this.git) {
            console.error('Git instance not available');
            return null;
        }

        try {
            console.log(`Getting commit details for hash: ${hash}`);
            
            let commit: any;
            
            // 获取提交详情 - 使用正确的方法获取指定 commit
            const log = await this.git.log({ maxCount: 1, from: hash, to: hash });
            if (log.all.length === 0) {
                console.error(`No commit found for hash: ${hash}`);
                // 尝试使用 show 命令获取 commit 信息
                try {
                    console.log('Trying to get commit info with show command...');
                    const showOutput = await this.git.show(['--format=fuller', '--no-patch', '--encoding=UTF-8', hash]);
                    console.log('Show output for commit info:', showOutput);
                    
                    // 解析 show 命令的输出
                    const lines = showOutput.split('\n');
                    let commitInfo: any = { hash: hash };
                    
                    for (const line of lines) {
                        if (line.startsWith('Author:')) {
                            const authorMatch = line.match(/Author:\s+(.+?)\s+<(.+?)>/);
                            if (authorMatch) {
                                commitInfo.author_name = authorMatch[1];
                                commitInfo.author_email = authorMatch[2];
                            }
                        } else if (line.startsWith('AuthorDate:')) {
                            commitInfo.date = line.replace('AuthorDate:', '').trim();
                        } else if (line.trim() && !line.startsWith('commit') && !line.startsWith('Author') && !line.startsWith('Commit') && !line.startsWith('Date')) {
                            if (!commitInfo.message) {
                                commitInfo.message = line.trim();
                            } else if (!commitInfo.body) {
                                commitInfo.body = line.trim();
                            }
                        }
                    }
                    
                    if (!commitInfo.message) {
                        commitInfo.message = 'No commit message';
                    }
                    
                    console.log('Parsed commit info:', commitInfo);
                     commit = commitInfo;
                 } catch (showError) {
                     console.error('Show command also failed:', showError);
                     return null;
                 }
             } else {
                 commit = log.all[0];
             }
            console.log(`Found commit: ${commit.hash.substring(0, 8)} - ${commit.message}`);
            
            // 获取文件变更
            let files: GitFileChange[] = [];
            
            try {
                // 首先尝试检查是否是初始提交
                let isInitialCommit = false;
                try {
                    console.log(`Checking if ${hash.substring(0, 8)} is initial commit...`);
                    const parents = await this.git.raw(['rev-list', '--parents', '-n', '1', hash]);
                    const parentHashes = parents.trim().split(' ').slice(1);
                    isInitialCommit = parentHashes.length === 0;
                    console.log(`Is initial commit: ${isInitialCommit}, parent count: ${parentHashes.length}`);
                } catch (parentError) {
                    console.log('Failed to get parents with rev-list, trying rev-parse method:', parentError);
                    // 如果无法获取父提交信息，尝试其他方法判断
                    try {
                        await this.git.raw(['rev-parse', `${hash}^`]);
                        isInitialCommit = false;
                        console.log('Found parent with rev-parse, not initial commit');
                    } catch {
                        isInitialCommit = true;
                        console.log('No parent found with rev-parse, is initial commit');
                    }
                }
                
                if (isInitialCommit) {
                    console.log('Processing initial commit...');
                    // 初始提交：使用不同的方法获取文件列表和正确的行数统计
                    try {
                        // 方法1：使用 git show --numstat 获取准确的行数统计
                        console.log('Trying git show --numstat...');
                        const numstatOutput = await this.git.show(['--numstat', '--format=', '--encoding=UTF-8', hash]);
                        console.log('Numstat output:', numstatOutput);
                        const lines = numstatOutput.trim().split('\n').filter(line => line.trim());
                        files = lines.map(line => {
                            const parts = line.split('\t');
                            const insertions = parseInt(parts[0]) || 0;
                            const deletions = parseInt(parts[1]) || 0;
                            const fileName = parts[2] || '';
                            return {
                                file: fileName,
                                insertions: insertions,
                                deletions: deletions,
                                binary: parts[0] === '-' && parts[1] === '-'
                            };
                        });
                        console.log(`Found ${files.length} files with numstat method`);
                    } catch (numstatError) {
                        console.log('Numstat method failed, trying show --name-status:', numstatError);
                        // 备用方法：使用 git show --name-status 然后逐个获取文件行数
                        try {
                            console.log('Trying git show --name-status...');
                            const showOutput = await this.git.show(['--name-status', '--format=', '--encoding=UTF-8', hash]);
                            console.log('Show output:', showOutput);
                            const lines = showOutput.trim().split('\n').filter(line => line.trim());
                            files = [];
                            
                            for (const line of lines) {
                                const parts = line.split('\t');
                                const status = parts[0];
                                const fileName = parts[1] || '';
                                
                                if (status === 'A') {
                                    // 新增文件，获取实际行数
                                    try {
                                        const fileContent = await this.git.show([`${hash}:${fileName}`]);
                                        const lineCount = fileContent.split('\n').length;
                                        files.push({
                                            file: fileName,
                                            insertions: lineCount,
                                            deletions: 0,
                                            binary: false
                                        });
                                    } catch (contentError) {
                                        console.log(`Failed to get content for ${fileName}, treating as binary or empty`);
                                        files.push({
                                            file: fileName,
                                            insertions: 1,
                                            deletions: 0,
                                            binary: true
                                        });
                                    }
                                } else {
                                    files.push({
                                        file: fileName,
                                        insertions: status === 'A' ? 1 : 0,
                                        deletions: status === 'D' ? 1 : 0,
                                        binary: false
                                    });
                                }
                            }
                            console.log(`Found ${files.length} files with show method`);
                        } catch (showError) {
                            console.log('Show method failed, trying ls-tree:', showError);
                            // 最后的备用方法：使用 git ls-tree
                            try {
                                console.log('Trying git ls-tree...');
                                const lsTreeOutput = await this.git.raw(['ls-tree', '-r', '--name-only', hash]);
                                console.log('ls-tree output:', lsTreeOutput);
                                const fileNames = lsTreeOutput.trim().split('\n').filter(name => name.trim());
                                files = fileNames.map(fileName => ({
                                    file: fileName,
                                    insertions: 1, // 无法获取准确行数时的默认值
                                    deletions: 0,
                                    binary: false
                                }));
                                console.log(`Found ${files.length} files with ls-tree method`);
                            } catch (lsTreeError) {
                                console.error('ls-tree method also failed:', lsTreeError);
                                files = [];
                            }
                        }
                    }
                } else {
                    console.log('Processing regular commit...');
                    // 普通提交：与父提交比较
                    try {
                        console.log('Trying git diff summary...');
                        const diffSummary = await this.git.diffSummary([`${hash}^`, hash]);
                        files = diffSummary.files.map(file => ({
                            file: file.file,
                            insertions: 'insertions' in file ? file.insertions : 0,
                            deletions: 'deletions' in file ? file.deletions : 0,
                            binary: file.binary
                        }));
                        console.log(`Found ${files.length} files with diff summary`);
                    } catch (diffError) {
                        console.log('Diff summary failed, trying numstat method:', diffError);
                        // 备用方法：使用 git show --numstat 获取准确的行数统计
                        try {
                            const numstatOutput = await this.git.show(['--numstat', '--format=', '--encoding=UTF-8', hash]);
                            const lines = numstatOutput.trim().split('\n').filter(line => line.trim());
                            files = lines.map(line => {
                                const parts = line.split('\t');
                                const insertions = parseInt(parts[0]) || 0;
                                const deletions = parseInt(parts[1]) || 0;
                                const fileName = parts[2] || '';
                                return {
                                    file: fileName,
                                    insertions: insertions,
                                    deletions: deletions,
                                    binary: parts[0] === '-' && parts[1] === '-'
                                };
                            });
                            console.log(`Found ${files.length} files with numstat method`);
                        } catch (numstatError) {
                            console.log('Numstat method failed, trying show --name-status:', numstatError);
                            // 最后的备用方法：使用show命令
                            const showOutput = await this.git.show(['--name-status', '--format=', '--encoding=UTF-8', hash]);
                            const lines = showOutput.trim().split('\n').filter(line => line.trim());
                            files = await Promise.all(lines.map(async line => {
                                const parts = line.split('\t');
                                const status = parts[0];
                                const fileName = parts[1] || '';
                                
                                if (status === 'A') {
                                    // 新增文件，尝试获取实际行数
                                    try {
                                        const fileContent = await this.git!.show([`${hash}:${fileName}`]);
                                        const lineCount = fileContent.split('\n').length;
                                        return {
                                            file: fileName,
                                            insertions: lineCount,
                                            deletions: 0,
                                            binary: false
                                        };
                                    } catch {
                                        return {
                                            file: fileName,
                                            insertions: 1,
                                            deletions: 0,
                                            binary: true
                                        };
                                    }
                                }
                                
                                return {
                                    file: fileName,
                                    insertions: status === 'A' ? 1 : 0,
                                    deletions: status === 'D' ? 1 : 0,
                                    binary: false
                                };
                            }));
                            console.log(`Found ${files.length} files with backup show method`);
                        }
                    }
                }
            } catch (fileError) {
                console.error('Error getting file changes:', fileError);
                files = [];
            }

            const result = {
                commit: {
                    hash: commit.hash,
                    date: commit.date,
                    message: commit.message,
                    author: commit.author_name || '',
                    email: commit.author_email || '',
                    refs: commit.refs || '',
                    body: (commit as any).body || ''
                },
                files
            };
            
            console.log(`Successfully processed commit ${hash.substring(0, 8)} with ${files.length} files`);
            return result;
        } catch (error) {
            console.error('Error getting commit details:', error);
            return null;
        }
    }

    async squashCommits(hashes: string[]): Promise<boolean> {
        if (!this.git || hashes.length < 2) {
            return false;
        }

        try {
            // 对提交进行排序，确保从最旧到最新
            const sortedHashes = [...hashes].reverse();
            const oldestHash = sortedHashes[0];
            const newestHash = sortedHashes[sortedHashes.length - 1];
            
            // 使用 git rebase -i 进行交互式变基来squash提交
            // 这里简化处理，使用 git reset 和 git commit 来模拟squash
            await this.git.reset(['--soft', `${oldestHash}^`]);
            
            // 创建新的提交消息
            const commitMessage = `Squashed ${hashes.length} commits`;
            await this.git.commit(commitMessage);
            
            return true;
        } catch (error) {
            console.error('Error squashing commits:', error);
            vscode.window.showErrorMessage(`Squash failed: ${error}`);
            return false;
        }
    }

    async getFileDiff(hash: string, filePath: string): Promise<string> {
        if (!this.git) {
            return '';
        }

        try {
            const diff = await this.git.show([`${hash}:${filePath}`]);
            return diff;
        } catch (error) {
            console.error('Error getting file diff:', error);
            return '';
        }
    }

    async cherryPickCommit(hash: string): Promise<boolean> {
        if (!this.git) {
            return false;
        }

        try {
            await this.git.raw(['cherry-pick', hash]);
            return true;
        } catch (error) {
            console.error('Error cherry-picking commit:', error);
            vscode.window.showErrorMessage(`Cherry-pick failed: ${error}`);
            return false;
        }
    }

    async revertCommit(hash: string): Promise<boolean> {
        if (!this.git) {
            return false;
        }

        try {
            await this.git.revert(hash);
            return true;
        } catch (error) {
            console.error('Error reverting commit:', error);
            vscode.window.showErrorMessage(`Revert failed: ${error}`);
            return false;
        }
    }

    async resetToCommit(hash: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<boolean> {
        if (!this.git) {
            return false;
        }

        try {
            await this.git.reset([`--${mode}`, hash]);
            return true;
        } catch (error) {
            console.error('Error resetting to commit:', error);
            vscode.window.showErrorMessage(`Reset failed: ${error}`);
            return false;
        }
    }

    async compareCommits(hash1: string, hash2: string): Promise<GitFileChange[]> {
        if (!this.git) {
            return [];
        }

        try {
            const diffSummary = await this.git.diffSummary([hash1, hash2]);
            return diffSummary.files.map(file => ({
                file: file.file,
                insertions: 'insertions' in file ? file.insertions : 0,
                deletions: 'deletions' in file ? file.deletions : 0,
                binary: file.binary
            }));
        } catch (error) {
            console.error('Error comparing commits:', error);
            return [];
        }
    }

    async getHeadCommit(): Promise<GitCommit | null> {
        if (!this.git) {
            return null;
        }

        try {
            const log = await this.git.log({ maxCount: 1 });
            if (log.all.length === 0) {
                return null;
            }

            const commit = log.all[0];
            return {
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: (commit as any).author_name || '',
                email: (commit as any).author_email || '',
                refs: commit.refs || '',
                body: (commit as any).body || ''
            };
        } catch (error) {
            console.error('Error getting HEAD commit:', error);
            return null;
        }
    }

    async isInitialCommit(hash: string): Promise<boolean> {
        if (!this.git) {
            return false;
        }

        try {
            await this.git.raw(['rev-parse', `${hash}^`]);
            return false;
        } catch {
            return true;
        }
    }

    async getFileContent(hash: string, filePath: string): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        try {
            const content = await this.git.show([`${hash}:${filePath}`]);
            return content;
        } catch (error) {
            console.error('Error getting file content:', error);
            return null;
        }
    }

    async getFileHistory(filePath: string): Promise<GitCommit[]> {
        if (!this.git) {
            return [];
        }

        try {
            const log = await this.git.log({
                file: filePath,
                format: {
                    hash: '%H',
                    date: '%ai',
                    message: '%s',
                    author: '%an',
                    email: '%ae',
                    refs: '%D',
                    body: '%b'
                }
            });

            return log.all.map(commit => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: (commit as any).author_name || '',
                email: (commit as any).author_email || '',
                refs: commit.refs || '',
                body: (commit as any).body || ''
            }));
        } catch (error) {
            console.error('Error getting file history:', error);
            return [];
        }
    }

    async getRemoteUrl(): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        try {
            const remotes = await this.git.getRemotes(true);
            
            // 优先查找 origin，如果没有则使用第一个远程仓库
            const origin = remotes.find(remote => remote.name === 'origin');
            const remote = origin || remotes[0];
            
            if (remote && remote.refs && remote.refs.fetch) {
                return remote.refs.fetch;
            }
            
            return null;
        } catch (error) {
            console.error('Error getting remote URL:', error);
            return null;
        }
    }

    async getFileDiffContent(hash: string, filePath: string): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        try {
            // 检查是否是初始提交
            const isInitial = await this.isInitialCommit(hash);
            
            if (isInitial) {
                // 对于初始提交，使用 git show 命令生成标准的 diff 格式
                const diff = await this.git.show(['--format=', hash, '--', filePath]);
                return diff || 'No changes in this file';
            } else {
                // 对于普通提交，显示与父提交的差异
                const diff = await this.git.diff([`${hash}^`, hash, '--', filePath]);
                return diff || 'No changes in this file';
            }
        } catch (error) {
            console.error('Error getting file diff content:', error);
            return null;
        }
    }
}