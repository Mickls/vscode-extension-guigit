import * as vscode from "vscode";
import { GitCommit, GitBranch, GitRepository, GitFileChange } from "./types/gitTypes";
import { isNetworkError } from "./utils/gitUtils";
import { GitCacheManager } from "./cache/gitCacheManager";
import { GitRepositoryManager } from "./repository/gitRepositoryManager";
import { GitBranchOperations } from "./operations/branchOperations";
import { GitRemoteOperations } from "./operations/remoteOperations";
import { GitCommitOperations } from "./operations/commitOperations";
import { GitFileOperations } from "./operations/fileOperations";
import { GitSafetyOperations } from "./operations/safetyOperations";


/**
 * Git操作提供者，封装所有Git相关功能
 */
export class GitHistoryProvider {
  // 管理器实例
  private repoManager: GitRepositoryManager;
  private cacheManager: GitCacheManager;
  
  // 自动修剪 fetch 节流控制
  private lastAutoPruneFetchTime: number = 0;
  private autoFetchInProgress: boolean = false;
  private readonly AUTO_PRUNE_FETCH_INTERVAL = 10 * 60 * 1000; // 10分钟

  constructor() {
    // 初始化管理器
    this.repoManager = new GitRepositoryManager();
    this.cacheManager = new GitCacheManager();
    
    // 异步初始化
    this.initializeGit().catch((error) => {
      console.error("Git初始化失败:", error);
    });
  }

  /** 获取当前 Git 实例（向后兼容的 getter） */
  private get git() {
    return this.repoManager.getGit();
  }

  private get branchOps(): GitBranchOperations | null {
    const git = this.git;
    return git ? new GitBranchOperations(git) : null;
  }

  private get remoteOps(): GitRemoteOperations | null {
    const git = this.git;
    return git ? new GitRemoteOperations(git) : null;
  }

  private get commitOps(): GitCommitOperations | null {
    const git = this.git;
    return git ? new GitCommitOperations(git!, this.cacheManager) : null;
  }

  private get fileOps(): GitFileOperations | null {
    const git = this.git;
    return git ? new GitFileOperations(git!) : null;
  }

  private get safetyOps(): GitSafetyOperations | null {
    const git = this.git;
    return git ? new GitSafetyOperations(git) : null;
  }

  /**
   * 获取当前Git用户信息（带缓存优化）
   */
  private async getCurrentUserInfo(): Promise<{
    name: string;
    email: string;
  } | null> {
    const git = this.git;
    if (!git) {
      return null;
    }

    // 检查缓存是否有效
    const cachedUserInfo = this.cacheManager.getCachedUserInfo();
    if (cachedUserInfo) {
      return cachedUserInfo;
    }

    try {
      const name = await git.raw(["config", "user.name"]);
      const email = await git.raw(["config", "user.email"]);
      const userInfo = {
        name: name.trim(),
        email: email.trim(),
      };

      // 更新缓存
      this.cacheManager.cacheUserInfo(userInfo);

      return userInfo;
    } catch (error) {
      console.warn("Failed to get current user info:", error);
      return null;
    }
  }

  /**
   * 获取最新提交的哈希值
   */
  private async getLatestCommitHash(): Promise<string | null> {
    const git = this.git;
    if (!git) {
      return null;
    }

    try {
      const result = await git.raw(["rev-parse", "HEAD"]);
      return result.trim();
    } catch (error) {
      console.warn("Failed to get latest commit hash:", error);
      return null;
    }
  }

  /**
   * 初始化Git实例
   */
  private async initializeGit() {
    await this.repoManager.initialize();
  }

  /**
   * 获取所有可用的Git仓库
   */
  getAvailableRepositories(): GitRepository[] {
    return this.repoManager.getAvailableRepositories();
  }

  /**
   * 获取当前活动的仓库
   */
  getCurrentRepository(): GitRepository | null {
    return this.repoManager.getCurrentRepository();
  }

  /**
   * 设置当前仓库
   */
  async setCurrentRepository(repository: GitRepository): Promise<void> {
    await this.repoManager.setCurrentRepository(repository);

    // 清除缓存
    this.cacheManager.clearAll();

    console.log(`切换到仓库: ${repository.name} (${repository.path})`);
  }

  /**
   * 刷新代理配置
   */
  public async refreshProxyConfig(): Promise<void> {
    const git = await this.repoManager.refreshProxyConfig();
    if (git) {
      vscode.window.showInformationMessage("代理配置已刷新");
    }
  }

  /**
   * 执行Git命令的通用错误处理包装器（带代理重试机制）
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
    } catch (error: any) {
      const errorStr = error?.message || error?.toString() || "Unknown error";

      // 检查是否是网络连接错误
      if (isNetworkError(errorStr)) {
        console.warn(
          `${errorMessage} - 检测到网络错误，尝试刷新代理配置后重试:`,
          errorStr
        );

        try {
          // 刷新代理配置
          await this.refreshProxyConfig();

          // 重试操作
          return await operation();
        } catch (retryError: any) {
          const retryErrorStr =
            retryError?.message || retryError?.toString() || "Unknown error";
          console.error(`${errorMessage} - 重试失败:`, retryErrorStr);

          // 如果仍然是网络错误，提供更友好的错误信息
          if (isNetworkError(retryErrorStr)) {
            throw new Error(
              `网络连接失败: ${retryErrorStr}\n\n建议:\n1. 检查网络连接\n2. 确认代理设置是否正确\n3. 尝试使用VPN或代理工具`
            );
          }

          throw retryError;
        }
      }

      console.error(`${errorMessage}:`, error);
      throw error;
    }
  }

  /**
   * 获取所有分支信息
   */
  async getBranches(): Promise<GitBranch[]> {
    if (!this.branchOps) {
      throw new Error("Branch operations not available");
    }
    return this.branchOps.getBranches();
  }

  /**
   * 搜索提交
   */
  async searchCommits(
    searchTerm: string,
    branch?: string,
    limit: number = 50,
    authorFilter?: string[]
  ): Promise<GitCommit[]> {
    const commitOps = this.commitOps;
    if (!commitOps) {
      throw new Error("Git not initialized");
    }
    return commitOps.searchCommits(searchTerm, branch, limit, authorFilter);
  }

  async getCommitHistory(
    branch?: string,
    limit: number = 50,
    skip: number = 0,
    authorFilter?: string[]
  ): Promise<GitCommit[]> {
    const commitOps = this.commitOps;
    if (!commitOps) {
      throw new Error("Git not initialized");
    }
    return commitOps.getCommitHistory(branch, limit, skip, authorFilter);
  }



  /**
   * 获取提交总数（带缓存优化）
   */
  async getTotalCommitCount(
    branch?: string,
    authorFilter?: string[]
  ): Promise<number> {
    const commitOps = this.commitOps;
    if (!commitOps) {
      throw new Error("Git instance not available");
    }
    return commitOps.getTotalCommitCount(branch, authorFilter);
  }

  /**
   * 获取提交详情和文件变更
   */
  async getCommitDetails(
    hash: string
  ): Promise<{ commit: GitCommit; files: GitFileChange[] } | null> {
    const commitOps = this.commitOps;
    if (!commitOps) {
      throw new Error("Git not initialized");
    }
    
    // 性能优化：检查缓存
    const cached = this.cacheManager.getCachedCommitDetails(hash);
    if (cached) {
      console.log(`Cache hit for commit ${hash.substring(0, 8)}`);
      return cached;
    }

    return this.executeGitCommand(
      async () => {
        console.log(`Getting commit details for hash: ${hash}`);

        // 并行获取commit信息和文件变更，提升性能
        const [commit, files] = await Promise.all([
          this.getCommitInfo(hash),
          this.getCommitFileChanges(hash),
        ]);

        // 使用委托的方法计算canEditMessage
        const canEditMessage = true

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
            canEditMessage,
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
    // 优先使用明确范围的 log 获取指定哈希的提交，避免仅使用 { from: hash } 导致返回非目标提交
    try {
      const log = await this.git!.log({ from: hash, to: hash, maxCount: 1 });
      if (log.all.length > 0 && (log.all[0].hash === hash || log.all[0].hash.startsWith(hash))) {
        return log.all[0];
      }
    } catch (e) {
      console.warn("git log with range failed, fallback to show", e);
    }

    // 使用 show 作为可靠的后备方案
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
    this.cacheManager.cacheCommitDetails(hash, details);
  }

  /**
   * 清理缓存（用于刷新时）
   */
  public async clearCache() {
    // 清理所有缓存
    this.cacheManager.clearAll();
    console.log("All caches cleared");
  }

  /**
   * 在成功执行可能影响提交历史的 Git 操作后清理相关缓存
   * 这确保了 UI 显示的数据与仓库状态保持一致
   */
  private invalidateCachesAfterHistoryChange() {
    this.cacheManager.clearCommitDetails();
    this.cacheManager.clearTotalCommitCount();
  }

  /**
   * 解析git show命令输出
   */
  private parseShowOutput(showOutput: string, hash: string): any {
    const lines = showOutput.split("\n");
    const commitInfo: any = { hash };
    const messageLines: string[] = [];
    let inMessageSection = false;

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
        // 收集所有commit message行
        messageLines.push(line.trim());
        inMessageSection = true;
      } else if (inMessageSection && line.trim() === "") {
        // 空行也是commit message的一部分
        messageLines.push("");
      }
    }

    // 处理完整的commit message
    if (messageLines.length > 0) {
      // 第一行作为主要message
      commitInfo.message = messageLines[0] || "No commit message";

      // 如果有多行，将剩余部分作为body
      if (messageLines.length > 1) {
        // 移除第一行，剩余的作为body
        const bodyLines = messageLines.slice(1);
        // 移除开头的空行
        while (bodyLines.length > 0 && bodyLines[0] === "") {
          bodyLines.shift();
        }
        // 移除结尾的空行
        while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
          bodyLines.pop();
        }

        if (bodyLines.length > 0) {
          commitInfo.body = bodyLines.join("\n");
        }
      }
    } else {
      commitInfo.message = "No commit message";
    }

    return commitInfo;
  }

  /**
   * 获取提交的文件变更
   */
  private async getCommitFileChanges(hash: string): Promise<GitFileChange[]> {
    if (!this.fileOps) {
      throw new Error("Git not initialized");
    }
    return this.fileOps.getCommitFileChanges(hash);
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

    const result = await this.executeGitCommand(
      async () => {
        // 按时间排序（从旧到新）
        const sortedCommits = [...commits].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // 检查提交是否连续
        const isConsecutive = await this.areCommitsConsecutive(
          sortedCommits.map((c) => c.hash)
        );

        // 获取要合并的提交的消息
        const commitMessages = sortedCommits.map((c) => c.message);
        const defaultMessage = commitMessages.join("\n\n");

        // 弹出对话框让用户输入提交消息
        const userMessage = await vscode.window.showInputBox({
          title: "Squash Commits",
          prompt: `合并 ${commits.length} 个提交${
            isConsecutive ? "（连续提交）" : "（警告：非连续提交）"
          }`,
          value: defaultMessage,
          placeHolder: "请输入新的提交消息...",
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return "提交消息不能为空";
            }
            return null;
          },
        });

        // 如果用户取消了输入，则取消操作
        if (userMessage === undefined) {
          return false;
        }

        // 执行 squash 操作
        if (isConsecutive) {
          return await this.performConsecutiveSquash(
            sortedCommits,
            userMessage.trim()
          );
        } else {
          return await this.performNonConsecutiveSquash(
            sortedCommits,
            userMessage.trim()
          );
        }
      },
      "Squash failed",
      false
    );

    // 清理相关缓存，因为历史已经改变
    if (result) {
      this.invalidateCachesAfterHistoryChange();
    }

    return result;
  }

  /**
   * 检查提交是否连续
   * @param sortedHashes 按时间排序的提交哈希数组
   * @returns 是否连续
   */
  private async areCommitsConsecutive(
    sortedHashes: string[]
  ): Promise<boolean> {
    if (sortedHashes.length < 2) {
      return true;
    }

    try {
      for (let i = 0; i < sortedHashes.length - 1; i++) {
        const currentHash = sortedHashes[i];
        const nextHash = sortedHashes[i + 1];

        // 检查 nextHash 的父提交是否是 currentHash
        const parents = await this.git!.raw([
          "rev-list",
          "--parents",
          "-n",
          "1",
          nextHash,
        ]);
        const parentHashes = parents.trim().split(" ").slice(1); // 第一个是提交本身，后面是父提交

        if (!parentHashes.includes(currentHash)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      console.warn("Failed to check commit consecutiveness:", error);
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
      const parentHash = await this.git!.raw(["rev-parse", `${oldestHash}^`]);
      await this.git!.reset(["--soft", parentHash.trim()]);

      // 创建新的合并提交
      await this.git!.commit(message);

      return true;
    } catch (error) {
      console.error("Failed to perform consecutive squash:", error);
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
        "非连续提交的 squash 操作存在风险，可能会导致历史记录混乱。建议的替代方案：\n\n" +
          '1. 使用 "git rebase -i" 手动重新排列和合并提交\n' +
          "2. 分别对连续的提交组进行 squash\n" +
          "3. 使用 cherry-pick 将需要的更改应用到新分支\n\n" +
          "如果您确定要继续，我们将创建一个包含所有选中更改的新提交，但这会改变 Git 历史。",
        { modal: true },
        "继续（创建新提交）",
        "取消",
        "了解更多"
      );

      if (choice === "取消" || choice === undefined) {
        return false;
      }

      if (choice === "了解更多") {
        vscode.env.openExternal(
          vscode.Uri.parse(
            "https://git-scm.com/book/zh/v2/Git-%E5%B7%A5%E5%85%B7-%E9%87%8D%E5%86%99%E5%8E%86%E5%8F%B2"
          )
        );
        return false;
      }

      // 如果用户选择继续，我们使用一种更安全的方法
      return await this.performSafeNonConsecutiveSquash(commits, message);
    } catch (error) {
      console.error("Failed to perform non-consecutive squash:", error);
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
        vscode.window.showErrorMessage(
          "工作目录不干净，请先提交或暂存当前更改"
        );
        return false;
      }

      // 获取当前分支名
      const currentBranch = await this.git!.revparse(["--abbrev-ref", "HEAD"]);
      const branchName = currentBranch.trim();

      // 获取所有提交的哈希列表（用于重建历史）
      const selectedHashes = new Set(commits.map((c) => c.hash));

      // 获取从最早选中提交到HEAD的所有提交
      const oldestCommit = commits[0];
      const allCommitsOutput = await this.git!.raw([
        "rev-list",
        "--reverse",
        `${oldestCommit.hash}^..HEAD`,
      ]);
      const allCommitHashes = allCommitsOutput
        .trim()
        .split("\n")
        .filter((h) => h);

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

      console.log(
        "Selected commits:",
        selectedCommitHashes.map((h) => h.substring(0, 8))
      );
      console.log(
        "Unselected commits:",
        unselectedCommitHashes.map((h) => h.substring(0, 8))
      );

      // 找到最早选中提交的父提交作为基础点
      let baseCommit: string;
      try {
        baseCommit = await this.git!.raw([
          "rev-parse",
          `${oldestCommit.hash}^`,
        ]);
        baseCommit = baseCommit.trim();
      } catch (error) {
        // 如果是初始提交，使用空树
        baseCommit = await this.git!.raw([
          "hash-object",
          "-t",
          "tree",
          "/dev/null",
        ]);
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
          console.log(
            `Cherry-picking selected commit: ${commitHash.substring(0, 8)}`
          );

          // 使用 cherry-pick --no-commit 来应用单个提交的更改
          await this.git!.raw(["cherry-pick", "--no-commit", commitHash]);

          // 检查是否有更改被应用
          const statusAfterPick = await this.git!.status();
          if (statusAfterPick.files.length > 0) {
            hasChanges = true;
            successfulCommits.push(commitHash);
            console.log(
              `Successfully applied changes from: ${commitHash.substring(0, 8)}`
            );
          } else {
            console.log(
              `No new changes from commit: ${commitHash.substring(0, 8)}`
            );
          }
        } catch (cherryPickError) {
          console.warn(
            `Failed to cherry-pick commit ${commitHash}:`,
            cherryPickError
          );

          // 检查是否是因为更改已经存在
          const errorMessage = String(cherryPickError);
          if (
            errorMessage.includes("empty") ||
            errorMessage.includes("nothing to commit")
          ) {
            console.log(
              `Commit ${commitHash.substring(
                0,
                8
              )} appears to be empty or already applied`
            );
            successfulCommits.push(commitHash);
          } else {
            // 如果是其他错误，尝试重置并继续
            try {
              await this.git!.raw(["reset", "--hard", "HEAD"]);
              console.log(
                `Reset after failed cherry-pick of ${commitHash.substring(
                  0,
                  8
                )}`
              );
            } catch (resetError) {
              console.error(
                "Failed to reset after cherry-pick failure:",
                resetError
              );
            }

            vscode.window.showWarningMessage(
              `提交 ${commitHash.substring(
                0,
                8
              )} 无法应用，可能存在冲突，已跳过`
            );
          }
        }
      }

      if (!hasChanges && successfulCommits.length === 0) {
        vscode.window.showWarningMessage(
          "无法创建squash提交：没有检测到任何更改。\n" +
            "这可能是因为选中的提交更改已经被后续提交覆盖或者存在冲突。"
        );
        await this.git!.checkout(branchName);
        await this.git!.deleteLocalBranch(tempBranchName, true);
        return false;
      }

      // 如果有更改，添加到索引并创建合并提交
      if (hasChanges) {
        await this.git!.add(".");
      }

      // 创建合并提交
      let squashCommitHash: string;
      if (hasChanges || successfulCommits.length > 0) {
        try {
          await this.git!.commit(message);
          squashCommitHash = await this.git!.revparse(["HEAD"]);
          squashCommitHash = squashCommitHash.trim();
        } catch (commitError) {
          // 如果普通提交失败，尝试允许空提交
          console.warn(
            "Normal commit failed, trying with --allow-empty:",
            commitError
          );
          await this.git!.raw(["commit", "--allow-empty", "-m", message]);
          squashCommitHash = await this.git!.revparse(["HEAD"]);
          squashCommitHash = squashCommitHash.trim();
        }
      } else {
        vscode.window.showWarningMessage("没有任何提交被成功处理");
        await this.git!.checkout(branchName);
        await this.git!.deleteLocalBranch(tempBranchName, true);
        return false;
      }

      console.log(`Created squash commit: ${squashCommitHash.substring(0, 8)}`);

      // 第二步：重建历史 - 应用未选中的提交
      for (const commitHash of unselectedCommitHashes) {
        try {
          console.log(
            `Reapplying unselected commit: ${commitHash.substring(0, 8)}`
          );
          await this.git!.raw(["cherry-pick", commitHash]);
        } catch (cherryPickError) {
          console.warn(
            `Failed to reapply commit ${commitHash}:`,
            cherryPickError
          );

          // 尝试解决冲突或跳过
          const errorMessage = String(cherryPickError);
          if (
            errorMessage.includes("empty") ||
            errorMessage.includes("nothing to commit")
          ) {
            try {
              await this.git!.raw(["cherry-pick", "--skip"]);
            } catch (skipError) {
              console.warn("Failed to skip empty commit:", skipError);
            }
          } else {
            // 对于其他冲突，提示用户
            vscode.window.showWarningMessage(
              `重新应用提交 ${commitHash.substring(
                0,
                8
              )} 时发生冲突，请手动解决后继续`
            );

            // 清理状态
            try {
              await this.git!.raw(["cherry-pick", "--abort"]);
            } catch (abortError) {
              console.warn("Failed to abort cherry-pick:", abortError);
            }

            // 回到原分支并清理
            await this.git!.checkout(branchName);
            await this.git!.deleteLocalBranch(tempBranchName, true);
            return false;
          }
        }
      }

      // 第三步：将重建的历史应用到原分支
      const newHeadHash = await this.git!.revparse(["HEAD"]);
      console.log(
        `New head after rebuilding: ${newHeadHash.trim().substring(0, 8)}`
      );

      // 切换回原分支并重置到新的历史
      await this.git!.checkout(branchName);
      await this.git!.raw(["reset", "--hard", newHeadHash.trim()]);

      // 删除临时分支
      await this.git!.deleteLocalBranch(tempBranchName, true);

      vscode.window.showInformationMessage(
        `成功将 ${successfulCommits.length} 个选中的提交合并，同时保留了 ${unselectedCommitHashes.length} 个未选中的提交`
      );

      return true;
    } catch (error) {
      console.error("Failed to perform non-consecutive squash:", error);

      // 清理cherry-pick状态（如果存在）
      try {
        const status = await this.git!.status();
        if (status.current === null || String(status).includes("cherry-pick")) {
          console.log("Cleaning up cherry-pick state...");
          await this.git!.raw(["cherry-pick", "--abort"]);
        }
      } catch (cherryPickCleanupError) {
        console.warn(
          "Failed to cleanup cherry-pick state:",
          cherryPickCleanupError
        );
      }

      // 清理临时分支
      try {
        const currentBranch = await this.git!.revparse([
          "--abbrev-ref",
          "HEAD",
        ]);
        const branchName = currentBranch.trim();

        if (branchName.startsWith("temp-squash-")) {
          // 如果当前在临时分支，切换回主分支
          const branches = await this.git!.branch(["--list"]);
          const mainBranch =
            branches.all.find(
              (b) => !b.startsWith("temp-squash-") && !b.startsWith("remotes/")
            ) || "main";
          await this.git!.checkout(mainBranch);
          await this.git!.deleteLocalBranch(branchName, true);
        } else {
          // 如果不在临时分支，删除所有临时分支
          const branches = await this.git!.branch(["--list"]);
          for (const branch of branches.all) {
            if (branch.startsWith("temp-squash-")) {
              await this.git!.deleteLocalBranch(branch, true);
            }
          }
        }
      } catch (cleanupError) {
        console.error("Failed to cleanup after squash failure:", cleanupError);
      }

      vscode.window.showErrorMessage(
        `合并失败: ${error instanceof Error ? error.message : String(error)}`
      );
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
    if (!this.fileOps) {
      throw new Error("Git not initialized");
    }

    return this.fileOps.getFileDiff(hash, filePath);
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

    const result = await this.executeGitCommand(
      async () => {
        await this.git!.raw(["cherry-pick", hash]);
        return true;
      },
      "Cherry-pick failed",
      false
    );

    // 清理相关缓存，因为历史已经改变
    if (result) {
      this.invalidateCachesAfterHistoryChange();
    }

    return result;
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

    const result = await this.executeGitCommand(
      async () => {
        await this.git!.revert(hash);
        return true;
      },
      "Revert failed",
      false
    );

    // 清理相关缓存，因为历史已经改变
    if (result) {
      this.invalidateCachesAfterHistoryChange();
    }

    return result;
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

    const result = await this.executeGitCommand(
      async () => {
        await this.git!.reset([`--${mode}`, hash]);
        return true;
      },
      "Reset failed",
      false
    );

    // 清理相关缓存，因为历史已经改变
    if (result) {
      this.invalidateCachesAfterHistoryChange();
    }

    return result;
  }

  /**
   * 比较两个提交之间的文件变化
   * @param hash1 第一个提交哈希
   * @param hash2 第二个提交哈希
   * @returns 文件变化列表
   */
  async compareCommits(hash1: string, hash2: string): Promise<GitFileChange[]> {
    if (!this.fileOps) {
      throw new Error("Git not initialized");
    }
    return this.fileOps.compareCommits(hash1, hash2);
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
    if (!this.fileOps) {
      throw new Error("Git not initialized");
    }
    return this.fileOps.isInitialCommit(hash);
  }

  /**
   * 获取指定提交中的文件内容
   * @param hash 提交哈希
   * @param filePath 文件路径
   * @returns 文件内容
   */
  async getFileContent(hash: string, filePath: string): Promise<string | null> {
    if (!this.fileOps) {
      throw new Error("Git not initialized");
    }
    return this.fileOps.getFileContent(hash, filePath);
  }

  /**
   * 获取文件的提交历史
   * @param filePath 文件路径
   * @returns 文件的提交历史
   */
  async getFileHistory(filePath: string): Promise<GitCommit[]> {
    if (!this.fileOps) {
      throw new Error("Git not initialized");
    }
    return this.fileOps.getFileHistory(filePath);
  }

  /**
   * 获取远程仓库URL
   * @returns 远程仓库URL
   */
  async getRemoteUrl(): Promise<string | null> {
    if (!this.remoteOps) {
      return null;
    }
    return this.remoteOps.getRemoteUrl();
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
    if (!this.fileOps) {
      throw new Error("Git not initialized");
    }
    return this.fileOps.getFileDiffContent(hash, filePath);
  }

  /**
   * 从远程仓库拉取代码
   * @returns 是否成功
   */
  async pullFromRemote(): Promise<boolean> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }
    
    try {
      const result = await this.remoteOps.pullFromRemote();
      if (result) {
        this.invalidateCachesAfterHistoryChange();
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取所有远程分支列表
   * @returns 远程分支列表
   */
  async getAllRemoteBranches(): Promise<string[]> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }

    try {
      return await this.remoteOps.getAllRemoteBranches();
    } catch (error) {
      throw error;
    }
  }

  /**
   * 推送到指定的完整远程分支
   * @param remoteBranch 完整的远程分支名称，格式为 remote/branch
   * @param force 是否强制推送
   * @returns 是否成功
   */
  async pushToFullRemoteBranch(
    remoteBranch: string,
    force: boolean = false
  ): Promise<boolean> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }

    try {
      return await this.remoteOps.pushToFullRemoteBranch(remoteBranch, force);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 从远程仓库抓取代码
   * @param prune 是否修剪已删除的远程分支引用
   * @returns 是否成功
   */
  async fetchFromRemote(prune: boolean = false): Promise<boolean> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }

    try {
      return await this.remoteOps.fetchFromRemote(prune);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 克隆远程仓库
   * @param repoUrl 仓库URL
   * @param targetPath 目标路径
   * @returns 克隆后的路径或null
   */
  async cloneRepository(
    repoUrl: string,
    targetPath: string
  ): Promise<string | null> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }

    try {
      return await this.remoteOps.cloneRepository(repoUrl, targetPath);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 创建并切换到新分支
   * @param branchName 分支名称
   * @returns 是否成功
   */
  async createAndCheckoutBranch(branchName: string): Promise<boolean> {
    if (!this.branchOps) {
      throw new Error("Branch operations not available");
    }

    try {
      const result = await this.branchOps.createAndCheckoutBranch(branchName);
      if (result) {
        this.invalidateCachesAfterHistoryChange();
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 切换到指定分支
   * @param branchName 分支名称
   * @returns 是否成功
   */
  async checkoutBranch(branchName: string): Promise<boolean> {
    if (!this.branchOps) {
      throw new Error("Branch operations not available");
    }

    try {
      const result = await this.branchOps.checkoutBranch(branchName);
      if (result) {
        this.invalidateCachesAfterHistoryChange();
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取当前分支名称
   * @returns 当前分支名称
   */
  async getCurrentBranchName(): Promise<string | null> {
    if (!this.branchOps) {
      throw new Error("Branch operations not available");
    }

    try {
      return await this.branchOps.getCurrentBranchName();
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取当前分支的上游分支
   * @param branchName 分支名称（可选，默认当前分支）
   * @returns 上游分支名称
   */
  async getUpstreamBranch(branchName?: string): Promise<string | null> {
    if (!this.branchOps) {
      throw new Error("Branch operations not available");
    }

    try {
      return await this.branchOps.getUpstreamBranch(branchName);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 从指定提交创建新分支
   * @param hash 提交哈希值
   * @param branchName 新分支名称
   * @returns 是否成功
   */
  async createBranchFromCommit(
    hash: string,
    branchName: string
  ): Promise<boolean> {
    if (!this.branchOps) {
      throw new Error("Branch operations not available");
    }

    try {
      const result = await this.branchOps.createBranchFromCommit(hash, branchName);
      if (result) {
        this.invalidateCachesAfterHistoryChange();
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 从指定远程分支拉取代码
   * @param remote 远程仓库名称
   * @param branch 分支名称
   * @param rebase 是否使用rebase
   * @returns 是否成功
   */
  async pullFromRemoteBranch(
    remote: string,
    branch: string,
    rebase: boolean = false
  ): Promise<boolean> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }

    try {
      const result = await this.remoteOps.pullFromRemoteBranch(remote, branch, rebase);
      if (result) {
        this.invalidateCachesAfterHistoryChange();
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 推送代码到远程仓库
   * @returns 是否成功
   */
  async pushToRemote(): Promise<boolean> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }

    try {
      return await this.remoteOps.pushToRemote();
    } catch (error) {
      throw error;
    }
  }



  /**
   * 检查分支是否存在（本地或远程）
   * @param branchName 分支名称
   * @returns 是否存在
   */
  async branchExists(branchName: string): Promise<boolean> {
    if (!this.branchOps) {
      throw new Error("Branch operations not available");
    }

    try {
      return await this.branchOps.branchExists(branchName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Check branch existence failed: ${errorMessage}`);
    }
  }

  /**
   * 推送提交到远程分支
   * @param hash 提交哈希值
   * @param remoteBranch 远程分支名称，格式为 remote/branch
   */
  async pushCommitsToRemoteBranch(
    hash: string,
    remoteBranch: string
  ): Promise<boolean> {
    if (!this.remoteOps) {
      throw new Error("Remote operations not available");
    }

    try {
      return await this.remoteOps.pushCommitsToRemoteBranch(hash, remoteBranch);
    } catch (error) {
      throw error;
    }
  }

  /**
   * 修改提交的提交信息
   * @param hash 提交哈希值
   * @param newMessage 新的提交信息
   * @returns 是否成功
   */
  async amendCommitMessage(hash: string, newMessage: string): Promise<boolean> {
    const commitOps = this.commitOps;
    if (!commitOps) {
      throw new Error("Git instance not available");
    }
    const result = await commitOps.amendCommitMessage(hash, newMessage);
    return result;
  }

  /**
   * 获取当前Git用户信息
   * @returns 当前用户的姓名和邮箱
   */
  async getCurrentUser(): Promise<{ name: string; email: string } | null> {
    const commitOps = this.commitOps;
    if (!commitOps) {
      throw new Error("Git instance not available");
    }
    return commitOps.getCurrentUser();
  }

  /**
   * 检查是否有未提交的变更
   * @returns 是否有未提交的变更
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const safetyOps = this.safetyOps;
    if (!safetyOps) {
      throw new Error("Git instance not available");
    }
    return safetyOps.hasUncommittedChanges();
  }

  /**
   * 获取未提交变更的详细信息
   * @returns 未提交变更的文件列表
   */
  async getUncommittedChanges(): Promise<{
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }> {
    const safetyOps = this.safetyOps;
    if (!safetyOps) {
      throw new Error("Git instance not available");
    }
    return safetyOps.getUncommittedChanges();
  }

  /**
   * 暂存所有未提交的变更
   * @returns 是否成功
   */
  async stashUncommittedChanges(): Promise<boolean> {
    const safetyOps = this.safetyOps;
    if (!safetyOps) {
      throw new Error("Git instance not available");
    }
    return safetyOps.stashUncommittedChanges();
  }

  /**
   * 恢复最近的暂存
   * @returns 是否成功
   */
  async popStash(): Promise<boolean> {
    const safetyOps = this.safetyOps;
    if (!safetyOps) {
      throw new Error("Git instance not available");
    }
    return safetyOps.popStash();
  }

  /**
   * 安全地执行pull操作，自动处理未提交的变更
   * @param remote 远程仓库名称（可选）
   * @param branch 分支名称（可选）
   * @param rebase 是否使用rebase
   * @returns 是否成功
   */
  async safePull(
    remote?: string,
    branch?: string,
    rebase: boolean = false
  ): Promise<boolean> {
    const safetyOps = this.safetyOps;
    if (!safetyOps) {
      throw new Error("Git instance not available");
    }

    let stashed = false;
    try {
      const { shouldContinue, stashed: didStash } = await safetyOps.handleUncommittedChanges();
      stashed = didStash;
      if (!shouldContinue) {
        return false;
      }

      // 执行pull操作
      let success = false;
      if (remote && branch) {
        success = await this.pullFromRemoteBranch(remote, branch, rebase);
      } else {
        success = await this.pullFromRemote();
      }

      // 如果pull成功且之前有暂存，尝试恢复暂存
      if (success && stashed) {
        await safetyOps.safePopStash("拉取");
      }

      return success;
    } catch (error: any) {
      // 如果操作失败且有暂存，尝试恢复暂存
      if (stashed) {
        try {
          await this.popStash();
          vscode.window.showInformationMessage("已恢复之前暂存的变更");
        } catch (popError) {
          vscode.window.showWarningMessage(
            '操作失败，且恢复暂存时出现问题。请手动执行 "git stash pop" 来恢复变更。'
          );
        }
      }
      throw error;
    }
  }

  /**
   * 安全地从指定的完整远程分支拉取代码，自动处理未提交的变更
   * @param remoteBranch 完整的远程分支名称，格式为 remote/branch
   * @param rebase 是否使用rebase
   * @returns 是否成功
   */
  async safePullFromFullRemoteBranch(
    remoteBranch: string,
    rebase: boolean = false
  ): Promise<boolean> {
    const [remote, branch] = remoteBranch.split("/", 2);
    if (!remote || !branch) {
      throw new Error(`Invalid remote branch format: ${remoteBranch}`);
    }
    return this.safePull(remote, branch, rebase);
  }

  /**
   * 重置自动暂存偏好设置
   * @returns 是否成功
   */
  async resetAutoStashPreference(): Promise<boolean> {
    const safetyOps = this.safetyOps;
    if (!safetyOps) {
      throw new Error("Git instance not available");
    }
    return safetyOps.resetAutoStashPreference();
  }
}
