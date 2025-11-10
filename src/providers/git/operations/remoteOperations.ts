import { SimpleGit } from "simple-git";

/**
 * Git远程操作管理器
 * 负责所有与远程仓库相关的操作
 */
export class GitRemoteOperations {
  private git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  /**
   * 获取远程仓库URL
   * @returns 远程仓库URL
   */
  async getRemoteUrl(): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);

      // 优先查找 origin，如果没有则使用第一个远程仓库
      const origin = remotes.find((remote) => remote.name === "origin");
      const remote = origin || remotes[0];

      if (remote && remote.refs && remote.refs.fetch) {
        return remote.refs.fetch;
      }

      return null;
    } catch (error) {
      console.warn("Failed to get remote URL:", error);
      return null;
    }
  }

  /**
   * 从远程仓库拉取代码
   * @returns 是否成功
   */
  async pullFromRemote(): Promise<boolean> {
    try {
      await this.git.pull();
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
    try {
      if (rebase) {
        await this.git.fetch(remote, branch);
        await this.git.rebase([`${remote}/${branch}`]);
      } else {
        await this.git.pull(remote, branch);
      }
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
    try {
      await this.git.push();
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
    try {
      const slashIdx = remoteBranch.indexOf("/");
      if (slashIdx <= 0 || slashIdx === remoteBranch.length - 1) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }
      const remote = remoteBranch.slice(0, slashIdx);
      const branch = remoteBranch.slice(slashIdx + 1);

      if (rebase) {
        // 同上：避免 `git pull --rebase` 的多分支问题，改为 fetch + rebase 组合
        await this.git.fetch(remote, branch);
        await this.git.rebase([`${remote}/${branch}`]);
      } else {
        await this.git.pull(remote, branch);
      }
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
    try {
      const slashIdx = remoteBranch.indexOf("/");
      if (slashIdx <= 0 || slashIdx === remoteBranch.length - 1) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }
      const remote = remoteBranch.slice(0, slashIdx);
      const branch = remoteBranch.slice(slashIdx + 1);

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
    try {
      if (prune) {
        // 使用 --all --prune 参数，确保清理已删除的远程分支引用
        await this.git.fetch(["--all", "--prune"]);
      } else {
        await this.git.fetch();
      }
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Fetch failed: ${errorMessage}`);
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

      await this.git.clone(repoUrl, clonePath);
      return clonePath;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Clone failed: ${errorMessage}`);
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
    try {
      const slashIdx = remoteBranch.indexOf("/");
      if (slashIdx <= 0 || slashIdx === remoteBranch.length - 1) {
        throw new Error(`Invalid remote branch format: ${remoteBranch}`);
      }
      const remote = remoteBranch.slice(0, slashIdx);
      const branch = remoteBranch.slice(slashIdx + 1);

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
   * 获取远程仓库详细信息（包括 fetch/push URL）
   */
  async getRemoteDetails(): Promise<
    { name: string; fetchUrl: string | null; pushUrl: string | null }[]
  > {
    try {
      const remotes = await this.git.getRemotes(true);
      return remotes.map((remote) => ({
        name: remote.name,
        fetchUrl: remote.refs?.fetch ?? null,
        pushUrl: remote.refs?.push ?? null,
      }));
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Get remote details failed: ${errorMessage}`);
    }
  }

  /**
   * 新增远程仓库
   */
  async addRemote(name: string, url: string): Promise<void> {
    try {
      await this.git.addRemote(name, url);
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Add remote failed: ${errorMessage}`);
    }
  }

  /**
   * 删除远程仓库
   */
  async removeRemote(name: string): Promise<void> {
    try {
      await this.git.removeRemote(name);
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Remove remote failed: ${errorMessage}`);
    }
  }

  /**
   * 更新远程仓库地址
   */
  async updateRemote(name: string, url: string): Promise<void> {
    try {
      await this.git.raw(["remote", "set-url", name, url]);
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Update remote failed: ${errorMessage}`);
    }
  }
}
