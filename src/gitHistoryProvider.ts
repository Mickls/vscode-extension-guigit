import { simpleGit, SimpleGit } from "simple-git";
import * as vscode from "vscode";

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author: string;
  email: string;
  refs: string;
  body: string;
  parents: string[];
  children: string[];
  branchName?: string;
  graphInfo?: GitGraphInfo;
}

export interface GitGraphInfo {
  column: number;
  lanes: GitLane[];
  mergeInfo?: {
    isMerge: boolean;
    mergeFrom?: number;
    mergeTo?: number;
  };
}

export interface GitLane {
  type: 'commit' | 'line' | 'merge' | 'fork';
  color: string;
  column: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  char?: string; // 原始字符，用于特殊渲染
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
  private commitDetailsCache = new Map<
    string,
    { commit: GitCommit; files: GitFileChange[] }
  >();
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
        config: ["core.quotepath=false", "log.showSignature=false"],
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
      console.error("Git instance not available");
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
        return branchSummary.all.map((branch) => ({
          name: branch,
          current: branch === branchSummary.current,
          commit: "",
        }));
      },
      "Error getting branches",
      []
    );
  }

  /**
   * 获取提交历史（带图形信息）
   */
  async getCommitHistory(
    branch?: string,
    limit: number = 50,
    skip: number = 0
  ): Promise<GitCommit[]> {
    return this.executeGitCommand(
      async () => {
        // 使用git log --graph --oneline获取图形信息
        const RECORD_SEPARATOR = "---COMMIT-RECORD-SEPARATOR---";
        const args = [
          "log",
          "--graph",
          "--all", // 显示所有分支
          `--pretty=format:%H|%ai|%s|%an|%ae|%D|%P|%b${RECORD_SEPARATOR}`,
          "--encoding=UTF-8",
          `--max-count=${limit}`,
        ];

        if (skip > 0) {
          args.push(`--skip=${skip}`);
        }

        if (branch && branch !== 'all') {
          // 如果指定了特定分支，只显示该分支
          args.splice(args.indexOf('--all'), 1);
          args.push(branch);
        }

        const result = await this.git!.raw(args);
        
        // 解析带图形信息的输出
        const lines = result.trim().split('\n').filter(line => line.trim());
        const commits: GitCommit[] = [];
        
        console.log(`Found ${lines.length} lines to process`);
        
        for (const line of lines) {
          const graphMatch = line.match(/^([\s\|\\\/*]+)(.*)$/);
          if (!graphMatch) continue;
          
          const graphPart = graphMatch[1];
          const commitPart = graphMatch[2];
          
          // 检查是否包含提交信息
          if (!commitPart.includes('|')) continue;
          
          const recordEnd = commitPart.indexOf(RECORD_SEPARATOR);
          const actualCommitPart = recordEnd > -1 ? commitPart.substring(0, recordEnd) : commitPart;
          
          const parts = actualCommitPart.split("|");
          
          // 验证是否为有效的提交记录
          const hash = parts[0]?.trim() || "";
          if (!hash || hash.length < 7) continue;
          
          // 解析父提交
          const parents = parts[6] ? parts[6].trim().split(' ').filter(p => p) : [];
          
          // 处理提交体
          let body = "";
          if (parts.length > 7) {
            body = parts.slice(7).join("|").trim();
          }
          
          // 解析图形信息
          const graphInfo = this.parseGraphInfo(graphPart, parents.length > 1);
          
          const commit: GitCommit = {
            hash,
            date: parts[1]?.trim() || "",
            message: parts[2]?.trim() || "",
            author: parts[3]?.trim() || "",
            email: parts[4]?.trim() || "",
            refs: parts[5]?.trim() || "",
            body,
            parents,
            children: [], // 将在后处理中填充
            graphInfo
          };
          
          commits.push(commit);
        }
        
        // 后处理：建立父子关系
        this.buildParentChildRelationships(commits);
        
        console.log(`Successfully processed ${commits.length} commits with graph info`);
        return commits;
      },
      "Error getting commit history",
      []
    );
  }

  /**
   * 解析图形信息
   */
  private parseGraphInfo(graphPart: string, isMerge: boolean): GitGraphInfo {
    const lanes: GitLane[] = [];
    let column = 0;
    
    // 改进的图形解析 - 正确处理git log --graph的输出格式
    // git log --graph的输出格式：每个字符位置代表一列
    // 主分支通常在最左侧，次要分支向右延伸
    
    // 找到提交节点（*）的位置
    const commitIndex = graphPart.indexOf('*');
    if (commitIndex !== -1) {
      // 直接使用字符位置作为列号，确保位置一致性
      column = commitIndex;
    }
    
    // 生成颜色（基于列号）
    const colors = ['#007acc', '#f14c4c', '#00aa00', '#ff8800', '#aa00aa', '#00aaaa'];
    const color = colors[column % colors.length];
    
    // 解析所有活跃的车道
    for (let i = 0; i < graphPart.length; i++) {
      const char = graphPart[i];
      if (char === '*' || char === '|' || char === '\\' || char === '/') {
        // 为每个活跃位置创建车道
        const laneColor = colors[i % colors.length];
        
        let laneType: 'commit' | 'line' | 'merge' | 'fork' = 'line';
        let direction: 'up' | 'down' | 'left' | 'right' | undefined;
        
        // 根据字符类型确定车道类型和方向
        if (char === '*') {
          laneType = 'commit';
        } else if (char === '|') {
          laneType = 'line';
          direction = 'up';
        } else if (char === '\\') {
          laneType = 'merge';
          direction = 'right';
        } else if (char === '/') {
          laneType = 'fork';
          direction = 'left';
        }
        
        lanes.push({
          type: laneType,
          color: laneColor,
          column: i,
          direction,
          char
        });
      }
    }
    
    // 如果没有找到任何车道，至少创建一个提交车道
    if (lanes.length === 0) {
      lanes.push({
        type: 'commit',
        color: colors[0],
        column: 0
      });
    }
    
    // 如果是合并提交，添加合并信息
    const mergeInfo = isMerge ? {
      isMerge: true,
      mergeFrom: column + 1,
      mergeTo: column
    } : undefined;
    
    return {
      column,
      lanes,
      mergeInfo
    };
  }
  
  /**
   * 建立父子关系
   */
  private buildParentChildRelationships(commits: GitCommit[]): void {
    const commitMap = new Map<string, GitCommit>();
    
    // 创建哈希到提交的映射
    commits.forEach(commit => {
      commitMap.set(commit.hash, commit);
    });
    
    // 建立父子关系
    commits.forEach(commit => {
      commit.parents.forEach(parentHash => {
        const parent = commitMap.get(parentHash);
        if (parent) {
          parent.children.push(commit.hash);
        }
      });
    });
  }

  /**
   * 获取提交总数
   */
  async getTotalCommitCount(branch?: string): Promise<number> {
    return this.executeGitCommand(
      async () => {
        const options: string[] = ["rev-list", "--count"];
        if (branch && branch !== 'all') {
          options.push(branch);
        } else {
          options.push("--all");
        }

        const result = await this.git!.raw(options);
        return parseInt(result.trim()) || 0;
      },
      "Error getting total commit count",
      0
    );
  }

  /**
   * 获取提交详情和文件变更
   */
  async getCommitDetails(
    hash: string
  ): Promise<{ commit: GitCommit; files: GitFileChange[] } | null> {
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
          this.getCommitFileChanges(hash),
        ]);

        const result = {
          commit: {
            hash: commit.hash,
            date: commit.date,
            message: commit.message,
            author: commit.author_name || "",
            email: commit.author_email || "",
            refs: commit.refs || "",
            body: commit.body || "",
            parents: [], // 在详情视图中不需要父子关系
            children: [],
          },
          files,
        };

        // 缓存结果
        this.cacheCommitDetails(hash, result);

        console.log(
          `Successfully processed commit ${hash.substring(0, 8)} with ${
            files.length
          } files`
        );
        return result;
      },
      "Error getting commit details",
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
    console.log("Trying to get commit info with show command...");
    const showOutput = await this.git!.show([
      "--format=fuller",
      "--no-patch",
      "--encoding=UTF-8",
      hash,
    ]);

    return this.parseShowOutput(showOutput, hash);
  }

  /**
   * 缓存提交详情
   */
  private cacheCommitDetails(
    hash: string,
    details: { commit: GitCommit; files: GitFileChange[] }
  ) {
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
    console.log("Commit details cache cleared");
  }

  /**
   * 解析git show命令输出
   */
  private parseShowOutput(showOutput: string, hash: string): any {
    const lines = showOutput.split("\n");
    const commitInfo: any = { hash };

    for (const line of lines) {
      if (line.startsWith("Author:")) {
        const authorMatch = line.match(/Author:\s+(.+?)\s+<(.+?)>/);
        if (authorMatch) {
          commitInfo.author_name = authorMatch[1];
          commitInfo.author_email = authorMatch[2];
        }
      } else if (line.startsWith("AuthorDate:")) {
        commitInfo.date = line.replace("AuthorDate:", "").trim();
      } else if (
        line.trim() &&
        !line.startsWith("commit") &&
        !line.startsWith("Author") &&
        !line.startsWith("Commit") &&
        !line.startsWith("Date")
      ) {
        if (!commitInfo.message) {
          commitInfo.message = line.trim();
        } else if (!commitInfo.body) {
          commitInfo.body = line.trim();
        }
      }
    }

    if (!commitInfo.message) {
      commitInfo.message = "No commit message";
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
      console.log(
        "Regular commit method failed, trying initial commit method:",
        error
      );
      return this.getInitialCommitFiles(hash);
    }
  }

  /**
   * 获取初始提交的文件列表
   */
  private async getInitialCommitFiles(hash: string): Promise<GitFileChange[]> {
    console.log("Processing initial commit...");

    // 尝试多种方法获取文件变更
    const methods = [
      () => this.getFilesWithNumstat(hash),
      () => this.getFilesWithNameStatus(hash, true),
      () => this.getFilesWithLsTree(hash),
    ];

    for (const method of methods) {
      try {
        const files = await method();
        if (files.length > 0) {
          console.log(`Found ${files.length} files`);
          return files;
        }
      } catch (error) {
        console.log("Method failed, trying next:", error);
      }
    }

    return [];
  }

  /**
   * 获取普通提交的文件列表
   */
  private async getRegularCommitFiles(hash: string): Promise<GitFileChange[]> {
    console.log("Processing regular commit...");

    // 优化：直接使用最高效的numstat方法
    // numstat通常是最快且最可靠的方法
    try {
      const files = await this.getFilesWithNumstat(hash);
      console.log(`Found ${files.length} files with numstat`);
      return files;
    } catch (error) {
      console.log("Numstat method failed, trying diffSummary:", error);
      // 如果numstat失败，尝试diffSummary作为备选
      try {
        const files = await this.getFilesWithDiffSummary(hash);
        console.log(`Found ${files.length} files with diffSummary`);
        return files;
      } catch (error2) {
        console.log("DiffSummary method also failed:", error2);
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
      "--numstat",
      "--format=", // 不显示commit信息
      hash,
    ]);
    const lines = numstatOutput
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    return lines
      .map((line) => {
        const parts = line.split("\t");
        if (parts.length < 3) return null; // 跳过无效行

        const insertions = parts[0] === "-" ? 0 : parseInt(parts[0]) || 0;
        const deletions = parts[1] === "-" ? 0 : parseInt(parts[1]) || 0;
        const fileName = parts[2] || "";

        return {
          file: fileName,
          insertions,
          deletions,
          binary: parts[0] === "-" && parts[1] === "-",
        };
      })
      .filter((item): item is GitFileChange => item !== null); // 过滤掉null值并修复类型
  }

  /**
   * 使用name-status方法获取文件变更
   */
  private async getFilesWithNameStatus(
    hash: string,
    isInitial: boolean
  ): Promise<GitFileChange[]> {
    const showOutput = await this.git!.show([
      "--name-status",
      "--format=",
      "--encoding=UTF-8",
      hash,
    ]);
    const lines = showOutput
      .trim()
      .split("\n")
      .filter((line) => line.trim());
    const files: GitFileChange[] = [];

    for (const line of lines) {
      const parts = line.split("\t");
      const status = parts[0];
      const fileName = parts[1] || "";

      if (status === "A" && isInitial) {
        try {
          const fileContent = await this.git!.show([`${hash}:${fileName}`]);
          const lineCount = fileContent.split("\n").length;
          files.push({
            file: fileName,
            insertions: lineCount,
            deletions: 0,
            binary: false,
          });
        } catch {
          files.push({
            file: fileName,
            insertions: 1,
            deletions: 0,
            binary: true,
          });
        }
      } else {
        files.push({
          file: fileName,
          insertions: status === "A" ? 1 : 0,
          deletions: status === "D" ? 1 : 0,
          binary: false,
        });
      }
    }

    return files;
  }

  /**
   * 使用ls-tree方法获取文件变更
   */
  private async getFilesWithLsTree(hash: string): Promise<GitFileChange[]> {
    const lsTreeOutput = await this.git!.raw([
      "ls-tree",
      "-r",
      "--name-only",
      hash,
    ]);
    const fileNames = lsTreeOutput
      .trim()
      .split("\n")
      .filter((name) => name.trim());

    return fileNames.map((fileName) => ({
      file: fileName,
      insertions: 1,
      deletions: 0,
      binary: false,
    }));
  }

  /**
   * 使用diff summary方法获取文件变更
   */
  private async getFilesWithDiffSummary(
    hash: string
  ): Promise<GitFileChange[]> {
    const diffSummary = await this.git!.diffSummary([`${hash}^`, hash]);
    return diffSummary.files.map((file) => ({
      file: file.file,
      insertions: "insertions" in file ? file.insertions : 0,
      deletions: "deletions" in file ? file.deletions : 0,
      binary: file.binary,
    }));
  }

  /**
   * 合并多个提交为一个提交
   * @param commits 要合并的提交对象数组
   * @returns 是否成功合并
   */
  async squashCommits(commits: GitCommit[]): Promise<boolean> {
    if (!this.git || commits.length < 2) {
      return false;
    }

    return this.executeGitCommand(
      async () => {
        // 按时间排序（从旧到新）
        const sortedCommits = [...commits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // 检查提交是否连续
        const isConsecutive = await this.areCommitsConsecutive(sortedCommits.map(c => c.hash));
        
        // 获取要合并的提交的消息
        const commitMessages = sortedCommits.map(c => c.message);
        const defaultMessage = commitMessages.join('\n\n');

        // 弹出对话框让用户输入提交消息
        const userMessage = await vscode.window.showInputBox({
          title: 'Squash Commits',
          prompt: `合并 ${commits.length} 个提交${isConsecutive ? '（连续提交）' : '（⚠️ 非连续提交）'}`,
          value: defaultMessage,
          placeHolder: '请输入新的提交消息...',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return '提交消息不能为空';
            }
            return null;
          }
        });

        // 如果用户取消了输入，则取消操作
        if (userMessage === undefined) {
          return false;
        }

        // 执行 squash 操作
        if (isConsecutive) {
          return await this.performConsecutiveSquash(sortedCommits, userMessage.trim());
        } else {
          return await this.performNonConsecutiveSquash(sortedCommits, userMessage.trim());
        }
      },
      "Squash failed",
      false
    );
  }

  /**
   * 检查提交是否连续
   * @param sortedHashes 按时间排序的提交哈希数组
   * @returns 是否连续
   */
  private async areCommitsConsecutive(sortedHashes: string[]): Promise<boolean> {
    if (sortedHashes.length < 2) {
      return true;
    }

    try {
      for (let i = 0; i < sortedHashes.length - 1; i++) {
        const currentHash = sortedHashes[i];
        const nextHash = sortedHashes[i + 1];
        
        // 检查 nextHash 的父提交是否是 currentHash
        const parents = await this.git!.raw(['rev-list', '--parents', '-n', '1', nextHash]);
        const parentHashes = parents.trim().split(' ').slice(1); // 第一个是提交本身，后面是父提交
        
        if (!parentHashes.includes(currentHash)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      console.warn('Failed to check commit consecutiveness:', error);
      return false;
    }
  }

  /**
   * 执行连续提交的 squash
   * @param commits 按时间排序的提交对象
   * @param message 新的提交消息
   * @returns 是否成功
   */
  private async performConsecutiveSquash(
    commits: GitCommit[], 
    message: string
  ): Promise<boolean> {
    try {
      const oldestHash = commits[0].hash;
      
      // 使用 git reset 到最旧提交的父提交
      const parentHash = await this.git!.raw(['rev-parse', `${oldestHash}^`]);
      await this.git!.reset(['--soft', parentHash.trim()]);
      
      // 创建新的合并提交
      await this.git!.commit(message);
      
      return true;
    } catch (error) {
      console.error('Failed to perform consecutive squash:', error);
      return false;
    }
  }

  /**
   * 执行非连续提交的 squash（使用 rebase 方式保留中间提交）
   * @param commits 按时间排序的提交对象
   * @param message 新的提交消息
   * @returns 是否成功
   */
  private async performNonConsecutiveSquash(
    commits: GitCommit[], 
    message: string
  ): Promise<boolean> {
    try {
      // 对于非连续提交，我们不能简单地合并，因为这会丢失中间的提交
      // 正确的做法是告知用户这种操作的风险，并提供替代方案
      
      const choice = await vscode.window.showWarningMessage(
        '非连续提交的 squash 操作存在风险，可能会导致历史记录混乱。建议的替代方案：\n\n' +
        '1. 使用 "git rebase -i" 手动重新排列和合并提交\n' +
        '2. 分别对连续的提交组进行 squash\n' +
        '3. 使用 cherry-pick 将需要的更改应用到新分支\n\n' +
        '如果您确定要继续，我们将创建一个包含所有选中更改的新提交，但这会改变 Git 历史。',
        { modal: true },
        '继续（创建新提交）',
        '取消',
        '了解更多'
      );
      
      if (choice === '取消' || choice === undefined) {
        return false;
      }
      
      if (choice === '了解更多') {
        vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/book/zh/v2/Git-%E5%B7%A5%E5%85%B7-%E9%87%8D%E5%86%99%E5%8E%86%E5%8F%B2'));
        return false;
      }
      
      // 如果用户选择继续，我们使用一种更安全的方法
      return await this.performSafeNonConsecutiveSquash(commits, message);
      
    } catch (error) {
      console.error('Failed to perform non-consecutive squash:', error);
      return false;
    }
  }

  /**
   * 执行非连续提交合并
   * 将选中的提交合并为一个新提交，同时保留未选中的提交
   * @param commits 按时间排序的提交对象
   * @param message 新的提交消息
   * @returns 是否成功
   */
  private async performSafeNonConsecutiveSquash(
    commits: GitCommit[], 
    message: string
  ): Promise<boolean> {
    try {
      // 获取当前工作目录状态
      const status = await this.git!.status();
      if (status.files.length > 0) {
        vscode.window.showErrorMessage('工作目录不干净，请先提交或暂存当前更改');
        return false;
      }

      // 获取当前分支名
      const currentBranch = await this.git!.revparse(['--abbrev-ref', 'HEAD']);
      const branchName = currentBranch.trim();
      
      // 获取所有提交的哈希列表（用于重建历史）
      const selectedHashes = new Set(commits.map(c => c.hash));
      
      // 获取从最早选中提交到HEAD的所有提交
      const oldestCommit = commits[0];
      const allCommitsOutput = await this.git!.raw([
        'rev-list', '--reverse', `${oldestCommit.hash}^..HEAD`
      ]);
      const allCommitHashes = allCommitsOutput.trim().split('\n').filter(h => h);
      
      // 分离选中和未选中的提交
      const selectedCommitHashes: string[] = [];
      const unselectedCommitHashes: string[] = [];
      
      for (const hash of allCommitHashes) {
        if (selectedHashes.has(hash)) {
          selectedCommitHashes.push(hash);
        } else {
          unselectedCommitHashes.push(hash);
        }
      }
      
      console.log('Selected commits:', selectedCommitHashes.map(h => h.substring(0, 8)));
      console.log('Unselected commits:', unselectedCommitHashes.map(h => h.substring(0, 8)));
      
      // 找到最早选中提交的父提交作为基础点
      let baseCommit: string;
      try {
        baseCommit = await this.git!.raw(['rev-parse', `${oldestCommit.hash}^`]);
        baseCommit = baseCommit.trim();
      } catch (error) {
        // 如果是初始提交，使用空树
        baseCommit = await this.git!.raw(['hash-object', '-t', 'tree', '/dev/null']);
        baseCommit = baseCommit.trim();
      }
      
      // 创建临时分支从基础点开始
      const tempBranchName = `temp-squash-${Date.now()}`;
      await this.git!.checkoutBranch(tempBranchName, baseCommit);
      
      // 第一步：创建合并后的提交（只包含选中的提交）
      let hasChanges = false;
      const successfulCommits: string[] = [];
      
      for (const commitHash of selectedCommitHashes) {
        try {
          console.log(`Cherry-picking selected commit: ${commitHash.substring(0, 8)}`);
          
          // 使用 cherry-pick --no-commit 来应用单个提交的更改
          await this.git!.raw(['cherry-pick', '--no-commit', commitHash]);
          
          // 检查是否有更改被应用
          const statusAfterPick = await this.git!.status();
          if (statusAfterPick.files.length > 0) {
            hasChanges = true;
            successfulCommits.push(commitHash);
            console.log(`Successfully applied changes from: ${commitHash.substring(0, 8)}`);
          } else {
            console.log(`No new changes from commit: ${commitHash.substring(0, 8)}`);
          }
          
        } catch (cherryPickError) {
          console.warn(`Failed to cherry-pick commit ${commitHash}:`, cherryPickError);
          
          // 检查是否是因为更改已经存在
          const errorMessage = String(cherryPickError);
          if (errorMessage.includes('empty') || errorMessage.includes('nothing to commit')) {
            console.log(`Commit ${commitHash.substring(0, 8)} appears to be empty or already applied`);
            successfulCommits.push(commitHash);
          } else {
            // 如果是其他错误，尝试重置并继续
            try {
              await this.git!.raw(['reset', '--hard', 'HEAD']);
              console.log(`Reset after failed cherry-pick of ${commitHash.substring(0, 8)}`);
            } catch (resetError) {
              console.error('Failed to reset after cherry-pick failure:', resetError);
            }
            
            vscode.window.showWarningMessage(
              `提交 ${commitHash.substring(0, 8)} 无法应用，可能存在冲突，已跳过`
            );
          }
        }
      }
      
      if (!hasChanges && successfulCommits.length === 0) {
        vscode.window.showWarningMessage(
          '无法创建squash提交：没有检测到任何更改。\n' +
          '这可能是因为选中的提交更改已经被后续提交覆盖或者存在冲突。'
        );
        await this.git!.checkout(branchName);
        await this.git!.deleteLocalBranch(tempBranchName, true);
        return false;
      }
      
      // 如果有更改，添加到索引并创建合并提交
      if (hasChanges) {
        await this.git!.add('.');
      }
      
      // 创建合并提交
      let squashCommitHash: string;
      if (hasChanges || successfulCommits.length > 0) {
        try {
          await this.git!.commit(message);
          squashCommitHash = await this.git!.revparse(['HEAD']);
          squashCommitHash = squashCommitHash.trim();
        } catch (commitError) {
          // 如果普通提交失败，尝试允许空提交
          console.warn('Normal commit failed, trying with --allow-empty:', commitError);
          await this.git!.raw(['commit', '--allow-empty', '-m', message]);
          squashCommitHash = await this.git!.revparse(['HEAD']);
          squashCommitHash = squashCommitHash.trim();
        }
      } else {
        vscode.window.showWarningMessage('没有任何提交被成功处理');
        await this.git!.checkout(branchName);
        await this.git!.deleteLocalBranch(tempBranchName, true);
        return false;
      }
      
      console.log(`Created squash commit: ${squashCommitHash.substring(0, 8)}`);
      
      // 第二步：重建历史 - 应用未选中的提交
      for (const commitHash of unselectedCommitHashes) {
        try {
          console.log(`Reapplying unselected commit: ${commitHash.substring(0, 8)}`);
          await this.git!.raw(['cherry-pick', commitHash]);
        } catch (cherryPickError) {
          console.warn(`Failed to reapply commit ${commitHash}:`, cherryPickError);
          
          // 尝试解决冲突或跳过
          const errorMessage = String(cherryPickError);
          if (errorMessage.includes('empty') || errorMessage.includes('nothing to commit')) {
            try {
              await this.git!.raw(['cherry-pick', '--skip']);
            } catch (skipError) {
              console.warn('Failed to skip empty commit:', skipError);
            }
          } else {
            // 对于其他冲突，提示用户
            vscode.window.showWarningMessage(
              `重新应用提交 ${commitHash.substring(0, 8)} 时发生冲突，请手动解决后继续`
            );
            
            // 清理状态
            try {
              await this.git!.raw(['cherry-pick', '--abort']);
            } catch (abortError) {
              console.warn('Failed to abort cherry-pick:', abortError);
            }
            
            // 回到原分支并清理
            await this.git!.checkout(branchName);
            await this.git!.deleteLocalBranch(tempBranchName, true);
            return false;
          }
        }
      }
      
      // 第三步：将重建的历史应用到原分支
      const newHeadHash = await this.git!.revparse(['HEAD']);
      console.log(`New head after rebuilding: ${newHeadHash.trim().substring(0, 8)}`);
      
      // 切换回原分支并重置到新的历史
      await this.git!.checkout(branchName);
      await this.git!.raw(['reset', '--hard', newHeadHash.trim()]);
      
      // 删除临时分支
      await this.git!.deleteLocalBranch(tempBranchName, true);
      
      vscode.window.showInformationMessage(
        `成功将 ${successfulCommits.length} 个选中的提交合并，同时保留了 ${unselectedCommitHashes.length} 个未选中的提交`
      );
      
      return true;
      
    } catch (error) {
      console.error('Failed to perform non-consecutive squash:', error);
      
      // 清理cherry-pick状态（如果存在）
      try {
        const status = await this.git!.status();
        if (status.current === null || String(status).includes('cherry-pick')) {
          console.log('Cleaning up cherry-pick state...');
          await this.git!.raw(['cherry-pick', '--abort']);
        }
      } catch (cherryPickCleanupError) {
        console.warn('Failed to cleanup cherry-pick state:', cherryPickCleanupError);
      }
      
      // 清理临时分支
      try {
        const currentBranch = await this.git!.revparse(['--abbrev-ref', 'HEAD']);
        const branchName = currentBranch.trim();
        
        if (branchName.startsWith('temp-squash-')) {
          // 如果当前在临时分支，切换回主分支
          const branches = await this.git!.branch(['--list']);
          const mainBranch = branches.all.find(b => 
            !b.startsWith('temp-squash-') && !b.startsWith('remotes/')
          ) || 'main';
          await this.git!.checkout(mainBranch);
          await this.git!.deleteLocalBranch(branchName, true);
        } else {
          // 如果不在临时分支，删除所有临时分支
          const branches = await this.git!.branch(['--list']);
          for (const branch of branches.all) {
            if (branch.startsWith('temp-squash-')) {
              await this.git!.deleteLocalBranch(branch, true);
            }
          }
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup after squash failure:', cleanupError);
      }
      
      vscode.window.showErrorMessage(`合并失败: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 获取指定提交中文件的内容
   * @param hash 提交哈希
   * @param filePath 文件路径
   * @returns 文件内容
   */
  async getFileDiff(hash: string, filePath: string): Promise<string> {
    if (!this.git) {
      return "";
    }

    return this.executeGitCommand(
      async () => {
        return await this.git!.show([`${hash}:${filePath}`]);
      },
      "Failed to get file content",
      ""
    );
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

    return this.executeGitCommand(
      async () => {
        await this.git!.raw(["cherry-pick", hash]);
        return true;
      },
      "Cherry-pick failed",
      false
    );
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

    return this.executeGitCommand(
      async () => {
        await this.git!.revert(hash);
        return true;
      },
      "Revert failed",
      false
    );
  }

  /**
   * 重置到指定提交
   * @param hash 提交哈希
   * @param mode 重置模式
   * @returns 是否成功重置
   */
  async resetToCommit(
    hash: string,
    mode: "soft" | "mixed" | "hard" = "mixed"
  ): Promise<boolean> {
    if (!this.git) {
      return false;
    }

    return this.executeGitCommand(
      async () => {
        await this.git!.reset([`--${mode}`, hash]);
        return true;
      },
      "Reset failed",
      false
    );
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

    return this.executeGitCommand(
      async () => {
        const diffSummary = await this.git!.diffSummary([hash1, hash2]);
        return diffSummary.files.map((file) => ({
          file: file.file,
          insertions: "insertions" in file ? file.insertions : 0,
          deletions: "deletions" in file ? file.deletions : 0,
          binary: file.binary,
        }));
      },
      "Failed to compare commits",
      []
    );
  }

  /**
   * 获取HEAD提交信息
   * @returns HEAD提交信息
   */
  async getHeadCommit(): Promise<GitCommit | null> {
    if (!this.git) {
      return null;
    }

    return this.executeGitCommand(
      async () => {
        const log = await this.git!.log({ maxCount: 1 });
        if (log.all.length === 0) {
          return null;
        }

        const commit = log.all[0];
        return {
          hash: commit.hash,
          date: commit.date,
          message: commit.message,
          author: (commit as any).author_name || "",
          email: (commit as any).author_email || "",
          refs: commit.refs || "",
          body: (commit as any).body || "",
          parents: [],
          children: [],
        };
      },
      "Failed to get HEAD commit",
      null
    );
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
      await this.git.raw(["rev-parse", `${hash}^`]);
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

    return this.executeGitCommand(
      async () => {
        return await this.git!.show([`${hash}:${filePath}`]);
      },
      "Failed to get file content",
      null
    );
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

    return this.executeGitCommand(
      async () => {
        const log = await this.git!.log({
          file: filePath,
          format: {
            hash: "%H",
            date: "%ai",
            message: "%s",
            author: "%an",
            email: "%ae",
            refs: "%D",
            body: "%b",
          },
        });

        return log.all.map((commit) => ({
          hash: commit.hash,
          date: commit.date,
          message: commit.message,
          author: (commit as any).author_name || "",
          email: (commit as any).author_email || "",
          refs: commit.refs || "",
          body: (commit as any).body || "",
          parents: [],
          children: [],
        }));
      },
      "Failed to get file history",
      []
    );
  }

  /**
   * 获取远程仓库URL
   * @returns 远程仓库URL
   */
  async getRemoteUrl(): Promise<string | null> {
    if (!this.git) {
      return null;
    }

    return this.executeGitCommand(
      async () => {
        const remotes = await this.git!.getRemotes(true);

        // 优先查找 origin，如果没有则使用第一个远程仓库
        const origin = remotes.find((remote) => remote.name === "origin");
        const remote = origin || remotes[0];

        if (remote && remote.refs && remote.refs.fetch) {
          return remote.refs.fetch;
        }

        return null;
      },
      "Failed to get remote URL",
      null
    );
  }

  /**
   * 获取文件的差异内容
   * @param hash 提交哈希
   * @param filePath 文件路径
   * @returns 文件差异内容
   */
  async getFileDiffContent(
    hash: string,
    filePath: string
  ): Promise<string | null> {
    if (!this.git) {
      return null;
    }

    return this.executeGitCommand(
      async () => {
        // 检查是否是初始提交
        const isInitial = await this.isInitialCommit(hash);

        if (isInitial) {
          // 对于初始提交，使用 git show 命令生成标准的 diff 格式
          const diff = await this.git!.show([
            "--format=",
            hash,
            "--",
            filePath,
          ]);
          return diff || "No changes in this file";
        } else {
          // 对于普通提交，显示与父提交的差异
          const diff = await this.git!.diff([`${hash}^`, hash, "--", filePath]);
          return diff || "No changes in this file";
        }
      },
      "Failed to get file diff content",
      null
    );
  }

  /**
   * 从远程仓库拉取代码
   * @returns 是否成功
   */
  async pullFromRemote(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      await this.git.pull();
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Pull failed: ${errorMessage}`);
    }
  }

  /**
   * 从指定远程分支拉取代码
   * @param remote 远程仓库名称
   * @param branch 分支名称
   * @param rebase 是否使用rebase
   * @returns 是否成功
   */
  async pullFromRemoteBranch(remote: string, branch: string, rebase: boolean = false): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      if (rebase) {
        await this.git.pull(remote, branch, { '--rebase': 'true' });
      } else {
        await this.git.pull(remote, branch);
      }
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      const operation = rebase ? 'Pull with rebase' : 'Pull';
      throw new Error(`${operation} failed: ${errorMessage}`);
    }
  }

  /**
   * 推送代码到远程仓库
   * @returns 是否成功
   */
  async pushToRemote(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      await this.git.push();
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Push failed: ${errorMessage}`);
    }
  }

  /**
   * 推送代码到指定远程分支
   * @param remote 远程仓库名称
   * @param branch 分支名称
   * @param force 是否强制推送
   * @returns 是否成功
   */
  async pushToRemoteBranch(remote: string, branch: string, force: boolean = false): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const options: any = {};
      if (force) {
        options['--force'] = null;
      }
      await this.git.push(remote, branch, options);
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      const operation = force ? 'Force push' : 'Push';
      throw new Error(`${operation} failed: ${errorMessage}`);
    }
  }

  /**
   * 获取远程仓库列表
   * @returns 远程仓库列表
   */
  async getRemotes(): Promise<string[]> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const remotes = await this.git.getRemotes();
      return remotes.map(remote => remote.name);
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Get remotes failed: ${errorMessage}`);
    }
  }

  /**
   * 获取远程分支列表
   * @param remote 远程仓库名称
   * @returns 远程分支列表
   */
  async getRemoteBranches(remote: string): Promise<string[]> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const branches = await this.git.branch(['-r']);
      return branches.all
        .filter(branch => branch.startsWith(`${remote}/`))
        .map(branch => branch.replace(`${remote}/`, ''))
        .filter(branch => branch !== 'HEAD');
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Get remote branches failed: ${errorMessage}`);
    }
  }

  /**
   * 获取所有远程分支列表（包含远程仓库名称）
   * @returns 远程分支列表，格式为 remote/branch
   */
  async getAllRemoteBranches(): Promise<string[]> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const branches = await this.git.branch(['-r']);
      return branches.all
        .filter(branch => !branch.includes('HEAD'))
        .map(branch => branch.trim());
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Get all remote branches failed: ${errorMessage}`);
    }
  }

  /**
   * 从指定的完整远程分支拉取代码
   * @param remoteBranch 完整的远程分支名称，格式为 remote/branch
   * @param rebase 是否使用rebase
   * @returns 是否成功
   */
  async pullFromFullRemoteBranch(remoteBranch: string, rebase: boolean = false): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const [remote, branch] = remoteBranch.split('/', 2);
      if (!remote || !branch) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }

      if (rebase) {
        await this.git.pull(remote, branch, { '--rebase': 'true' });
      } else {
        await this.git.pull(remote, branch);
      }
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      const operation = rebase ? 'Pull with rebase' : 'Pull';
      throw new Error(`${operation} failed: ${errorMessage}`);
    }
  }

  /**
   * 推送到指定的完整远程分支
   * @param remoteBranch 完整的远程分支名称，格式为 remote/branch
   * @param force 是否强制推送
   * @returns 是否成功
   */
  async pushToFullRemoteBranch(remoteBranch: string, force: boolean = false): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const [remote, branch] = remoteBranch.split('/', 2);
      if (!remote || !branch) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }

      const options: any = {};
      if (force) {
        options['--force'] = null;
      }
      await this.git.push(remote, branch, options);
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      const operation = force ? 'Force push' : 'Push';
      throw new Error(`${operation} failed: ${errorMessage}`);
    }
  }

  /**
   * 从远程仓库抓取代码
   * @returns 是否成功
   */
  async fetchFromRemote(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      await this.git.fetch();
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Fetch failed: ${errorMessage}`);
    }
  }

  /**
   * 克隆远程仓库
   * @param repoUrl 仓库URL
   * @param targetPath 目标路径
   * @returns 克隆后的路径或null
   */
  async cloneRepository(repoUrl: string, targetPath: string): Promise<string | null> {
    try {
      const path = require('path');
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repository';
      const clonePath = path.join(targetPath, repoName);
      
      await simpleGit().clone(repoUrl, clonePath);
      return clonePath;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Clone failed: ${errorMessage}`);
    }
  }

  /**
   * 切换到指定分支
   * @param branchName 分支名称
   * @returns 是否成功
   */
  async checkoutBranch(branchName: string): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      await this.git.checkout(branchName);
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Checkout failed: ${errorMessage}`);
    }
  }

  /**
   * 创建并切换到新分支
   * @param branchName 新分支名称
   * @returns 是否成功
   */
  async createAndCheckoutBranch(branchName: string): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      await this.git.checkoutLocalBranch(branchName);
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      throw new Error(`Create and checkout branch failed: ${errorMessage}`);
    }
  }
}
