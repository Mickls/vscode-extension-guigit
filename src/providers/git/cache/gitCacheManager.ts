import { GitCommit, GitFileChange } from "../types/gitTypes";

export class GitCacheManager {
  // 缓存配置常量
  private readonly CACHE_SIZE_LIMIT = 100;
  private readonly USER_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
  private readonly COMMIT_COUNT_CACHE_TTL = 2 * 60 * 1000; // 2分钟缓存

  // 缓存存储
  private commitDetailsCache = new Map<
    string,
    { commit: GitCommit; files: GitFileChange[] }
  >();
  
  private currentUserCache: { name: string; email: string } | null = null;
  private userCacheTimestamp: number = 0;
  
  private totalCommitCountCache = new Map<
    string,
    { count: number; timestamp: number }
  >();

  /**
   * 缓存提交详情
   */
  cacheCommitDetails(
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
   * 获取缓存的提交详情
   */
  getCachedCommitDetails(
    hash: string
  ): { commit: GitCommit; files: GitFileChange[] } | null {
    return this.commitDetailsCache.get(hash) || null;
  }

  /**
   * 缓存用户信息
   */
  cacheUserInfo(userInfo: { name: string; email: string }) {
    this.currentUserCache = userInfo;
    this.userCacheTimestamp = Date.now();
  }

  /**
   * 获取缓存的用户信息
   */
  getCachedUserInfo(): { name: string; email: string } | null {
    const now = Date.now();
    if (
      this.currentUserCache &&
      now - this.userCacheTimestamp < this.USER_CACHE_TTL
    ) {
      return this.currentUserCache;
    }
    return null;
  }

  /**
   * 缓存提交总数
   */
  cacheTotalCommitCount(key: string, count: number) {
    this.totalCommitCountCache.set(key, {
      count,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取缓存的提交总数
   */
  getCachedTotalCommitCount(key: string): number | null {
    const cached = this.totalCommitCountCache.get(key);
    if (
      cached &&
      Date.now() - cached.timestamp < this.COMMIT_COUNT_CACHE_TTL
    ) {
      return cached.count;
    }
    return null;
  }

  /**
   * 清理所有缓存
   */
  clearAll() {
    this.commitDetailsCache.clear();
    this.totalCommitCountCache.clear();
    this.currentUserCache = null;
    this.userCacheTimestamp = 0;
    console.log("All caches cleared");
  }

  /**
   * 清理特定类型的缓存
   */
  clearCommitDetails() {
    this.commitDetailsCache.clear();
  }

  clearUserInfo() {
    this.currentUserCache = null;
    this.userCacheTimestamp = 0;
  }

  clearTotalCommitCount() {
    this.totalCommitCountCache.clear();
  }
}