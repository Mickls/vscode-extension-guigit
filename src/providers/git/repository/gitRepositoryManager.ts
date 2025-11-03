import { simpleGit, SimpleGit } from "simple-git";
import * as vscode from "vscode";
import { ProxyManager } from "../../../services/proxyManager";
import { GitRepository } from "../types/gitTypes";

/**
 * 仓库管理模块：负责发现、选择仓库，应用代理配置，并提供已配置的 SimpleGit 实例
 */
export class GitRepositoryManager {
  private git: SimpleGit | null = null;
  private workspaceRoot: string | null = null;
  private workspaceRoots: string[] = [];
  private availableRepositories: GitRepository[] = [];
  private currentRepository: GitRepository | null = null;
  private proxyManager: ProxyManager;

  constructor() {
    this.proxyManager = ProxyManager.getInstance();
  }

  /**
   * 初始化：发现工作区仓库并设置默认仓库，返回配置好的 SimpleGit 实例
   */
  public async initialize(): Promise<SimpleGit | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.workspaceRoots = [];
      return null;
    }

    this.workspaceRoots = workspaceFolders.map((folder) => folder.uri.fsPath);
    this.workspaceRoot = this.workspaceRoots[0];

    // 发现所有Git仓库
    await this.discoverRepositories();

    // 设置默认仓库
    if (this.availableRepositories.length > 0) {
      const git = await this.setCurrentRepository(this.availableRepositories[0]);
      return git;
    }

    return null;
  }

  /**
   * 发现工作区中的所有Git仓库（优化版本）
   */
  public async discoverRepositories(): Promise<void> {
    if (!this.workspaceRoots || this.workspaceRoots.length === 0) {
      return;
    }

    console.time("discoverRepositories");
    this.availableRepositories = [];
    const seenPaths = new Set<string>();

    try {
      for (const root of this.workspaceRoots) {
        await this.collectRepositoriesFromPath(root, seenPaths);
      }
      this.sortRepositories();
      console.log(
        `发现 ${this.availableRepositories.length} 个Git仓库:`,
        this.availableRepositories.map((repo) => repo.path)
      );
    } catch (error) {
      console.error("发现仓库时出错:", error);
    } finally {
      console.timeEnd("discoverRepositories");
    }
  }

  /**
   * 递归搜索Git仓库（优化版本）
   */
  private async searchForGitRepositories(
    searchPath: string,
    maxDepth: number = 3,
    currentDepth: number = 0,
    seenPaths?: Set<string>
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const fs = require("fs").promises;
      const path = require("path");

      // 检查当前目录是否是Git仓库
      const gitPath = path.join(searchPath, ".git");
      try {
        const gitStat = await fs.stat(gitPath);
        if (gitStat.isDirectory() || gitStat.isFile()) {
          // 找到Git仓库
          this.addRepository(searchPath, seenPaths);
          // 找到Git仓库后，不再搜索其子目录
          return;
        }
      } catch (error) {
        // .git 不存在，继续搜索子目录
      }

      // 优化：并行搜索子目录，但限制并发数量
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      const subDirs = entries.filter(
        (entry: any) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules" &&
          entry.name !== "dist" &&
          entry.name !== "build" &&
          entry.name !== "target" &&
          entry.name !== "vendor"
      );

      // 限制并发搜索数量，避免过多的文件系统操作
      const CONCURRENT_LIMIT = 5;
      for (let i = 0; i < subDirs.length; i += CONCURRENT_LIMIT) {
        const batch = subDirs.slice(i, i + CONCURRENT_LIMIT);
        const promises = batch.map((entry: any) => {
          const subPath = path.join(searchPath, entry.name);
          return this.searchForGitRepositories(
            subPath,
            maxDepth,
            currentDepth + 1,
            seenPaths
          );
        });
        await Promise.all(promises);
      }
    } catch (error) {
      console.warn(`搜索Git仓库时出错 ${searchPath}:`, error);
    }
  }

  private async collectRepositoriesFromPath(
    rootPath: string,
    seenPaths: Set<string>
  ): Promise<void> {
    await this.searchForGitRepositories(rootPath, 3, 0, seenPaths);
    await this.searchParentGitRepositories(rootPath, seenPaths);
  }

  private addRepository(repoPath: string, seenPaths?: Set<string>, prepend: boolean = false) {
    const path = require("path");
    const normalizedPath = path.resolve(repoPath);
    if (seenPaths && seenPaths.has(normalizedPath)) {
      return;
    }

    if (seenPaths) {
      seenPaths.add(normalizedPath);
    }

    const repoName = path.basename(normalizedPath);
    const repository: GitRepository = {
      name: repoName,
      path: normalizedPath,
      isActive: false,
    };

    if (prepend) {
      this.availableRepositories.unshift(repository);
    } else {
      this.availableRepositories.push(repository);
    }
  }

  private async searchParentGitRepositories(
    startPath: string,
    seenPaths: Set<string>
  ): Promise<void> {
    const fs = require("fs").promises;
    const path = require("path");

    let currentPath = path.resolve(startPath);
    while (true) {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }

      currentPath = parentPath;
      const gitPath = path.join(currentPath, ".git");
      try {
        const gitStat = await fs.stat(gitPath);
        if (gitStat.isDirectory() || gitStat.isFile()) {
          this.addRepository(currentPath, seenPaths, true);
        }
      } catch (error) {
        // 父级目录没有Git仓库，继续向上搜索
      }
    }
  }

  private sortRepositories() {
    if (!this.workspaceRoots || this.workspaceRoots.length === 0) {
      return;
    }
    const path = require("path");

    this.availableRepositories.sort((a, b) => {
      const scoreA = this.getRepositoryScore(a.path);
      const scoreB = this.getRepositoryScore(b.path);
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      return path.resolve(a.path).localeCompare(path.resolve(b.path));
    });
  }

  private getRepositoryScore(repoPath: string): number {
    if (!this.workspaceRoots || this.workspaceRoots.length === 0) {
      return 0;
    }

    const path = require("path");
    const normalizedRepo = path.resolve(repoPath);

    const distances = this.workspaceRoots.map((root) => {
      const normalizedRoot = path.resolve(root);
      if (normalizedRepo === normalizedRoot) {
        return 0;
      }

      const relativeFromRoot = path.relative(normalizedRoot, normalizedRepo);
      if (relativeFromRoot && !relativeFromRoot.startsWith("..") && !path.isAbsolute(relativeFromRoot)) {
        return relativeFromRoot.split(path.sep).length;
      }

      const relativeFromRepo = path.relative(normalizedRepo, normalizedRoot);
      if (relativeFromRepo && !relativeFromRepo.startsWith("..") && !path.isAbsolute(relativeFromRepo)) {
        return relativeFromRepo.split(path.sep).length;
      }

      // 如果不在同一目录树中，使用一个较大的距离值
      return normalizedRepo.split(path.sep).length + normalizedRoot.split(path.sep).length;
    });

    return Math.min(...distances);
  }

  /** 获取所有可用的Git仓库 */
  public getAvailableRepositories(): GitRepository[] {
    return this.availableRepositories;
  }

  /** 获取当前活动的仓库 */
  public getCurrentRepository(): GitRepository | null {
    return this.currentRepository;
  }

  /**
   * 设置当前仓库，应用代理配置并返回新的 SimpleGit 实例
   */
  public async setCurrentRepository(repository: GitRepository): Promise<SimpleGit> {
    // 重置之前的活动状态
    this.availableRepositories.forEach((repo) => (repo.isActive = false));

    // 设置新的活动仓库
    repository.isActive = true;
    this.currentRepository = repository;

    // 获取代理配置
    const proxyConfig = await this.proxyManager.getProxyConfig();

    // 应用代理配置到环境变量
    this.proxyManager.applyProxyToEnvironment(proxyConfig);

    // 构建Git配置
    const gitConfig = ["core.quotepath=false", "log.showSignature=false"];

    // 添加代理配置
    const proxyGitConfig = this.proxyManager.getGitProxyConfig(proxyConfig);
    gitConfig.push(...proxyGitConfig);

    // 重新初始化Git实例
    this.git = simpleGit(repository.path, {
      config: gitConfig,
    });

    console.log(`切换到仓库: ${repository.name} (${repository.path})`);
    if (proxyConfig.enabled) {
      console.log("已应用代理配置:", proxyConfig);
    }

    return this.git;
  }

  /**
   * 刷新代理配置并返回最新的 SimpleGit 实例
   */
  public async refreshProxyConfig(): Promise<SimpleGit | null> {
    if (!this.currentRepository) {
      return null;
    }

    // 清除代理缓存
    this.proxyManager.clearCache();

    // 重新设置当前仓库以应用新的代理配置
    return await this.setCurrentRepository(this.currentRepository);
  }

  /** 获取当前 SimpleGit 实例 */
  public getGit(): SimpleGit | null {
    return this.git;
  }
}
