import { simpleGit } from "simple-git";
import type { CommitListItemViewModel, RefViewModel } from "../rpc/contract";
import type { CacheService } from "../../state/CacheService";
import type { Logger } from "../../logging/LoggerService";

const fieldSeparator = "\x1f";
const recordSeparator = "\x1e";
const prettyFormat = `%H${fieldSeparator}%ai${fieldSeparator}%s${fieldSeparator}%an${fieldSeparator}%ae${fieldSeparator}%D${fieldSeparator}%P${recordSeparator}`;

export interface CommitServiceInput {
  cache: CacheService;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug">;
}

export interface CurrentGitUser {
  email: string;
  name: string;
}

export interface CommitHistoryInput {
  author?: string;
  branch?: string;
  branches?: readonly string[];
  cursor?: string;
  pageSize: number;
  repositoryRoot: string;
  search?: string;
}

export interface CommitHistoryResult {
  commits: readonly CommitListItemViewModel[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface CommitCountInput {
  author?: string;
  branch?: string;
  branches?: readonly string[];
  repositoryRoot: string;
}

interface ParsedCommit {
  author: string;
  date: string;
  email: string;
  hash: string;
  message: string;
  parents: readonly string[];
  refs: readonly RefViewModel[];
  shortHash: string;
}

interface EditableContext {
  latestHash: string;
  userEmail: string;
  userName: string;
}

export class CommitService {
  private readonly cache: CacheService;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug"> | undefined;

  public constructor(input: CommitServiceInput) {
    this.cache = input.cache;
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
  }

  public async loadHistory(input: CommitHistoryInput): Promise<CommitHistoryResult> {
    const skip = Number(input.cursor ?? "0");
    const commits = await this.loadMatchingCommits(input, skip);
    const page = commits.slice(0, input.pageSize);
    if (page.length === 0) {
      return {
        commits: [],
        hasMore: false
      };
    }

    const editableContext = await this.getEditableContext(input.repositoryRoot);

    return {
      commits: page.map((commit) => toViewModel(commit, editableContext)),
      hasMore: commits.length > input.pageSize,
      nextCursor: commits.length > input.pageSize ? String(skip + input.pageSize) : undefined
    };
  }

  public async getTotalCommitCount(input: CommitCountInput): Promise<number> {
    const cacheKey = totalCommitCountKey(input);
    const cached = this.cache.getTotalCommitCount(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const args = ["rev-list", "--count", ...refArgs(input.branch, input.branches)];
    if (input.author) {
      args.push(...authorArgs(input.author));
    }

    const count = Number.parseInt((await this.gitRaw(input.repositoryRoot, args)).trim(), 10);
    this.cache.setTotalCommitCount(cacheKey, count);
    return count;
  }

  public async getCurrentUser(repositoryRoot: string): Promise<CurrentGitUser | undefined> {
    try {
      const [userName, userEmail] = await Promise.all([
        this.gitRaw(repositoryRoot, ["config", "user.name"]),
        this.gitRaw(repositoryRoot, ["config", "user.email"])
      ]);

      return {
        email: userEmail.trim(),
        name: userName.trim()
      };
    } catch {
      return undefined;
    }
  }

  private async loadMatchingCommits(input: CommitHistoryInput, skip: number): Promise<readonly ParsedCommit[]> {
    if (input.search && isHashPrefix(input.search)) {
      const args = buildLogArgs(input, undefined, undefined);
      this.logger?.debug("git.history.load", {
        args,
        repositoryRoot: input.repositoryRoot
      });
      const hashMatches = parseCommitLog(await this.loadCommitLog(input.repositoryRoot, args)).filter((commit) =>
        commit.hash.toLowerCase().startsWith(input.search!.toLowerCase())
      );

      if (hashMatches.length > 0) {
        const commits = hashMatches.slice(skip, skip + input.pageSize + 1);
        this.logHistoryLoaded(input.repositoryRoot, commits.length, commits.length > input.pageSize);
        return commits;
      }
    }

    const args = buildLogArgs(input, input.pageSize + 1, skip, input.search);
    this.logger?.debug("git.history.load", {
      args,
      repositoryRoot: input.repositoryRoot
    });
    const commits = parseCommitLog(await this.loadCommitLog(input.repositoryRoot, args));
    this.logHistoryLoaded(input.repositoryRoot, commits.length, commits.length > input.pageSize);
    return commits;
  }

  private async loadCommitLog(repositoryRoot: string, args: readonly string[]): Promise<string> {
    try {
      return await this.gitRaw(repositoryRoot, args);
    } catch (error) {
      if (isEmptyRepositoryLogError(error)) {
        return "";
      }

      throw error;
    }
  }

  private logHistoryLoaded(repositoryRoot: string, commitCount: number, hasMore: boolean): void {
    this.logger?.debug("git.history.loaded", {
      commitCount,
      hasMore,
      repositoryRoot
    });
  }

  private async getEditableContext(repositoryRoot: string): Promise<EditableContext | undefined> {
    try {
      const [latestHash, currentUser] = await Promise.all([this.gitRaw(repositoryRoot, ["rev-parse", "HEAD"]), this.getCurrentUser(repositoryRoot)]);

      if (!currentUser) {
        return undefined;
      }

      return {
        latestHash: latestHash.trim(),
        userEmail: currentUser.email,
        userName: currentUser.name
      };
    } catch {
      return undefined;
    }
  }
}

function isEmptyRepositoryLogError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("does not have any commits yet");
}

function buildLogArgs(
  input: CommitHistoryInput,
  maxCount: number | undefined,
  skip: number | undefined,
  grep?: string
): string[] {
  const args = ["log", ...refArgs(input.branch, input.branches), "--topo-order", `--pretty=format:${prettyFormat}`, "--encoding=UTF-8"];

  if (maxCount !== undefined) {
    args.push(`--max-count=${maxCount}`);
  }

  if (skip !== undefined && skip > 0) {
    args.push(`--skip=${skip}`);
  }

  if (input.author) {
    args.push(...authorArgs(input.author));
  }

  if (grep) {
    args.push(`--grep=${grep}`, "-i");
  }

  return args;
}

function authorArgs(author: string): string[] {
  const authors = author
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (authors.length > 1) {
    return ["--extended-regexp", `--author=(${authors.map(escapeExtendedRegex).join("|")})`];
  }

  return [`--author=${author}`];
}

function refArgs(branch: string | undefined, branches: readonly string[] | undefined): string[] {
  if (branches && branches.length > 0) {
    return [...branches];
  }

  return branch && branch !== "all" ? [branch] : ["--branches", "--remotes", "--tags"];
}

function escapeExtendedRegex(value: string): string {
  return value.replace(/[()[\]{}.*+?^$\\|]/g, "\\$&");
}

function parseCommitLog(output: string): readonly ParsedCommit[] {
  return output
    .split(recordSeparator)
    .filter(Boolean)
    .map((line) => {
      const fields = line.trim().split(fieldSeparator);
      const hash = fields[0]!;
      const date = fields[1]!;
      const message = fields[2]!;
      const author = fields[3]!;
      const email = fields[4]!;
      const refs = fields[5]!;
      const parents = fields[6]!;

      return {
        author,
        date,
        email,
        hash,
        message,
        parents: parents.split(" ").filter(Boolean),
        refs: parseRefs(refs),
        shortHash: hash.slice(0, 7)
      };
    });
}

function parseRefs(refs: string): readonly RefViewModel[] {
  return refs
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean)
    .flatMap((ref) => {
      if (ref.startsWith("HEAD -> ")) {
        const target = ref.slice("HEAD -> ".length);
        return [{ name: "HEAD", type: "head" }, classifyRef(target)];
      }

      if (ref === "HEAD") {
        return [{ name: "HEAD", type: "head" }];
      }

      if (ref.startsWith("tag: ")) {
        return [{ name: ref.slice("tag: ".length), type: "tag" }];
      }

      return [classifyRef(ref)];
    });
}

function classifyRef(ref: string): RefViewModel {
  return {
    name: ref,
    type: ref.includes("/") ? "remote" : "local"
  };
}

function toViewModel(commit: ParsedCommit, editableContext: EditableContext | undefined): CommitListItemViewModel {
  return {
    author: commit.author,
    canEditMessage:
      editableContext !== undefined &&
      commit.hash === editableContext.latestHash &&
      (commit.author === editableContext.userName || commit.email === editableContext.userEmail),
    date: commit.date,
    hash: commit.hash,
    message: commit.message,
    parents: commit.parents,
    refs: commit.refs,
    shortHash: commit.shortHash
  };
}

function isHashPrefix(search: string): boolean {
  return /^[a-f0-9]{4,40}$/i.test(search);
}

function totalCommitCountKey(input: CommitCountInput): string {
  return `${input.repositoryRoot}:${input.branches?.join("|") ?? input.branch ?? "all"}:${input.author ?? "all"}`;
}
