import { SimpleGit } from "simple-git";
import { GitBranch } from "../types/gitTypes";

/**
 * Git分支操作管理器
 * 负责所有与分支相关的操作
 */
export class GitBranchOperations {
  private git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  /**
   * 获取分支列表
   * @returns 分支列表
   */
  async getBranches(): Promise<GitBranch[]> {
    try {
      const branchSummary = await this.git.branch();
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
    } catch (error) {
      console.error("Failed to get branches:", error);
      return [];
    }
  }

  /**
   * 切换到指定分支
   * @param branchName 分支名称
   * @returns 是否成功
   */
  async checkoutBranch(branchName: string): Promise<boolean> {
    try {
      await this.git.checkout(branchName);
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
    try {
      await this.git.checkoutLocalBranch(branchName);
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
    try {
      await this.git.checkoutBranch(branchName, hash);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Create branch from commit failed: ${errorMessage}`);
    }
  }

  /**
   * 删除本地分支
   * @param branchName 分支名称
   * @param force 是否强制删除
   * @returns 是否成功
   */
  async deleteLocalBranch(branchName: string, force: boolean = false): Promise<boolean> {
    try {
      await this.git.deleteLocalBranch(branchName, force);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Delete local branch failed: ${errorMessage}`);
    }
  }

  /**
   * 重命名当前分支
   * @param newName 新的分支名称
   * @returns 是否成功
   */
  async renameBranch(newName: string): Promise<boolean> {
    try {
      await this.git.raw(["branch", "-m", newName]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Rename branch failed: ${errorMessage}`);
    }
  }

  /**
   * 获取当前分支名称
   * @returns 当前分支名称
   */
  async getCurrentBranchName(): Promise<string | null> {
    try {
      const branchName = await this.git.revparse(["--abbrev-ref", "HEAD"]);
      return branchName.trim();
    } catch (error: any) {
      console.warn("Failed to get current branch name:", error);
      return null;
    }
  }

  /**
   * 合并指定分支到当前分支
   * @param branchName 要合并的分支名称
   * @param fastForwardOnly 是否仅允许快进合并
   * @returns 是否成功
   */
  async mergeBranch(branchName: string, fastForwardOnly: boolean = false): Promise<boolean> {
    try {
      const options = fastForwardOnly ? ["--ff-only"] : [];
      await this.git.merge([branchName, ...options]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Merge branch failed: ${errorMessage}`);
    }
  }

  /**
   * 变基当前分支到指定分支
   * @param baseBranch 基础分支名称
   * @returns 是否成功
   */
  async rebaseToBranch(baseBranch: string): Promise<boolean> {
    try {
      await this.git.rebase([baseBranch]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Rebase to branch failed: ${errorMessage}`);
    }
  }

  /**
   * 检查分支是否存在
   * @param branchName 分支名称
   * @returns 是否存在
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      const branches = await this.git.branch(["-a"]);
      return branches.all.some(branch => 
        branch === branchName || 
        branch === `remotes/origin/${branchName}` ||
        branch.endsWith(`/${branchName}`)
      );
    } catch (error) {
      console.warn("Failed to check branch existence:", error);
      return false;
    }
  }

  /**
   * 获取分支的上游信息
   * @param branchName 分支名称（可选，默认当前分支）
   * @returns 上游分支信息
   */
  async getUpstreamBranch(branchName?: string): Promise<string | null> {
    try {
      const branch = branchName || await this.getCurrentBranchName();
      if (!branch) return null;

      const upstream = await this.git.raw([
        "rev-parse", 
        "--abbrev-ref", 
        `${branch}@{upstream}`
      ]);
      return upstream.trim();
    } catch (error) {
      // 如果分支没有上游，会抛出错误，这是正常的
      return null;
    }
  }

  /**
   * 设置分支的上游
   * @param branchName 本地分支名称
   * @param upstreamBranch 上游分支名称
   * @returns 是否成功
   */
  async setUpstreamBranch(branchName: string, upstreamBranch: string): Promise<boolean> {
    try {
      await this.git.raw(["branch", "--set-upstream-to", upstreamBranch, branchName]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Set upstream branch failed: ${errorMessage}`);
    }
  }
}