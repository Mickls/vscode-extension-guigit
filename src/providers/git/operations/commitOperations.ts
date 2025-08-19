import { SimpleGit } from "simple-git";
import * as vscode from "vscode";
import { GitCommit } from "../types/gitTypes";
import { GitCacheManager } from "../cache/gitCacheManager";

/**
 * Git提交操作管理器
 * 负责所有与提交相关的操作
 */
export class GitCommitOperations {
  private git: SimpleGit;
  private cacheManager: GitCacheManager;

  constructor(git: SimpleGit, cacheManager: GitCacheManager) {
    this.git = git;
    this.cacheManager = cacheManager;
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
        const allCommitsResult = await this.git.raw(hashSearchArgs);
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
    const result = await this.git.raw(args);

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
  }

  async getCommitHistory(
    branch?: string,
    limit: number = 50,
    skip: number = 0,
    authorFilter?: string[]
  ): Promise<GitCommit[]> {
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

    const result = await this.git.raw(args);

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
   * 获取当前Git用户信息（带缓存优化）
   */
  private async getCurrentUserInfo(): Promise<{
    name: string;
    email: string;
  } | null> {
    // 检查缓存是否有效
    const cachedUserInfo = this.cacheManager.getCachedUserInfo();
    if (cachedUserInfo) {
      return cachedUserInfo;
    }

    try {
      const name = await this.git.raw(["config", "user.name"]);
      const email = await this.git.raw(["config", "user.email"]);
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
    try {
      const result = await this.git.raw(["rev-parse", "HEAD"]);
      return result.trim();
    } catch (error) {
      console.warn("Failed to get latest commit hash:", error);
      return null;
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

    const result = await this.git.raw(options);
    const count = parseInt(result.trim()) || 0;

    // 缓存结果
    this.cacheManager.cacheTotalCommitCount(cacheKey, count);

    console.timeEnd(`getTotalCommitCount-${cacheKey}`);
    console.log(`Total commit count for ${cacheKey}: ${count}`);
    return count;
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
   * 检查是否可以编辑提交消息
   */
  async canEditCommitMessage(hash: string): Promise<boolean> {
    // 首先检查缓存
    const cachedResult = this.getCachedCanEditMessage(hash);
    if (cachedResult !== null) {
      return cachedResult;
    }

    // 获取提交信息
    const log = await this.git.log({ from: hash, to: hash });
    if (log.all.length === 0) {
      return false;
    }

    const commit = log.all[0];
    const [currentUser, latestCommitHash] = await Promise.all([
      this.getCurrentUserInfo(),
      this.getLatestCommitHash(),
    ]);

    if (!currentUser || !latestCommitHash) {
      return false;
    }

    // 检查是否是当前用户的提交
    const isOwnCommit =
      commit.author_name === currentUser.name ||
      commit.author_email === currentUser.email;

    // 检查是否是最新提交（支持短哈希匹配）
    const isLatestCommit =
      hash === latestCommitHash ||
      latestCommitHash.startsWith(hash) ||
      hash.startsWith(latestCommitHash);

    if (!isLatestCommit) {
      console.log(
        `Commit ${hash.substring(
          0,
          8
        )} is not the latest commit. Latest: ${latestCommitHash?.substring(
          0,
          8
        )}`
      );
    }

    const canEdit = isOwnCommit && isLatestCommit;

    // 缓存结果（有效期为缓存管理器设定的时间）
    this.cacheManager.cacheCanEditMessage(hash, canEdit);

    return canEdit;
  }

  /**
   * 从缓存获取是否可以编辑提交消息
   */
  private getCachedCanEditMessage(hash: string): boolean | null {
    return this.cacheManager.getCachedCanEditMessage(hash);
  }

  /**
   * 同步版本的检查是否可以编辑提交消息（仅使用缓存）
   */
  canEditCommitMessageSync(hash: string): boolean {
    const cached = this.getCachedCanEditMessage(hash);
    return cached ?? false;
  }

  /**
   * 修改提交消息
   */
  async amendCommitMessage(hash: string, newMessage: string): Promise<boolean> {
    try {
      // 检查是否是最新提交
      const latestHash = await this.getLatestCommitHash();
      if (
        !latestHash ||
        (hash !== latestHash &&
          !latestHash.startsWith(hash) &&
          !hash.startsWith(latestHash))
      ) {
        vscode.window.showErrorMessage("只能修改最新提交的消息");
        return false;
      }

      // 使用 git commit --amend -m 修改提交消息
      await this.git.raw(["commit", "--amend", "-m", newMessage]);

      // 清除相关缓存
      this.cacheManager.clearAll();

      vscode.window.showInformationMessage("提交消息已成功修改");
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      console.error("Failed to amend commit message:", error);
      vscode.window.showErrorMessage(`修改提交消息失败: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 获取当前用户信息（公共方法）
   */
  async getCurrentUser(): Promise<{ name: string; email: string } | null> {
    return this.getCurrentUserInfo();
  }
}