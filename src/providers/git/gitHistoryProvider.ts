import { simpleGit, SimpleGit } from "simple-git";
import * as vscode from "vscode";
import { GitCommit, GitBranch, GitRepository, GitFileChange } from "./types/gitTypes";
import { isNetworkError } from "./utils/gitUtils";
import { GitCacheManager } from "./cache/gitCacheManager";
import { GitRepositoryManager } from "./repository/gitRepositoryManager";


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
    return this.executeGitCommand(
      async () => {
        const branchSummary = await this.git!.branch();
        const branches = branchSummary.all.map((branch) => ({
          name: branch,
          current: branch === branchSummary.current,
          commit: "",
        }));

        // 对分支进行排序，让 main 或 master 排在最上方
        return branches.sort((a, b) => {
          // 检查是否是 main 或 master
          const isAMainOrMaster = a.name === "main" || a.name === "master";
          const isBMainOrMaster = b.name === "main" || b.name === "master";

          // 如果 a 是 main/master 而 b 不是，a 排在前面
          if (isAMainOrMaster && !isBMainOrMaster) {
            return -1;
          }

          // 如果 b 是 main/master 而 a 不是，b 排在前面
          if (isBMainOrMaster && !isAMainOrMaster) {
            return 1;
          }

          // 如果都是 main/master，优先显示 main
          if (isAMainOrMaster && isBMainOrMaster) {
            if (a.name === "main") return -1;
            if (b.name === "main") return 1;
            return 0;
          }

          // 其他情况按字母顺序排序
          return a.name.localeCompare(b.name);
        });
      },
      "Error getting branches",
      []
    );
  }

  /**
   * 获取提交历史（带图形信息，优化版本）
   */
  async searchCommits(
    searchTerm: string,
    branch?: string,
    limit: number = 50,
    authorFilter?: string[]
  ): Promise<GitCommit[]> {
    return this.executeGitCommand(
      async () => {
        console.time(`searchCommits-${searchTerm}`);

        // 构建搜索参数
        const args = [
          "log",
          `--pretty=format:%H|%ai|%s|%an|%ae|%D|%P`,
          "--encoding=UTF-8",
          `--max-count=${limit}`,
        ];

        // 如果指定了分支，只在该分支中搜索
        if (branch && branch !== "all") {
          args.push(branch);
        } else {
          args.push("--all"); // 在所有分支中搜索
        }

        // 添加作者筛选
        if (authorFilter && authorFilter.length > 0) {
          authorFilter.forEach((author) => {
            args.push(`--author=${author}`);
          });
        }

        // 检查搜索词是否可能是哈希值（至少4个字符的十六进制）
        const isPossibleHash = /^[a-f0-9]{4,40}$/i.test(searchTerm);

        if (isPossibleHash) {
          // 对于可能的哈希值，同时搜索哈希和提交消息
          // 使用 --grep 搜索提交消息中包含该字符串的提交
          args.push(`--grep=${searchTerm}`);
          args.push("-i"); // 忽略大小写

          // 同时尝试哈希前缀匹配
          // 先执行一次搜索获取所有可能的提交
          const hashSearchArgs = [
            "log",
            `--pretty=format:%H|%ai|%s|%an|%ae|%D|%P`,
            "--encoding=UTF-8",
            `--max-count=${limit * 2}`, // 获取更多提交用于哈希匹配
          ];

          if (branch && branch !== "all") {
            hashSearchArgs.push(branch);
          } else {
            hashSearchArgs.push("--all");
          }

          // 添加作者筛选到哈希搜索
          if (authorFilter && authorFilter.length > 0) {
            authorFilter.forEach((author) => {
              hashSearchArgs.push(`--author=${author}`);
            });
          }

          try {
            // 获取所有提交并筛选哈希匹配的
            const allCommitsResult = await this.git!.raw(hashSearchArgs);
            const allLines = allCommitsResult
              .trim()
              .split("\n")
              .filter((line) => line.trim());

            const hashMatchedCommits: GitCommit[] = [];
            let hashMatchCount = 0;

            for (const line of allLines) {
              if (hashMatchCount >= limit) break;

              if (!line.includes("|")) continue;

              const parts = line.split("|");
              const hash = parts[0]?.trim() || "";

              if (!hash || hash.length < 7) continue;

              // 检查哈希是否以搜索词开头
              if (hash.toLowerCase().startsWith(searchTerm.toLowerCase())) {
                const parents = parts[6]
                  ? parts[6]
                      .trim()
                      .split(" ")
                      .filter((p) => p)
                  : [];

                const commit: GitCommit = {
                  hash,
                  date: parts[1]?.trim() || "",
                  message: parts[2]?.trim() || "",
                  author: parts[3]?.trim() || "",
                  email: parts[4]?.trim() || "",
                  refs: parts[5]?.trim() || "",
                  body: "",
                  parents,
                  children: [],
                };

                hashMatchedCommits.push(commit);
                hashMatchCount++;
              }
            }

            // 如果找到哈希匹配的提交，优先返回这些
            if (hashMatchedCommits.length > 0) {
              this.buildParentChildRelationships(hashMatchedCommits);
              console.timeEnd(`searchCommits-${searchTerm}`);
              console.log(
                `Found ${hashMatchedCommits.length} commits by hash prefix`
              );
              return hashMatchedCommits;
            }
          } catch (error) {
            console.log(
              "Hash prefix search failed, falling back to grep search"
            );
          }
        } else {
          // 如果不是哈希值，在提交消息中搜索
          args.push(`--grep=${searchTerm}`);
          args.push("-i"); // 忽略大小写
        }

        // 执行常规搜索（提交消息搜索）
        const result = await this.git!.raw(args);

        // 解析带图形信息的输出
        const lines = result
          .trim()
          .split("\n")
          .filter((line) => line.trim());
        const commits: GitCommit[] = [];

        console.log(
          `Found ${lines.length} lines to process for search: ${searchTerm}`
        );

        for (const line of lines) {
          // 检查是否包含提交信息
          if (!line.includes("|")) continue;

          const parts = line.split("|");

          // 验证是否为有效的提交记录
          const hash = parts[0]?.trim() || "";
          if (!hash || hash.length < 7) continue;

          // 解析父提交
          const parents = parts[6]
            ? parts[6]
                .trim()
                .split(" ")
                .filter((p) => p)
            : [];

          const commit: GitCommit = {
            hash,
            date: parts[1]?.trim() || "",
            message: parts[2]?.trim() || "",
            author: parts[3]?.trim() || "",
            email: parts[4]?.trim() || "",
            refs: parts[5]?.trim() || "",
            body: "",
            parents,
            children: [],
          };

          commits.push(commit);
        }

        // 后处理：建立父子关系
        this.buildParentChildRelationships(commits);

        console.timeEnd(`searchCommits-${searchTerm}`);
        console.log(
          `Successfully found ${commits.length} commits matching: ${searchTerm}`
        );
        return commits;
      },
      "Error searching commits",
      []
    );
  }

  async getCommitHistory(
    branch?: string,
    limit: number = 50,
    skip: number = 0,
    authorFilter?: string[]
  ): Promise<GitCommit[]> {
    return this.executeGitCommand(
      async () => {
        console.time(`getCommitHistory-${skip}-${limit}`);

        // 使用更简化的格式，减少解析复杂度
        const args = [
          "log",
          "--all", // 显示所有分支
          `--pretty=format:%H|%ai|%s|%an|%ae|%D|%P`,
          "--encoding=UTF-8",
          `--max-count=${limit}`,
        ];

        if (skip > 0) {
          args.push(`--skip=${skip}`);
        }

        if (branch && branch !== "all") {
          // 如果指定了特定分支，只显示该分支
          args.splice(args.indexOf("--all"), 1);
          args.push(branch);
        }

        // 添加作者筛选
        if (authorFilter && authorFilter.length > 0) {
          authorFilter.forEach((author) => {
            args.push(`--author=${author}`);
          });
        }

        const result = await this.git!.raw(args);

        // 解析带图形信息的输出
        const lines = result
          .trim()
          .split("\n")
          .filter((line) => line.trim());
        const commits: GitCommit[] = [];

        console.log(`Found ${lines.length} lines to process`);

        for (const line of lines) {
          // 检查是否包含提交信息
          if (!line.includes("|")) continue;

          const parts = line.split("|");

          // 验证是否为有效的提交记录
          const hash = parts[0]?.trim() || "";
          if (!hash || hash.length < 7) continue;

          // 解析父提交
          const parents = parts[6]
            ? parts[6]
                .trim()
                .split(" ")
                .filter((p) => p)
            : [];

          const commit: GitCommit = {
            hash,
            date: parts[1]?.trim() || "",
            message: parts[2]?.trim() || "",
            author: parts[3]?.trim() || "",
            email: parts[4]?.trim() || "",
            refs: parts[5]?.trim() || "",
            body: "", // 简化：不在列表视图中加载body
            parents,
            children: [], // 将在后处理中填充
          };

          commits.push(commit);
        }

        // 后处理：建立父子关系
        this.buildParentChildRelationships(commits);

        // 优化：只在首次加载时计算canEditMessage，减少性能开销
        if (skip === 0) {
          await this.calculateCanEditMessage(commits);
        } else {
          // 对于后续加载的提交，默认设置为false，需要时再计算
          commits.forEach((commit) => {
            commit.canEditMessage = false;
          });
        }

        console.timeEnd(`getCommitHistory-${skip}-${limit}`);
        console.log(`Successfully processed ${commits.length} commits`);
        return commits;
      },
      "Error getting commit history",
      []
    );
  }

  /**
   * 建立父子关系
   */
  private buildParentChildRelationships(commits: GitCommit[]): void {
    const commitMap = new Map<string, GitCommit>();

    // 创建哈希到提交的映射
    commits.forEach((commit) => {
      commitMap.set(commit.hash, commit);
    });

    // 建立父子关系
    commits.forEach((commit) => {
      commit.parents.forEach((parentHash) => {
        const parent = commitMap.get(parentHash);
        if (parent) {
          parent.children.push(commit.hash);
        }
      });
    });
  }

  /**
   * 预先计算每个提交是否可以编辑消息
   * 判断条件：提交属于当前用户且是最新的提交
   */
  private async calculateCanEditMessage(commits: GitCommit[]): Promise<void> {
    try {
      // 获取当前用户信息和最新提交哈希
      const [currentUser, latestCommitHash] = await Promise.all([
        this.getCurrentUserInfo(),
        this.getLatestCommitHash(),
      ]);

      if (!currentUser || !latestCommitHash) {
        // 如果无法获取用户信息或最新提交，则所有提交都不可编辑
        commits.forEach((commit) => {
          commit.canEditMessage = false;
        });
        return;
      }

      // 为每个提交计算canEditMessage
      commits.forEach((commit) => {
        // 检查是否是当前用户的提交
        const isOwnCommit =
          commit.author === currentUser.name ||
          commit.email === currentUser.email;

        // 检查是否是最新提交（支持短哈希匹配）
        const isLatestCommit =
          commit.hash === latestCommitHash ||
          latestCommitHash.startsWith(commit.hash) ||
          commit.hash.startsWith(latestCommitHash);

        // 只有当提交属于当前用户且是最新提交时才可以编辑
        commit.canEditMessage = isOwnCommit && isLatestCommit;
      });

      console.log(
        `Calculated canEditMessage for ${
          commits.length
        } commits. Latest commit: ${latestCommitHash?.substring(0, 8)}`
      );
    } catch (error) {
      console.warn("Failed to calculate canEditMessage:", error);
      // 出错时默认所有提交都不可编辑
      commits.forEach((commit) => {
        commit.canEditMessage = false;
      });
    }
  }

  /**
   * 为单个提交计算canEditMessage值
   * @param commitInfo 提交信息
   * @returns 是否可以编辑
   */
  private async calculateSingleCommitCanEdit(commitInfo: {
    hash: string;
    author: string;
    email: string;
  }): Promise<boolean> {
    try {
      // 获取当前用户信息和最新提交哈希
      const [currentUser, latestCommitHash] = await Promise.all([
        this.getCurrentUserInfo(),
        this.getLatestCommitHash(),
      ]);

      if (!currentUser || !latestCommitHash) {
        return false;
      }

      // 检查是否是当前用户的提交
      const isOwnCommit =
        commitInfo.author === currentUser.name ||
        commitInfo.email === currentUser.email;

      // 检查是否是最新提交（支持短哈希匹配）
      const isLatestCommit =
        commitInfo.hash === latestCommitHash ||
        latestCommitHash.startsWith(commitInfo.hash) ||
        commitInfo.hash.startsWith(latestCommitHash);

      // 只有当提交属于当前用户且是最新提交时才可以编辑
      return isOwnCommit && isLatestCommit;
    } catch (error) {
      console.warn("Failed to calculate single commit canEditMessage:", error);
      return false;
    }
  }

  /**
   * 获取提交总数（带缓存优化）
   */
  async getTotalCommitCount(
    branch?: string,
    authorFilter?: string[]
  ): Promise<number> {
    const cacheKey = `${branch || "all"}-${
      authorFilter ? authorFilter.join(",") : "no-filter"
    }`;

    // 检查缓存
    const cached = this.cacheManager.getCachedTotalCommitCount(cacheKey);
    if (cached !== null) {
      console.log(`Cache hit for commit count (${cacheKey}): ${cached}`);
      return cached;
    }

    return this.executeGitCommand(
      async () => {
        console.time(`getTotalCommitCount-${cacheKey}`);
        const options: string[] = ["rev-list", "--count"];
        if (branch && branch !== "all") {
          options.push(branch);
        } else {
          options.push("--all");
        }

        // 添加作者筛选
        if (authorFilter && authorFilter.length > 0) {
          authorFilter.forEach((author) => {
            options.push(`--author=${author}`);
          });
        }

        const result = await this.git!.raw(options);
        const count = parseInt(result.trim()) || 0;

        // 缓存结果
        this.cacheManager.cacheTotalCommitCount(cacheKey, count);

        console.timeEnd(`getTotalCommitCount-${cacheKey}`);
        console.log(`Total commit count for ${cacheKey}: ${count}`);
        return count;
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

        // 计算canEditMessage
        const canEditMessage = await this.calculateSingleCommitCanEdit({
          hash: commit.hash,
          author: commit.author_name || "",
          email: commit.author_email || "",
        });

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
    this.cacheManager.cacheCommitDetails(hash, details);
  }

  /**
   * 清理缓存（用于刷新时）
   */
  public clearCache() {
    this.cacheManager.clearAll();
    console.log("All caches cleared");
  }

  /**
   * 在成功执行可能影响提交历史的 Git 操作后清理相关缓存
   * 这确保了 UI 显示的数据与仓库状态保持一致
   */
  private invalidateCachesAfterHistoryChange() {
    this.cacheManager.clearCommitDetails();
    this.cacheManager.clearCanEditMessage();
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
      await this.executeGitCommand(
        async () => {
          await this.git!.pull();
          return true;
        },
        "Pull from remote failed",
        false
      );
      this.invalidateCachesAfterHistoryChange();
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
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
  async pullFromRemoteBranch(
    remote: string,
    branch: string,
    rebase: boolean = false
  ): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      if (rebase) {
        await this.git.pull(remote, branch, { "--rebase": "true" });
      } else {
        await this.git.pull(remote, branch);
      }
      this.invalidateCachesAfterHistoryChange();
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      const operation = rebase ? "Pull with rebase" : "Pull";
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
      await this.executeGitCommand(
        async () => {
          await this.git!.push();
          return true;
        },
        "Push to remote failed",
        false
      );
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
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
  async pushToRemoteBranch(
    remote: string,
    branch: string,
    force: boolean = false
  ): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const options: any = {};
      if (force) {
        options["--force"] = null;
      }
      await this.git.push(remote, branch, options);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      const operation = force ? "Force push" : "Push";
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
      return remotes.map((remote) => remote.name);
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
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
      const branches = await this.git.branch(["-r"]);
      const filteredBranches = branches.all
        .filter((branch) => branch.startsWith(`${remote}/`))
        .map((branch) => branch.replace(`${remote}/`, ""))
        .filter((branch) => branch !== "HEAD");

      // 对分支进行排序，让 main 或 master 排在最上方
      return filteredBranches.sort((a, b) => {
        // 检查是否是 main 或 master
        const isAMainOrMaster = a === "main" || a === "master";
        const isBMainOrMaster = b === "main" || b === "master";

        // 如果 a 是 main/master 而 b 不是，a 排在前面
        if (isAMainOrMaster && !isBMainOrMaster) {
          return -1;
        }

        // 如果 b 是 main/master 而 a 不是，b 排在前面
        if (isBMainOrMaster && !isAMainOrMaster) {
          return 1;
        }

        // 如果都是 main/master，优先显示 main
        if (isAMainOrMaster && isBMainOrMaster) {
          if (a === "main") return -1;
          if (b === "main") return 1;
          return 0;
        }

        // 其他情况按字母顺序排序
        return a.localeCompare(b);
      });
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
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
      const branches = await this.git.branch(["-r"]);
      const filteredBranches = branches.all
        .filter((branch) => !branch.includes("HEAD"))
        .map((branch) => branch.trim());

      // 对分支进行排序，让 origin/main 或 origin/master 排在最上方
      return filteredBranches.sort((a, b) => {
        // 检查是否是 origin/main 或 origin/master
        const isAMainOrMaster = a === "origin/main" || a === "origin/master";
        const isBMainOrMaster = b === "origin/main" || b === "origin/master";

        // 如果 a 是 main/master 而 b 不是，a 排在前面
        if (isAMainOrMaster && !isBMainOrMaster) {
          return -1;
        }

        // 如果 b 是 main/master 而 a 不是，b 排在前面
        if (isBMainOrMaster && !isAMainOrMaster) {
          return 1;
        }

        // 如果都是 main/master，优先显示 main
        if (isAMainOrMaster && isBMainOrMaster) {
          if (a === "origin/main") return -1;
          if (b === "origin/main") return 1;
          return 0;
        }

        // 其他情况按字母顺序排序
        return a.localeCompare(b);
      });
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Get all remote branches failed: ${errorMessage}`);
    }
  }

  /**
   * 从指定的完整远程分支拉取代码
   * @param remoteBranch 完整的远程分支名称，格式为 remote/branch
   * @param rebase 是否使用rebase
   * @returns 是否成功
   */
  async pullFromFullRemoteBranch(
    remoteBranch: string,
    rebase: boolean = false
  ): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const [remote, branch] = remoteBranch.split("/", 2);
      if (!remote || !branch) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }

      if (rebase) {
        await this.git.pull(remote, branch, { "--rebase": "true" });
      } else {
        await this.git.pull(remote, branch);
      }
      this.invalidateCachesAfterHistoryChange();
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      const operation = rebase ? "Pull with rebase" : "Pull";
      throw new Error(`${operation} failed: ${errorMessage}`);
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
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const [remote, branch] = remoteBranch.split("/", 2);
      if (!remote || !branch) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }

      // 获取当前分支名称
      const currentBranch = await this.git.revparse(["--abbrev-ref", "HEAD"]);
      const currentBranchName = currentBranch.trim();

      const options: any = {};
      if (force) {
        options["--force"] = null;
      }

      // 使用 currentBranch:remoteBranch 格式推送
      // 这样可以将当前分支的内容推送到指定的远程分支
      await this.git.push(remote, `${currentBranchName}:${branch}`, options);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      const operation = force ? "Force push" : "Push";
      throw new Error(`${operation} failed: ${errorMessage}`);
    }
  }

  /**
   * 从远程仓库抓取代码
   * @param prune 是否修剪已删除的远程分支引用
   * @returns 是否成功
   */
  async fetchFromRemote(prune: boolean = false): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      await this.executeGitCommand(
        async () => {
          if (prune) {
            // 使用 --all --prune 参数，确保清理已删除的远程分支引用
            await this.git!.fetch(["--all", "--prune"]);
          } else {
            await this.git!.fetch();
          }
          return true;
        },
        "Fetch from remote failed",
        false
      );
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Fetch failed: ${errorMessage}`);
    }
  }

  /**
   * 自动在合适时机执行带 --prune 的 fetch，避免频繁触发
   * @param force 是否强制执行（忽略间隔限制）
   */
  async autoFetchPruneIfNeeded(force: boolean = false): Promise<void> {
    if (!this.git) return;

    const now = Date.now();
    if (!force) {
      if (this.autoFetchInProgress) {
        return;
      }
      if (now - this.lastAutoPruneFetchTime < this.AUTO_PRUNE_FETCH_INTERVAL) {
        return;
      }
    }

    this.autoFetchInProgress = true;
    try {
      await this.fetchFromRemote(true);
      this.lastAutoPruneFetchTime = Date.now();
    } catch (err) {
      console.warn("autoFetchPruneIfNeeded failed:", err);
    } finally {
      this.autoFetchInProgress = false;
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
    try {
      const path = require("path");
      const repoName =
        repoUrl.split("/").pop()?.replace(".git", "") || "repository";
      const clonePath = path.join(targetPath, repoName);

      await simpleGit().clone(repoUrl, clonePath);
      return clonePath;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
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
      this.invalidateCachesAfterHistoryChange();
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
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
      this.invalidateCachesAfterHistoryChange();
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Create and checkout branch failed: ${errorMessage}`);
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
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      await this.git.checkoutBranch(branchName, hash);
      this.invalidateCachesAfterHistoryChange();
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Create branch from commit failed: ${errorMessage}`);
    }
  }

  /**
   * 推送指定提交及其之前的所有提交到远程分支
   * @param hash 目标提交哈希值
   * @param remoteBranch 远程分支名称，格式为 remote/branch
   * @returns 是否成功
   */
  async pushCommitsToRemoteBranch(
    hash: string,
    remoteBranch: string
  ): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const [remote, branch] = remoteBranch.split("/", 2);
      if (!remote || !branch) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }

      // 推送指定提交到远程分支
      // 使用 git push remote hash:refs/heads/branch 格式
      await this.git.push(remote, `${hash}:refs/heads/${branch}`);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Push commits to remote branch failed: ${errorMessage}`);
    }
  }

  /**
   * 检查提交是否可以编辑消息（高效版本，优先使用缓存的结果）
   * @param hash 提交哈希值
   * @returns 是否可以编辑
   */
  async canEditCommitMessage(hash: string): Promise<boolean> {
    try {
      // 优先从缓存中查找已计算的结果
      const cachedResult = this.getCachedCanEditMessage(hash);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // 如果缓存中没有，则进行实时计算
      const [currentUser, latestCommitHash] = await Promise.all([
        this.getCurrentUserInfo(),
        this.getLatestCommitHash(),
      ]);

      if (!currentUser || !latestCommitHash) {
        return false;
      }

      // 检查是否是最新提交
      const isLatestCommit =
        hash === latestCommitHash ||
        latestCommitHash.startsWith(hash) ||
        hash.startsWith(latestCommitHash);

      if (!isLatestCommit) {
        return false;
      }

      // 获取提交的作者信息
      const commitInfo = await this.git!.show([
        "--format=%an|%ae",
        "--no-patch",
        hash,
      ]);

      const [author, email] = commitInfo.trim().split("|");

      // 检查是否是当前用户的提交
      const isOwnCommit =
        author === currentUser.name || email === currentUser.email;

      // 写入缓存
      this.cacheManager.cacheCanEditMessage(hash, isOwnCommit);

      return isOwnCommit;
    } catch (error: any) {
      console.warn(
        `Check commit editability failed: ${error?.message || error}`
      );
      return false;
    }
  }

  /**
   * 从已加载的提交缓存中获取canEditMessage值
   * @param hash 提交哈希值
   * @returns 缓存的canEditMessage值，如果未找到则返回null
   */
  private getCachedCanEditMessage(hash: string): boolean | null {
    return this.cacheManager.getCachedCanEditMessage(hash);
  }

  /**
   * 快速检查提交是否可以编辑消息（仅使用预计算的结果）
   * 这个方法专门用于UI交互，如右键菜单，需要立即响应
   * @param hash 提交哈希值
   * @returns 是否可以编辑，如果未预计算则返回false
   */
  canEditCommitMessageSync(hash: string): boolean {
    const cachedResult = this.getCachedCanEditMessage(hash);
    return cachedResult ?? false;
  }

  /**
   * 修改提交的提交信息
   * @param hash 提交哈希值
   * @param newMessage 新的提交信息
   * @returns 是否成功
   */
  async amendCommitMessage(hash: string, newMessage: string): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      // 检查是否为最新提交
      const latestCommit = await this.git.log({ maxCount: 1 });
      if (
        latestCommit.latest &&
        (latestCommit.latest.hash === hash ||
          latestCommit.latest.hash.startsWith(hash) ||
          hash.startsWith(latestCommit.latest.hash))
      ) {
        // 如果是最新提交，使用 --amend 参数
        await this.git.commit(newMessage, { "--amend": null });
      } else {
        // 如果不是最新提交，使用 filter-branch 重写历史
        const escapedMessage = newMessage.replace(/'/g, "\\'");
        await this.git.raw([
          "filter-branch",
          "-f",
          "--msg-filter",
          `if [ "$GIT_COMMIT" = "${hash}" ]; then echo '${escapedMessage}'; else cat; fi`,
          "HEAD",
        ]);
      }

      // 清理相关缓存，因为提交信息已经改变
      this.invalidateCachesAfterHistoryChange();

      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Amend commit message failed: ${errorMessage}`);
    }
  }

  /**
   * 获取当前Git用户信息
   * @returns 当前用户的姓名和邮箱
   */
  async getCurrentUser(): Promise<{ name: string; email: string } | null> {
    return this.executeGitCommand(
      async () => {
        const userInfo = await this.getCurrentUserInfo();
        return userInfo;
      },
      "Error getting current user",
      null
    );
  }

  /**
   * 检查是否有未提交的变更
   * @returns 是否有未提交的变更
   */
  async hasUncommittedChanges(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const status = await this.git.status();
      return status.files.length > 0;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Check uncommitted changes failed: ${errorMessage}`);
    }
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
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      const status = await this.git.status();
      return {
        staged: status.staged,
        unstaged: status.modified.concat(status.deleted),
        untracked: status.not_added,
      };
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Get uncommitted changes failed: ${errorMessage}`);
    }
  }

  /**
   * 暂存所有未提交的变更
   * @returns 是否成功
   */
  async stashUncommittedChanges(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      // 检查是否有变更需要暂存
      const hasChanges = await this.hasUncommittedChanges();
      if (!hasChanges) {
        return true; // 没有变更，直接返回成功
      }

      // 暂存所有变更，包括未跟踪的文件
      await this.git.stash([
        "push",
        "--include-untracked",
        "--message",
        "Auto-stash before pull/rebase",
      ]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Stash uncommitted changes failed: ${errorMessage}`);
    }
  }

  /**
   * 恢复最近的暂存
   * @returns 是否成功
   */
  async popStash(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    try {
      // 检查是否有暂存可以恢复
      const stashList = await this.git.stashList();
      if (stashList.total === 0) {
        return true; // 没有暂存，直接返回成功
      }

      await this.git.stash(["pop"]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Pop stash failed: ${errorMessage}`);
    }
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
    if (!this.git) {
      throw new Error("Git instance not available");
    }

    let stashed = false;
    try {
      // 检查是否有未提交的变更
      const hasChanges = await this.hasUncommittedChanges();

      if (hasChanges) {
        // 检查用户是否设置了默认行为
        const config = vscode.workspace.getConfiguration("guigit");
        const autoStashPreference = config.get<string>("autoStashOnPull");

        let shouldStash = false;

        if (autoStashPreference === "always") {
          // 用户设置了总是自动暂存
          shouldStash = true;
        } else if (autoStashPreference === "never") {
          // 用户设置了从不自动暂存，直接取消操作
          vscode.window.showWarningMessage(
            "检测到未提交的变更，操作已取消。请先提交或手动暂存变更。"
          );
          return false;
        } else {
          // 第一步：询问用户如何处理未提交的变更
          const choice = await vscode.window.showWarningMessage(
            "检测到未提交的变更。请选择如何处理：",
            { modal: true },
            "自动暂存并继续",
            "取消操作"
          );

          if (choice === "取消操作" || choice === undefined) {
            // 询问是否记住选择
            const rememberChoice = await vscode.window.showInformationMessage(
              "是否记住此选择？下次遇到未提交变更时将自动取消操作。",
              "记住选择",
              "仅此次"
            );

            if (rememberChoice === "记住选择") {
              await config.update(
                "autoStashOnPull",
                "never",
                vscode.ConfigurationTarget.Global
              );
              vscode.window.showInformationMessage(
                "已设置为遇到未提交变更时总是取消操作。可通过重置偏好按钮修改此行为。"
              );
            }
            return false;
          }

          if (choice === "自动暂存并继续") {
            shouldStash = true;
            // 询问是否记住选择
            const rememberChoice = await vscode.window.showInformationMessage(
              "是否记住此选择？下次遇到未提交变更时将自动暂存并继续。",
              "记住选择",
              "仅此次"
            );

            if (rememberChoice === "记住选择") {
              await config.update(
                "autoStashOnPull",
                "always",
                vscode.ConfigurationTarget.Global
              );
              vscode.window.showInformationMessage(
                "已设置为总是自动暂存未提交的变更。可通过重置偏好按钮修改此行为。"
              );
            }
          }
        }

        if (shouldStash) {
          await this.stashUncommittedChanges();
          stashed = true;
          vscode.window.showInformationMessage("已自动暂存未提交的变更");
        }
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
        try {
          await this.popStash();
          vscode.window.showInformationMessage("已恢复之前暂存的变更");
        } catch (error) {
          vscode.window.showWarningMessage(
            '拉取成功，但恢复暂存时出现问题。请手动执行 "git stash pop" 来恢复变更。'
          );
        }
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
    try {
      const config = vscode.workspace.getConfiguration("guigit");
      await config.update(
        "autoStashOnPull",
        "ask",
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(
        "已重置自动暂存偏好设置，下次遇到未提交变更时将重新询问。"
      );
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      vscode.window.showErrorMessage(`重置偏好设置失败: ${errorMessage}`);
      return false;
    }
  }
}
