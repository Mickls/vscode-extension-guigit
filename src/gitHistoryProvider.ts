import * as vscode from 'vscode';
import { simpleGit, SimpleGit, LogResult, DefaultLogFields } from 'simple-git';
import * as path from 'path';

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
            this.git = simpleGit(this.workspaceRoot);
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

    async getCommitHistory(branch?: string, limit: number = 50): Promise<GitCommit[]> {
        if (!this.git) {
            return [];
        }

        try {
            const options: any = {
                maxCount: limit,
                format: {
                    hash: '%H',
                    date: '%ai',
                    message: '%s',
                    author: '%an',
                    email: '%ae',
                    refs: '%D',
                    body: '%b'
                }
            };

            if (branch) {
                options.from = branch;
            }

            const log: LogResult<DefaultLogFields> = await this.git.log(options);
            
            return log.all.map(commit => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: commit.author_name || '',
                email: commit.author_email || '',
                refs: commit.refs || '',
                body: (commit as any).body || ''
            }));
        } catch (error) {
            console.error('Error getting commit history:', error);
            return [];
        }
    }

    async getCommitDetails(hash: string): Promise<{ commit: GitCommit; files: GitFileChange[] } | null> {
        if (!this.git) {
            console.error('Git instance not available');
            return null;
        }

        try {
            console.log(`Getting commit details for hash: ${hash}`);
            
            // 获取提交详情 - 使用正确的方法获取指定 commit
            const log = await this.git.log({ maxCount: 1, from: hash, to: hash });
            if (log.all.length === 0) {
                console.error(`No commit found for hash: ${hash}`);
                // 尝试使用 show 命令获取 commit 信息
                try {
                    console.log('Trying to get commit info with show command...');
                    const showOutput = await this.git.show(['--format=fuller', '--no-patch', hash]);
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
                     var commit: any = commitInfo;
                 } catch (showError) {
                     console.error('Show command also failed:', showError);
                     return null;
                 }
             } else {
                 var commit: any = log.all[0];
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
                    // 初始提交：使用不同的方法获取文件列表
                    try {
                        // 方法1：使用 git show --name-status
                        console.log('Trying git show --name-status...');
                        const showOutput = await this.git.show(['--name-status', '--format=', hash]);
                        console.log('Show output:', showOutput);
                        const lines = showOutput.trim().split('\n').filter(line => line.trim());
                        files = lines.map(line => {
                            const parts = line.split('\t');
                            const status = parts[0];
                            const fileName = parts[1] || '';
                            return {
                                file: fileName,
                                insertions: status === 'A' ? 1 : 0,
                                deletions: status === 'D' ? 1 : 0,
                                binary: false
                            };
                        });
                        console.log(`Found ${files.length} files with show method`);
                    } catch (showError) {
                        console.log('Show method failed, trying ls-tree:', showError);
                        // 方法2：使用 git ls-tree 获取初始提交的所有文件
                        try {
                            console.log('Trying git ls-tree...');
                            const lsTreeOutput = await this.git.raw(['ls-tree', '-r', '--name-only', hash]);
                            console.log('ls-tree output:', lsTreeOutput);
                            const fileNames = lsTreeOutput.trim().split('\n').filter(name => name.trim());
                            files = fileNames.map(fileName => ({
                                file: fileName,
                                insertions: 1, // 初始提交，所有文件都是新增的
                                deletions: 0,
                                binary: false
                            }));
                            console.log(`Found ${files.length} files with ls-tree method`);
                        } catch (lsTreeError) {
                            console.error('ls-tree method also failed:', lsTreeError);
                            // 方法3：尝试使用 git diff-tree
                            try {
                                console.log('Trying git diff-tree...');
                                const diffTreeOutput = await this.git.raw(['diff-tree', '--no-commit-id', '--name-only', '-r', hash]);
                                console.log('diff-tree output:', diffTreeOutput);
                                const fileNames = diffTreeOutput.trim().split('\n').filter(name => name.trim());
                                files = fileNames.map(fileName => ({
                                    file: fileName,
                                    insertions: 1,
                                    deletions: 0,
                                    binary: false
                                }));
                                console.log(`Found ${files.length} files with diff-tree method`);
                            } catch (diffTreeError) {
                                console.error('diff-tree method also failed:', diffTreeError);
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
                        console.log('Diff summary failed, trying show method:', diffError);
                        // 备用方法：使用show命令
                        const showOutput = await this.git.show(['--name-status', '--format=', hash]);
                        const lines = showOutput.trim().split('\n').filter(line => line.trim());
                        files = lines.map(line => {
                            const parts = line.split('\t');
                            const status = parts[0];
                            const fileName = parts[1] || '';
                            return {
                                file: fileName,
                                insertions: status === 'A' ? 1 : 0,
                                deletions: status === 'D' ? 1 : 0,
                                binary: false
                            };
                        });
                        console.log(`Found ${files.length} files with backup show method`);
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
                author: commit.author_name || '',
                email: commit.author_email || '',
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

    async getFileDiffContent(hash: string, filePath: string): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        try {
            // 检查是否是初始提交
            const isInitial = await this.isInitialCommit(hash);
            
            if (isInitial) {
                // 对于初始提交，显示整个文件作为新增
                const content = await this.git.show([`${hash}:${filePath}`]);
                return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${content.split('\n').length} @@\n` + 
                       content.split('\n').map(line => `+${line}`).join('\n');
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