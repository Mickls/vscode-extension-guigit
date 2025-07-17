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

/**
 * Git操作提供者，封装所有Git相关功能
 */
export class GitHistoryProvider {
    private git: SimpleGit | null = null;
    private workspaceRoot: string | null = null;
    // 性能优化：添加后端缓存
    private commitDetailsCache = new Map<string, { commit: GitCommit; files: GitFileChange[] }>();
    private readonly CACHE_SIZE_LIMIT = 100;

    constructor() {
        this.initializeGit();
    }

    /**
     * 初始化Git实例
     */
    private initializeGit() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.workspaceRoot = workspaceFolders[0].uri.fsPath;
            this.git = simpleGit(this.workspaceRoot, {
                config: [
                    'core.quotepath=false',
                    'log.showSignature=false'
                ]
            });
        }
    }

    /**
     * 执行Git命令的通用错误处理包装器
     */
    private async executeGitCommand<T>(
        operation: () => Promise<T>,
        errorMessage: string,
        defaultValue: T
    ): Promise<T> {
        if (!this.git) {
            console.error('Git instance not available');
            return defaultValue;
        }

        try {
            return await operation();
        } catch (error) {
            console.error(`${errorMessage}:`, error);
            return defaultValue;
        }
    }

    /**
     * 获取所有分支信息
     */
    async getBranches(): Promise<GitBranch[]> {
        return this.executeGitCommand(
            async () => {
                const branchSummary = await this.git!.branch();
                return branchSummary.all.map(branch => ({
                    name: branch,
                    current: branch === branchSummary.current,
                    commit: ''
                }));
            },
            'Error getting branches',
            []
        );
    }

    /**
     * 获取提交历史
     */
    async getCommitHistory(branch?: string, limit: number = 50, skip: number = 0): Promise<GitCommit[]> {
        return this.executeGitCommand(
            async () => {
                const args = [
                    'log',
                    '--pretty=format:%H|%ai|%s|%an|%ae|%D|%b',
                    '--encoding=UTF-8',
                    `--max-count=${limit}`
                ];

                if (skip > 0) {
                    args.push(`--skip=${skip}`);
                }

                if (branch) {
                    args.push(branch);
                }

                const result = await this.git!.raw(args);
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
            },
            'Error getting commit history',
            []
        );
    }

    /**
     * 获取提交总数
     */
    async getTotalCommitCount(branch?: string): Promise<number> {
        return this.executeGitCommand(
            async () => {
                const options: string[] = ['rev-list', '--count'];
                if (branch) {
                    options.push(branch);
                } else {
                    options.push('HEAD');
                }
                
                const result = await this.git!.raw(options);
                return parseInt(result.trim()) || 0;
            },
            'Error getting total commit count',
            0
        );
    }

    /**
     * 获取提交详情和文件变更
     */
    async getCommitDetails(hash: string): Promise<{ commit: GitCommit; files: GitFileChange[] } | null> {
        // 性能优化：检查后端缓存
        if (this.commitDetailsCache.has(hash)) {
            console.log(`Cache hit for commit ${hash.substring(0, 8)}`);
            return this.commitDetailsCache.get(hash)!;
        }
        
        return this.executeGitCommand(
            async () => {
                console.log(`Getting commit details for hash: ${hash}`);
                
                // 并行获取commit信息和文件变更，提升性能
                const [commit, files] = await Promise.all([
                    this.getCommitInfo(hash),
                    this.getCommitFileChanges(hash)
                ]);
                
                const result = {
                    commit: {
                        hash: commit.hash,
                        date: commit.date,
                        message: commit.message,
                        author: commit.author_name || '',
                        email: commit.author_email || '',
                        refs: commit.refs || '',
                        body: commit.body || ''
                    },
                    files
                };
                
                // 缓存结果
                this.cacheCommitDetails(hash, result);
                
                console.log(`Successfully processed commit ${hash.substring(0, 8)} with ${files.length} files`);
                return result;
            },
            'Error getting commit details',
            null
        );
    }

    /**
     * 获取提交信息
     */
    private async getCommitInfo(hash: string): Promise<any> {
        const log = await this.git!.log({ maxCount: 1, from: hash, to: hash });
        
        if (log.all.length > 0) {
            return log.all[0];
        }

        // 使用show命令作为备选方案
        console.log('Trying to get commit info with show command...');
        const showOutput = await this.git!.show(['--format=fuller', '--no-patch', '--encoding=UTF-8', hash]);
        
        return this.parseShowOutput(showOutput, hash);
    }
    
    /**
     * 缓存提交详情
     */
    private cacheCommitDetails(hash: string, details: { commit: GitCommit; files: GitFileChange[] }) {
        // 限制缓存大小，避免内存泄漏
        if (this.commitDetailsCache.size >= this.CACHE_SIZE_LIMIT) {
            const firstKey = this.commitDetailsCache.keys().next().value;
            if (firstKey) {
                this.commitDetailsCache.delete(firstKey);
            }
        }
        
        this.commitDetailsCache.set(hash, details);
    }
    
    /**
     * 清理缓存（用于刷新时）
     */
    public clearCache() {
        this.commitDetailsCache.clear();
        console.log('Commit details cache cleared');
    }

    /**
     * 解析git show命令输出
     */
    private parseShowOutput(showOutput: string, hash: string): any {
        const lines = showOutput.split('\n');
        const commitInfo: any = { hash };
        
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
        
        return commitInfo;
    }

    /**
     * 获取提交的文件变更
     */
    private async getCommitFileChanges(hash: string): Promise<GitFileChange[]> {
        // 优化：直接尝试获取文件变更，避免额外的isInitialCommit检查
        // 先尝试常规方法，如果失败再尝试初始提交方法
        try {
            const files = await this.getRegularCommitFiles(hash);
            if (files.length > 0) {
                return files;
            }
            // 如果常规方法没有返回文件，可能是初始提交
            return this.getInitialCommitFiles(hash);
        } catch (error) {
            console.log('Regular commit method failed, trying initial commit method:', error);
            return this.getInitialCommitFiles(hash);
        }
    }

    /**
     * 获取初始提交的文件列表
     */
    private async getInitialCommitFiles(hash: string): Promise<GitFileChange[]> {
        console.log('Processing initial commit...');
        
        // 尝试多种方法获取文件变更
        const methods = [
            () => this.getFilesWithNumstat(hash),
            () => this.getFilesWithNameStatus(hash, true),
            () => this.getFilesWithLsTree(hash)
        ];

        for (const method of methods) {
            try {
                const files = await method();
                if (files.length > 0) {
                    console.log(`Found ${files.length} files`);
                    return files;
                }
            } catch (error) {
                console.log('Method failed, trying next:', error);
            }
        }

        return [];
    }

    /**
     * 获取普通提交的文件列表
     */
    private async getRegularCommitFiles(hash: string): Promise<GitFileChange[]> {
        console.log('Processing regular commit...');
        
        // 优化：直接使用最高效的numstat方法
        // numstat通常是最快且最可靠的方法
        try {
            const files = await this.getFilesWithNumstat(hash);
            console.log(`Found ${files.length} files with numstat`);
            return files;
        } catch (error) {
            console.log('Numstat method failed, trying diffSummary:', error);
            // 如果numstat失败，尝试diffSummary作为备选
            try {
                const files = await this.getFilesWithDiffSummary(hash);
                console.log(`Found ${files.length} files with diffSummary`);
                return files;
            } catch (error2) {
                console.log('DiffSummary method also failed:', error2);
                return [];
            }
        }
    }

    /**
     * 使用numstat方法获取文件变更
     */
    private async getFilesWithNumstat(hash: string): Promise<GitFileChange[]> {
        // 优化：使用更高效的git命令参数
        const numstatOutput = await this.git!.show([
            '--numstat', 
            '--format=',  // 不显示commit信息
            hash
        ]);
        const lines = numstatOutput.trim().split('\n').filter(line => line.trim());
        
        return lines.map(line => {
            const parts = line.split('\t');
            if (parts.length < 3) return null; // 跳过无效行
            
            const insertions = parts[0] === '-' ? 0 : parseInt(parts[0]) || 0;
            const deletions = parts[1] === '-' ? 0 : parseInt(parts[1]) || 0;
            const fileName = parts[2] || '';
            
            return {
                file: fileName,
                insertions,
                deletions,
                binary: parts[0] === '-' && parts[1] === '-'
            };
        }).filter((item): item is GitFileChange => item !== null); // 过滤掉null值并修复类型
    }

    /**
     * 使用name-status方法获取文件变更
     */
    private async getFilesWithNameStatus(hash: string, isInitial: boolean): Promise<GitFileChange[]> {
        const showOutput = await this.git!.show(['--name-status', '--format=', '--encoding=UTF-8', hash]);
        const lines = showOutput.trim().split('\n').filter(line => line.trim());
        const files: GitFileChange[] = [];
        
        for (const line of lines) {
            const parts = line.split('\t');
            const status = parts[0];
            const fileName = parts[1] || '';
            
            if (status === 'A' && isInitial) {
                try {
                    const fileContent = await this.git!.show([`${hash}:${fileName}`]);
                    const lineCount = fileContent.split('\n').length;
                    files.push({
                        file: fileName,
                        insertions: lineCount,
                        deletions: 0,
                        binary: false
                    });
                } catch {
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
        
        return files;
    }

    /**
     * 使用ls-tree方法获取文件变更
     */
    private async getFilesWithLsTree(hash: string): Promise<GitFileChange[]> {
        const lsTreeOutput = await this.git!.raw(['ls-tree', '-r', '--name-only', hash]);
        const fileNames = lsTreeOutput.trim().split('\n').filter(name => name.trim());
        
        return fileNames.map(fileName => ({
            file: fileName,
            insertions: 1,
            deletions: 0,
            binary: false
        }));
    }

    /**
     * 使用diff summary方法获取文件变更
     */
    private async getFilesWithDiffSummary(hash: string): Promise<GitFileChange[]> {
        const diffSummary = await this.git!.diffSummary([`${hash}^`, hash]);
        return diffSummary.files.map(file => ({
            file: file.file,
            insertions: 'insertions' in file ? file.insertions : 0,
            deletions: 'deletions' in file ? file.deletions : 0,
            binary: file.binary
        }));
    }

    /**
     * 合并多个提交为一个提交
     * @param hashes 要合并的提交哈希数组
     * @returns 是否成功合并
     */
    async squashCommits(hashes: string[]): Promise<boolean> {
        if (!this.git || hashes.length < 2) {
            return false;
        }

        return this.executeGitCommand(async () => {
            // 对提交进行排序，确保从最旧到最新
            const sortedHashes = [...hashes].reverse();
            const oldestHash = sortedHashes[0];
            
            // 使用 git reset 和 git commit 来模拟squash
            await this.git!.reset(['--soft', `${oldestHash}^`]);
            
            // 创建新的提交消息
            const commitMessage = `Squashed ${hashes.length} commits`;
            await this.git!.commit(commitMessage);
            
            return true;
        }, 'Squash failed', false);
    }

    /**
     * 获取指定提交中文件的内容
     * @param hash 提交哈希
     * @param filePath 文件路径
     * @returns 文件内容
     */
    async getFileDiff(hash: string, filePath: string): Promise<string> {
        if (!this.git) {
            return '';
        }

        return this.executeGitCommand(async () => {
            return await this.git!.show([`${hash}:${filePath}`]);
        }, 'Failed to get file content', '');
    }

    /**
     * 挑选指定提交到当前分支
     * @param hash 提交哈希
     * @returns 是否成功挑选
     */
    async cherryPickCommit(hash: string): Promise<boolean> {
        if (!this.git) {
            return false;
        }

        return this.executeGitCommand(async () => {
            await this.git!.raw(['cherry-pick', hash]);
            return true;
        }, 'Cherry-pick failed', false);
    }

    /**
     * 回滚指定提交
     * @param hash 提交哈希
     * @returns 是否成功回滚
     */
    async revertCommit(hash: string): Promise<boolean> {
        if (!this.git) {
            return false;
        }

        return this.executeGitCommand(async () => {
            await this.git!.revert(hash);
            return true;
        }, 'Revert failed', false);
    }

    /**
     * 重置到指定提交
     * @param hash 提交哈希
     * @param mode 重置模式
     * @returns 是否成功重置
     */
    async resetToCommit(hash: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<boolean> {
        if (!this.git) {
            return false;
        }

        return this.executeGitCommand(async () => {
            await this.git!.reset([`--${mode}`, hash]);
            return true;
        }, 'Reset failed', false);
    }

    /**
     * 比较两个提交之间的文件变化
     * @param hash1 第一个提交哈希
     * @param hash2 第二个提交哈希
     * @returns 文件变化列表
     */
    async compareCommits(hash1: string, hash2: string): Promise<GitFileChange[]> {
        if (!this.git) {
            return [];
        }

        return this.executeGitCommand(async () => {
            const diffSummary = await this.git!.diffSummary([hash1, hash2]);
            return diffSummary.files.map(file => ({
                file: file.file,
                insertions: 'insertions' in file ? file.insertions : 0,
                deletions: 'deletions' in file ? file.deletions : 0,
                binary: file.binary
            }));
        }, 'Failed to compare commits', []);
    }

    /**
     * 获取HEAD提交信息
     * @returns HEAD提交信息
     */
    async getHeadCommit(): Promise<GitCommit | null> {
        if (!this.git) {
            return null;
        }

        return this.executeGitCommand(async () => {
            const log = await this.git!.log({ maxCount: 1 });
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
        }, 'Failed to get HEAD commit', null);
    }

    /**
     * 检查是否为初始提交
     * @param hash 提交哈希
     * @returns 是否为初始提交
     */
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

    /**
     * 获取指定提交中的文件内容
     * @param hash 提交哈希
     * @param filePath 文件路径
     * @returns 文件内容
     */
    async getFileContent(hash: string, filePath: string): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        return this.executeGitCommand(async () => {
            return await this.git!.show([`${hash}:${filePath}`]);
        }, 'Failed to get file content', null);
    }

    /**
     * 获取文件的提交历史
     * @param filePath 文件路径
     * @returns 文件的提交历史
     */
    async getFileHistory(filePath: string): Promise<GitCommit[]> {
        if (!this.git) {
            return [];
        }

        return this.executeGitCommand(async () => {
            const log = await this.git!.log({
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
        }, 'Failed to get file history', []);
    }

    /**
     * 获取远程仓库URL
     * @returns 远程仓库URL
     */
    async getRemoteUrl(): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        return this.executeGitCommand(async () => {
            const remotes = await this.git!.getRemotes(true);
            
            // 优先查找 origin，如果没有则使用第一个远程仓库
            const origin = remotes.find(remote => remote.name === 'origin');
            const remote = origin || remotes[0];
            
            if (remote && remote.refs && remote.refs.fetch) {
                return remote.refs.fetch;
            }
            
            return null;
        }, 'Failed to get remote URL', null);
    }

    /**
     * 获取文件的差异内容
     * @param hash 提交哈希
     * @param filePath 文件路径
     * @returns 文件差异内容
     */
    async getFileDiffContent(hash: string, filePath: string): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        return this.executeGitCommand(async () => {
            // 检查是否是初始提交
            const isInitial = await this.isInitialCommit(hash);
            
            if (isInitial) {
                // 对于初始提交，使用 git show 命令生成标准的 diff 格式
                const diff = await this.git!.show(['--format=', hash, '--', filePath]);
                return diff || 'No changes in this file';
            } else {
                // 对于普通提交，显示与父提交的差异
                const diff = await this.git!.diff([`${hash}^`, hash, '--', filePath]);
                return diff || 'No changes in this file';
            }
        }, 'Failed to get file diff content', null);
    }
}