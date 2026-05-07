import { simpleGit } from "simple-git";
import type {
  CommitDetailsViewModel,
  FileChangeViewModel,
  FileViewMode,
  RefViewModel,
  RpcPayloadByType
} from "../rpc/contract";
import type { CacheService } from "../../state/CacheService";

const fieldSeparator = "\x1f";
const commitFormat = `%H${fieldSeparator}%ai${fieldSeparator}%s${fieldSeparator}%an${fieldSeparator}%ae${fieldSeparator}%D${fieldSeparator}%b`;

export interface FileServiceConfiguration {
  get: (key: "guigit.fileViewMode") => FileViewMode;
  update: (key: "guigit.fileViewMode", value: FileViewMode) => Promise<void>;
}

export interface FileServiceInput {
  cache: CacheService;
  configuration: FileServiceConfiguration;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
}

interface CommitInfo {
  author: string;
  body: string;
  date: string;
  email: string;
  hash: string;
  message: string;
  refs: readonly RefViewModel[];
}

interface FileStats {
  binary: boolean;
  deletions: number;
  insertions: number;
  path: string;
}

interface FileStatus {
  path: string;
  previousPath?: string;
  status: FileChangeViewModel["status"];
}

interface EditableContext {
  latestHash: string;
  userEmail: string;
  userName: string;
}

export class FileService {
  private readonly cache: CacheService;
  private readonly configuration: FileServiceConfiguration;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;

  public constructor(input: FileServiceInput) {
    this.cache = input.cache;
    this.configuration = input.configuration;
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
  }

  public async getCommitDetails(repositoryRoot: string, hash: string): Promise<CommitDetailsViewModel> {
    const cached = this.cache.getCommitDetails(repositoryRoot, hash);
    if (cached) {
      return cached;
    }

    const [commit, files, editableContext] = await Promise.all([
      this.getCommitInfo(repositoryRoot, hash),
      this.getCommitFileChanges(repositoryRoot, hash),
      this.getEditableContext(repositoryRoot)
    ]);

    const details = {
      ...commit,
      canEditMessage:
        editableContext !== undefined &&
        commit.hash === editableContext.latestHash &&
        (commit.author === editableContext.userName || commit.email === editableContext.userEmail),
      files
    };

    this.cache.setCommitDetails(repositoryRoot, hash, details);
    return details;
  }

  public async getFileChanges(
    repositoryRoot: string,
    hash: string,
    mode: FileViewMode
  ): Promise<RpcPayloadByType["files.getChanges"]> {
    return {
      files: await this.getCommitFileChanges(repositoryRoot, hash),
      mode
    };
  }

  public getFileViewMode(): FileViewMode {
    return this.configuration.get("guigit.fileViewMode");
  }

  public async setFileViewMode(mode: FileViewMode): Promise<void> {
    await this.configuration.update("guigit.fileViewMode", mode);
  }

  private async getCommitInfo(repositoryRoot: string, hash: string): Promise<CommitInfo> {
    const output = await this.gitRaw(repositoryRoot, [
      "show",
      `--format=${commitFormat}`,
      "--no-patch",
      "--encoding=UTF-8",
      hash
    ]);
    const fields = output.split(fieldSeparator);

    return {
      author: fields[3]!,
      body: fields[6]!,
      date: fields[1]!,
      email: fields[4]!,
      hash: fields[0]!,
      message: fields[2]!,
      refs: parseRefs(fields[5]!)
    };
  }

  private async getCommitFileChanges(repositoryRoot: string, hash: string): Promise<readonly FileChangeViewModel[]> {
    const [numstatOutput, nameStatusOutput] = await Promise.all([
      this.gitRaw(repositoryRoot, ["show", "--numstat", "--format=", "--encoding=UTF-8", hash]),
      this.gitRaw(repositoryRoot, ["show", "--name-status", "--format=", "--encoding=UTF-8", hash])
    ]);

    return mergeFileChanges(parseNumstat(numstatOutput), parseNameStatus(nameStatusOutput));
  }

  private async getEditableContext(repositoryRoot: string): Promise<EditableContext | undefined> {
    try {
      const [latestHash, userName, userEmail] = await Promise.all([
        this.gitRaw(repositoryRoot, ["rev-parse", "HEAD"]),
        this.gitRaw(repositoryRoot, ["config", "user.name"]),
        this.gitRaw(repositoryRoot, ["config", "user.email"])
      ]);

      return {
        latestHash: latestHash.trim(),
        userEmail: userEmail.trim(),
        userName: userName.trim()
      };
    } catch {
      return undefined;
    }
  }
}

function parseNumstat(output: string): readonly FileStats[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [insertions, deletions, path] = line.split("\t");

      return {
        binary: insertions === "-" && deletions === "-",
        deletions: deletions === "-" ? 0 : Number.parseInt(deletions!, 10),
        insertions: insertions === "-" ? 0 : Number.parseInt(insertions!, 10),
        path: path!
      };
    });
}

function parseNameStatus(output: string): readonly FileStatus[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const code = parts[0]!;

      if (code.startsWith("R") || code.startsWith("C")) {
        return {
          path: parts[2]!,
          previousPath: parts[1]!,
          status: code.startsWith("R") ? "renamed" : "copied"
        };
      }

      return {
        path: parts[1]!,
        status: statusFromCode(code)
      };
    });
}

function mergeFileChanges(stats: readonly FileStats[], statuses: readonly FileStatus[]): readonly FileChangeViewModel[] {
  const statsByPath = new Map(stats.map((item) => [item.path, item]));

  if (statuses.length === 0) {
    return stats.map((item) => ({
      binary: item.binary,
      deletions: item.deletions,
      insertions: item.insertions,
      path: item.path,
      status: "modified"
    }));
  }

  return statuses.map((item) => {
    const stat = statsByPath.get(item.path) ?? (item.previousPath ? statsByPath.get(item.previousPath) : undefined);

    return {
      binary: stat?.binary ?? false,
      deletions: stat?.deletions ?? 0,
      insertions: stat?.insertions ?? 0,
      path: item.path,
      previousPath: item.previousPath,
      status: item.status
    };
  });
}

function statusFromCode(code: string): FileChangeViewModel["status"] {
  if (code === "A") {
    return "added";
  }

  if (code === "D") {
    return "deleted";
  }

  if (code === "M") {
    return "modified";
  }

  return "unchanged";
}

function parseRefs(refs: string): readonly RefViewModel[] {
  return refs
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean)
    .flatMap((ref) => {
      if (ref.startsWith("HEAD -> ")) {
        return [{ name: "HEAD", type: "head" }, classifyRef(ref.slice("HEAD -> ".length))];
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
