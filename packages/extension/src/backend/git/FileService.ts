import { simpleGit } from "simple-git";
import type {
  CommitDetailsViewModel,
  FileChangeViewModel,
  FileViewMode,
  RefViewModel,
  RpcPayloadByType
} from "../rpc/contract";
import type { CacheService } from "../../state/CacheService";
import type { Logger } from "../../logging/LoggerService";
import { parseGitFileChanges } from "./FileChangeParser";

const fieldSeparator = "\x1f";
const commitFormat = `%H${fieldSeparator}%ai${fieldSeparator}%s${fieldSeparator}%an${fieldSeparator}%ae${fieldSeparator}%D${fieldSeparator}%b`;

export interface FileServiceConfiguration {
  get: (key: "fileViewMode") => FileViewMode;
  update: (key: "fileViewMode", value: FileViewMode) => Promise<void>;
}

export interface FileServiceInput {
  cache: CacheService;
  configuration: FileServiceConfiguration;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug">;
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

interface EditableContext {
  latestHash: string;
  userEmail: string;
  userName: string;
}

export class FileService {
  private readonly cache: CacheService;
  private readonly configuration: FileServiceConfiguration;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug"> | undefined;

  public constructor(input: FileServiceInput) {
    this.cache = input.cache;
    this.configuration = input.configuration;
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
  }

  public async getCommitDetails(repositoryRoot: string, hash: string): Promise<CommitDetailsViewModel> {
    this.logger?.debug("git.commitDetails.load", {
      hash,
      repositoryRoot
    });

    const cached = this.cache.getCommitDetails(repositoryRoot, hash);
    if (cached) {
      this.logger?.debug("git.commitDetails.loaded", {
        fileCount: cached.files.length,
        hash: cached.hash,
        repositoryRoot
      });
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
    this.logger?.debug("git.commitDetails.loaded", {
      fileCount: details.files.length,
      hash: details.hash,
      repositoryRoot
    });
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
    return this.configuration.get("fileViewMode");
  }

  public async setFileViewMode(mode: FileViewMode): Promise<void> {
    await this.configuration.update("fileViewMode", mode);
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

    return parseGitFileChanges(numstatOutput, nameStatusOutput);
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
