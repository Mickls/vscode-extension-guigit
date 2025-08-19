export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author: string;
  email: string;
  refs: string;
  body: string;
  parents: string[];
  children: string[];
  branchName?: string;
  canEditMessage?: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
}

export interface GitRepository {
  name: string;
  path: string;
  isActive: boolean;
}

export interface GitFileChange {
  file: string;
  insertions: number;
  deletions: number;
  binary: boolean;
}