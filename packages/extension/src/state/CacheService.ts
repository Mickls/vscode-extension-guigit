import type { CommitDetailsViewModel } from "../backend/rpc/contract";

export class CacheService {
  private readonly commitDetails = new Map<string, CommitDetailsViewModel>();
  private readonly totalCommitCounts = new Map<string, number>();

  public getCommitDetails(repositoryRoot: string, hash: string): CommitDetailsViewModel | undefined {
    return this.commitDetails.get(commitDetailsKey(repositoryRoot, hash));
  }

  public setCommitDetails(repositoryRoot: string, hash: string, details: CommitDetailsViewModel): void {
    this.commitDetails.set(commitDetailsKey(repositoryRoot, hash), details);
  }

  public getTotalCommitCount(key: string): number | undefined {
    return this.totalCommitCounts.get(key);
  }

  public setTotalCommitCount(key: string, count: number): void {
    this.totalCommitCounts.set(key, count);
  }
}

function commitDetailsKey(repositoryRoot: string, hash: string): string {
  return `${repositoryRoot}:${hash}`;
}
