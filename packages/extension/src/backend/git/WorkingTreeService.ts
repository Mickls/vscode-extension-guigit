import { simpleGit } from "simple-git";
import type { WorkingTreeViewModel } from "../rpc/contract";
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
}
