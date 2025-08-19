import { SimpleGit } from "simple-git";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Git安全操作管理器
 * 负责所有与安全操作相关的功能，如暂存恢复、冲突处理等
 */
export class GitSafetyOperations {
  private git: SimpleGit;

  constructor(git: SimpleGit) {
    this.git = git;
  }

  /**
   * 检查是否有未提交的变更
   * @returns 是否有未提交的变更
   */
  async hasUncommittedChanges(): Promise<boolean> {
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
   * 获取用户的自动暂存偏好设置
   * @returns 用户偏好：'always' | 'never' | 'ask'
   */
  private getAutoStashPreference(): string {
    const config = vscode.workspace.getConfiguration("guigit");
    return config.get<string>("autoStashOnPull") || "ask";
  }

  /**
   * 设置用户的自动暂存偏好
   * @param preference 偏好设置
   */
  private async setAutoStashPreference(preference: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("guigit");
    await config.update(
      "autoStashOnPull",
      preference,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * 处理未提交变更的交互逻辑
   * @returns 是否应该继续操作以及是否已暂存
   */
  async handleUncommittedChanges(): Promise<{ shouldContinue: boolean; stashed: boolean }> {
    const hasChanges = await this.hasUncommittedChanges();
    if (!hasChanges) {
      return { shouldContinue: true, stashed: false };
    }

    const autoStashPreference = this.getAutoStashPreference();

    if (autoStashPreference === "always") {
      // 用户设置了总是自动暂存
      await this.stashUncommittedChanges();
      vscode.window.showInformationMessage("已自动暂存未提交的变更");
      return { shouldContinue: true, stashed: true };
    } else if (autoStashPreference === "never") {
      // 用户设置了从不自动暂存，直接取消操作
      vscode.window.showWarningMessage(
        "检测到未提交的变更，操作已取消。请先提交或手动暂存变更。"
      );
      return { shouldContinue: false, stashed: false };
    } else {
      // 询问用户如何处理未提交的变更
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
          await this.setAutoStashPreference("never");
          vscode.window.showInformationMessage(
            "已设置为遇到未提交变更时总是取消操作。可通过重置偏好按钮修改此行为。"
          );
        }
        return { shouldContinue: false, stashed: false };
      }

      if (choice === "自动暂存并继续") {
        // 询问是否记住选择
        const rememberChoice = await vscode.window.showInformationMessage(
          "是否记住此选择？下次遇到未提交变更时将自动暂存并继续。",
          "记住选择",
          "仅此次"
        );

        if (rememberChoice === "记住选择") {
          await this.setAutoStashPreference("always");
          vscode.window.showInformationMessage(
            "已设置为总是自动暂存未提交的变更。可通过重置偏好按钮修改此行为。"
          );
        }

        await this.stashUncommittedChanges();
        vscode.window.showInformationMessage("已自动暂存未提交的变更");
        return { shouldContinue: true, stashed: true };
      }
    }

    return { shouldContinue: false, stashed: false };
  }

  /**
   * 安全地恢复暂存，处理错误情况
   * @param operationName 操作名称，用于错误提示
   */
  async safePopStash(operationName: string = "操作"): Promise<void> {
    try {
      await this.popStash();
      vscode.window.showInformationMessage("已恢复之前暂存的变更");
    } catch (error) {
      vscode.window.showWarningMessage(
        `${operationName}成功，但恢复暂存时出现问题。请手动执行 "git stash pop" 来恢复变更。`
      );
    }
  }

  /**
   * 重置自动暂存偏好设置
   * @returns 是否成功
   */
  async resetAutoStashPreference(): Promise<boolean> {
    try {
      await this.setAutoStashPreference("ask");
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

  /**
   * 检查是否处于合并冲突状态
   * @returns 是否有未解决的合并冲突
   */
  async hasMergeConflicts(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return status.conflicted.length > 0;
    } catch (error: any) {
      console.warn("Failed to check merge conflicts:", error);
      return false;
    }
  }

  /**
   * 获取冲突文件列表
   * @returns 冲突文件路径列表
   */
  async getConflictedFiles(): Promise<string[]> {
    try {
      const status = await this.git.status();
      return status.conflicted;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Get conflicted files failed: ${errorMessage}`);
    }
  }

  /**
   * 中止当前的合并操作
   * @returns 是否成功
   */
  async abortMerge(): Promise<boolean> {
    try {
      await this.git.raw(["merge", "--abort"]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Abort merge failed: ${errorMessage}`);
    }
  }

  /**
   * 中止当前的变基操作
   * @returns 是否成功
   */
  async abortRebase(): Promise<boolean> {
    try {
      await this.git.raw(["rebase", "--abort"]);
      return true;
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.toString() || "Unknown error";
      throw new Error(`Abort rebase failed: ${errorMessage}`);
    }
  }

  /**
   * 检查是否处于变基状态
   * @returns 是否正在进行变基
   */
  async isRebasing(): Promise<boolean> {
    try {
      // 检查是否存在 .git/rebase-merge 或 .git/rebase-apply 目录
      const result = await this.git.raw(["rev-parse", "--git-dir"]);
      const gitDir = result.trim();

      const rebaseMergeDir = path.join(gitDir, "rebase-merge");
      const rebaseApplyDir = path.join(gitDir, "rebase-apply");

      return fs.existsSync(rebaseMergeDir) || fs.existsSync(rebaseApplyDir);
    } catch (error: any) {
      console.warn("Failed to check rebase status:", error);
      return false;
    }
  }

  /**
   * 检查是否处于合并状态
   * @returns 是否正在进行合并
   */
  async isMerging(): Promise<boolean> {
    try {
      // 检查是否存在 .git/MERGE_HEAD 文件
      const result = await this.git.raw(["rev-parse", "--git-dir"]);
      const gitDir = result.trim();

      const mergeHeadFile = path.join(gitDir, "MERGE_HEAD");
      return fs.existsSync(mergeHeadFile);
    } catch (error: any) {
      console.warn("Failed to check merge status:", error);
      return false;
    }
  }
}