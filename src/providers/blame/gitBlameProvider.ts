import { simpleGit, SimpleGit } from "simple-git";
import * as vscode from "vscode";
import * as path from "path";

export interface GitBlameInfo {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  line: number;
  originalLine: number;
  filename: string;
}

export interface GitBlameLineInfo {
  isCommitted: boolean;
  hash?: string;
  author?: string;
  email?: string;
  date?: Date;
  message?: string;
  summary?: string;
  relativeTime?: string;
}

/**
 * Git Blame 提供者，类似 GitLens 的功能
 */
export class GitBlameProvider {
  private git: SimpleGit | null = null;
  private workspaceRoot: string | null = null;
  private blameCache = new Map<string, GitBlameInfo[]>();
  private readonly CACHE_SIZE_LIMIT = 50;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
  private cacheTimestamps = new Map<string, number>();

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
        config: ["core.quotepath=false"],
      });
    }
  }

  /**
   * 获取文件的 blame 信息
   */
  async getBlameForFile(filePath: string): Promise<GitBlameInfo[]> {
    if (!this.git || !this.workspaceRoot) {
      return [];
    }

    // 检查缓存
    const cacheKey = filePath;
    const cached = this.blameCache.get(cacheKey);
    const cacheTime = this.cacheTimestamps.get(cacheKey);
    
    if (cached && cacheTime && (Date.now() - cacheTime) < this.CACHE_TTL) {
      return cached;
    }

    try {
      // 获取相对路径
      const relativePath = path.relative(this.workspaceRoot, filePath);
      
      // 检查文件是否在Git仓库中
      const isTracked = await this.isFileTracked(relativePath);
      if (!isTracked) {
        return [];
      }

      // 执行 git blame 命令
      const blameResult = await this.git.raw([
        'blame',
        '--line-porcelain',
        '--',
        relativePath
      ]);

      const blameInfo = this.parseBlameOutput(blameResult, relativePath);
      
      // 缓存结果
      this.cacheBlameInfo(cacheKey, blameInfo);
      
      return blameInfo;
    } catch (error) {
      console.error('Error getting blame info:', error);
      return [];
    }
  }

  /**
   * 获取特定行的 blame 信息
   */
  async getBlameForLine(filePath: string, lineNumber: number): Promise<GitBlameLineInfo | null> {
    const blameInfo = await this.getBlameForFile(filePath);
    
    if (blameInfo.length === 0) {
      return { isCommitted: false };
    }

    // 找到对应行的信息（lineNumber 是 0-based，blame 是 1-based）
    const lineInfo = blameInfo.find(info => info.line === lineNumber + 1);
    
    if (!lineInfo) {
      return { isCommitted: false };
    }

    // 检查是否是未提交的更改
    if (lineInfo.hash.startsWith('0000000')) {
      return { isCommitted: false };
    }

    return {
      isCommitted: true,
      hash: lineInfo.hash,
      author: lineInfo.author,
      email: lineInfo.email,
      date: lineInfo.date,
      message: lineInfo.message,
      summary: this.formatCommitSummary(lineInfo),
      relativeTime: this.formatRelativeTime(lineInfo.date)
    };
  }

  /**
   * 检查文件是否被Git跟踪
   */
  private async isFileTracked(relativePath: string): Promise<boolean> {
    if (!this.git) {
      return false;
    }

    try {
      await this.git.raw(['ls-files', '--error-unmatch', relativePath]);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 解析 git blame 输出
   */
  private parseBlameOutput(blameOutput: string, filename: string): GitBlameInfo[] {
    const lines = blameOutput.split('\n');
    const blameInfo: GitBlameInfo[] = [];
    let currentCommit: Partial<GitBlameInfo> = {};
    let lineNumber = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.match(/^[a-f0-9]{40}/)) {
        // 新的提交行
        const parts = line.split(' ');
        currentCommit = {
          hash: parts[0],
          originalLine: parseInt(parts[1]),
          line: parseInt(parts[2]) || lineNumber,
          filename: filename
        };
      } else if (line.startsWith('author ')) {
        currentCommit.author = line.substring(7);
      } else if (line.startsWith('author-mail ')) {
        currentCommit.email = line.substring(12).replace(/[<>]/g, '');
      } else if (line.startsWith('author-time ')) {
        const timestamp = parseInt(line.substring(12));
        currentCommit.date = new Date(timestamp * 1000);
      } else if (line.startsWith('summary ')) {
        currentCommit.message = line.substring(8);
      } else if (line.startsWith('\t')) {
        // 实际的代码行，完成当前提交信息
        if (currentCommit.hash && currentCommit.author && currentCommit.date && currentCommit.message) {
          blameInfo.push(currentCommit as GitBlameInfo);
        }
        lineNumber++;
      }
    }

    return blameInfo;
  }

  /**
   * 格式化提交摘要
   */
  private formatCommitSummary(blameInfo: GitBlameInfo): string {
    const shortHash = blameInfo.hash.substring(0, 7);
    const author = blameInfo.author;
    const relativeTime = this.formatRelativeTime(blameInfo.date);
    const message = blameInfo.message.length > 50 
      ? blameInfo.message.substring(0, 47) + '...' 
      : blameInfo.message;
    
    return `${author}, ${relativeTime} • ${shortHash} • ${message}`;
  }

  /**
   * 格式化相对时间
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return '刚刚';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else if (diffDays < 30) {
      return `${diffDays}天前`;
    } else if (diffMonths < 12) {
      return `${diffMonths}个月前`;
    } else {
      return `${diffYears}年前`;
    }
  }

  /**
   * 缓存 blame 信息
   */
  private cacheBlameInfo(key: string, blameInfo: GitBlameInfo[]) {
    // 限制缓存大小
    if (this.blameCache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.blameCache.keys().next().value;
      if (firstKey) {
        this.blameCache.delete(firstKey);
        this.cacheTimestamps.delete(firstKey);
      }
    }

    this.blameCache.set(key, blameInfo);
    this.cacheTimestamps.set(key, Date.now());
  }

  /**
   * 清除缓存
   */
  public clearCache() {
    this.blameCache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * 获取提交的详细信息
   */
  async getCommitDetails(hash: string): Promise<{
    hash: string;
    author: string;
    email: string;
    date: Date;
    message: string;
    body: string;
  } | null> {
    if (!this.git || hash.startsWith('0000000')) {
      return null;
    }

    try {
      const result = await this.git.show([
        hash,
        '--pretty=format:%H|%an|%ae|%ai|%s|%b',
        '--no-patch'
      ]);

      const lines = result.split('\n');
      const firstLine = lines[0];
      const parts = firstLine.split('|');
      
      if (parts.length >= 5) {
        return {
          hash: parts[0],
          author: parts[1],
          email: parts[2],
          date: new Date(parts[3]),
          message: parts[4],
          body: parts[5] || ''
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting commit details:', error);
      return null;
    }
  }
}