import { simpleGit } from "simple-git";
import type { OperationResultViewModel, WorkingTreeViewModel } from "../rpc/contract";
import { parsePorcelainStatus, parseStashList } from "./WorkingTreeParser";

export interface WorkingTreeServiceInput {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
}

export class WorkingTreeService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;

  public constructor(input: WorkingTreeServiceInput = {}) {
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
  }

  public async load(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeViewModel> {
    const [branchOutput, statusOutput, stashOutput] = await Promise.all([
      this.gitRaw(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      this.gitRaw(repositoryRoot, ["status", "--porcelain=v1"]),
      this.gitRaw(repositoryRoot, ["stash", "list"])
    ]);
    const status = parsePorcelainStatus(statusOutput);

    return {
      branch: branchOutput.trim(),
      repositoryId,
      repositoryRoot,
      staged: status.staged,
      stashes: parseStashList(stashOutput),
      unstaged: status.unstaged
    };
  }

  public async stageFile(repositoryId: string, repositoryRoot: string, filePath: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["add", "--", filePath], "Staged file");
  }

  public async stageAll(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["add", "--all"], "Staged all changes");
  }

  public async unstageFile(repositoryId: string, repositoryRoot: string, filePath: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["restore", "--staged", "--", filePath], "Unstaged file");
  }

  public async unstageAll(repositoryId: string, repositoryRoot: string): Promise<WorkingTreeActionResult> {
    return this.withResult(repositoryId, repositoryRoot, ["restore", "--staged", "--", "."], "Unstaged all changes");
  }

  private async withResult(
    repositoryId: string,
    repositoryRoot: string,
    args: readonly string[],
    message: string
  ): Promise<WorkingTreeActionResult> {
    await this.gitRaw(repositoryRoot, args);

    return {
      result: {
        message,
        status: "ok"
      },
      workingTree: await this.load(repositoryId, repositoryRoot)
    };
  }
}

export interface WorkingTreeActionResult {
  result: OperationResultViewModel;
  workingTree: WorkingTreeViewModel;
}
