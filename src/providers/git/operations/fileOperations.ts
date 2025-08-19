import { SimpleGit } from "simple-git";
import { GitCommit, GitFileChange } from "../types/gitTypes";

/**
 * Git文件操作管理器
 * 负责所有与文件相关的操作
 */
export class GitFileOperations {
  private git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  /**
   * 获取提交的文件变更
   */
  async getCommitFileChanges(hash: string): Promise<GitFileChange[]> {
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
  async getInitialCommitFiles(hash: string): Promise<GitFileChange[]> {
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
  async getRegularCommitFiles(hash: string): Promise<GitFileChange[]> {
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
  async getFilesWithNumstat(hash: string): Promise<GitFileChange[]> {
    try {
      const numstatOutput = await this.git.show([
        "--numstat",
        "--format=",
        hash,
      ]);

      const lines = numstatOutput
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      return lines
        .map((line) => {
          const parts = line.split("\t");
          if (parts.length < 3) return null;

          const insertions = parts[0] === "-" ? 0 : parseInt(parts[0]) || 0;
          const deletions = parts[1] === "-" ? 0 : parseInt(parts[1]) || 0;
          const fileName = parts[2] || "";

          return {
            file: fileName,
            insertions,
            deletions,
            binary: parts[0] === "-" && parts[1] === "-",
          } as GitFileChange;
        })
        .filter((item): item is GitFileChange => item !== null);
    } catch (error) {
      console.warn("Failed to get files with numstat:", error);
      return [];
    }
  }

  /**
   * 使用name-status方法获取文件变更
   */
  async getFilesWithNameStatus(
    hash: string,
    isInitial: boolean
  ): Promise<GitFileChange[]> {
    try {
      const showOutput = await this.git.show([
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
            const fileContent = await this.git.show([`${hash}:${fileName}`]);
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
    } catch (error) {
      console.warn("Failed to get files with name-status:", error);
      return [];
    }
  }

  /**
   * 使用ls-tree方法获取文件变更
   */
  async getFilesWithLsTree(hash: string): Promise<GitFileChange[]> {
    try {
      const lsTreeOutput = await this.git.raw(["ls-tree", "-r", "--name-only", hash]);
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
    } catch (error) {
      console.warn("Failed to get files with ls-tree:", error);
      return [];
    }
  }

  /**
   * 使用diff summary方法获取文件变更
   */
  async getFilesWithDiffSummary(hash: string): Promise<GitFileChange[]> {
    try {
      const diffSummary = await this.git.diffSummary([`${hash}^`, hash]);
      return diffSummary.files.map((file) => ({
        file: file.file,
        insertions: "insertions" in file ? file.insertions : 0,
        deletions: "deletions" in file ? file.deletions : 0,
        binary: file.binary,
      }));
    } catch (error) {
      console.warn("Failed to get files with diff summary:", error);
      return [];
    }
  }

  /**
   * 比较两个提交之间的文件变化
   * @param hash1 第一个提交哈希
   * @param hash2 第二个提交哈希
   * @returns 文件变化列表
   */
  async compareCommits(hash1: string, hash2: string): Promise<GitFileChange[]> {
    const diffSummary = await this.git.diffSummary([hash1, hash2]);
    return diffSummary.files.map((file) => ({
      file: file.file,
      insertions: "insertions" in file ? file.insertions : 0,
      deletions: "deletions" in file ? file.deletions : 0,
      binary: file.binary,
    }));
  }

  /**
   * 检查是否为初始提交
   * @param hash 提交哈希
   * @returns 是否为初始提交
   */
  async isInitialCommit(hash: string): Promise<boolean> {
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
    try {
      return await this.git.show([`${hash}:${filePath}`]);
    } catch (error) {
      console.warn("Failed to get file content:", error);
      return null;
    }
  }

  /**
   * 获取文件的提交历史
   * @param filePath 文件路径
   * @returns 文件的提交历史
   */
  async getFileHistory(filePath: string): Promise<GitCommit[]> {
    try {
      const log = await this.git.log({
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
    } catch (error) {
      console.warn("Failed to get file history:", error);
      return [];
    }
  }

  /**
   * 获取指定提交中文件的内容
   * @param hash 提交哈希
   * @param filePath 文件路径
   * @returns 文件内容
   */
  async getFileDiff(hash: string, filePath: string): Promise<string> {
    try {
      return await this.git.show([`${hash}:${filePath}`]);
    } catch (error) {
      console.warn("Failed to get file content:", error);
      return "";
    }
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
    try {
      // 检查是否是初始提交
      const isInitial = await this.isInitialCommit(hash);

      if (isInitial) {
        // 对于初始提交，使用 git show 命令生成标准的 diff 格式
        const diff = await this.git.show([
          "--format=",
          hash,
          "--",
          filePath,
        ]);
        return diff || "No changes in this file";
      } else {
        // 对于普通提交，显示与父提交的差异
        const diff = await this.git.diff([`${hash}^`, hash, "--", filePath]);
        return diff || "No changes in this file";
      }
    } catch (error) {
      console.warn("Failed to get file diff content:", error);
      return null;
    }
  }
}