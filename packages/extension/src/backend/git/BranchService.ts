import { simpleGit } from "simple-git";
import type { BranchesViewModel, BranchViewModel, RemoteBranchGroupViewModel } from "../rpc/contract";

export interface BranchSummary {
  all: readonly string[];
  current: string;
}

export interface BranchServiceInput {
  branchSummary?: (repositoryRoot: string, args: readonly string[]) => Promise<BranchSummary>;
}

export class BranchService {
  private readonly branchSummary: (repositoryRoot: string, args: readonly string[]) => Promise<BranchSummary>;

  public constructor(input?: BranchServiceInput) {
    this.branchSummary =
      input?.branchSummary ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).branch([...args]));
  }

  public async listBranches(repositoryRoot: string): Promise<BranchesViewModel> {
    const [localSummary, remoteSummary] = await Promise.all([
      this.branchSummary(repositoryRoot, []),
      this.branchSummary(repositoryRoot, ["-r"])
    ]);

    return {
      locals: localSummary.all
        .map((name) => ({
          current: name === localSummary.current,
          name
        }))
        .sort((a, b) => compareBranchNames(a.name, b.name)),
      remotes: groupRemoteBranches(remoteSummary.all)
    };
  }
}

function groupRemoteBranches(branchNames: readonly string[]): readonly RemoteBranchGroupViewModel[] {
  const remoteBranches = new Map<string, BranchViewModel[]>();

  for (const fullName of branchNames) {
    if (fullName.includes("HEAD")) {
      continue;
    }

    const slashIndex = fullName.indexOf("/");
    if (slashIndex <= 0 || slashIndex === fullName.length - 1) {
      continue;
    }

    const remote = fullName.slice(0, slashIndex);
    const branches = remoteBranches.get(remote) ?? [];
    branches.push({
      current: false,
      name: fullName,
      remote
    });
    remoteBranches.set(remote, branches);
  }

  return [...remoteBranches.entries()]
    .sort(([a], [b]) => compareRemoteNames(a, b))
    .map(([remote, branches]) => ({
      branches: branches.sort((a, b) => compareBranchNames(shortRemoteBranchName(a.name), shortRemoteBranchName(b.name))),
      remote
    }));
}

function compareRemoteNames(a: string, b: string): number {
  if (a === "origin") {
    return -1;
  }

  if (b === "origin") {
    return 1;
  }

  return a.localeCompare(b);
}

function compareBranchNames(a: string, b: string): number {
  const priorityDiff = branchPriority(b) - branchPriority(a);
  return priorityDiff === 0 ? a.localeCompare(b) : priorityDiff;
}

function branchPriority(name: string): number {
  if (name === "main") {
    return 2;
  }

  if (name === "master") {
    return 1;
  }

  return 0;
}

function shortRemoteBranchName(name: string): string {
  return name.slice(name.indexOf("/") + 1);
}
