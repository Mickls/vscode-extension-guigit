import { commands, ViewColumn } from "vscode";
import { readFile as nodeReadFile } from "node:fs/promises";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { OperationResultViewModel, WorkingTreeDiffKind } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";
import { VirtualDocumentService } from "./VirtualDocumentService";

export interface DiffVirtualDocuments<TUri> {
  createDocument(content: string, fileName: string): TUri;
}

export interface DiffServiceInput<TUri> {
  executeCommand?: (command: string, ...args: readonly unknown[]) => Thenable<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug">;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  virtualDocuments?: DiffVirtualDocuments<TUri>;
}

export class DiffService<TUri extends { toString(): string } = { toString(): string }> {
  private readonly executeCommand: (command: string, ...args: readonly unknown[]) => Thenable<void>;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug"> | undefined;
  private readonly readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  private readonly virtualDocuments: DiffVirtualDocuments<TUri>;

  public constructor(input: DiffServiceInput<TUri> = {}) {
    this.executeCommand =
      input.executeCommand ??
      (async (command, ...args) => {
        await commands.executeCommand(command, ...args);
    });
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.readFile = input.readFile ?? nodeReadFile;
    this.virtualDocuments = input.virtualDocuments ?? new VirtualDocumentService<TUri>();
  }

  public async openCommitFileDiff(
    repositoryRoot: string,
    hash: string,
    filePath: string
  ): Promise<OperationResultViewModel> {
    this.logger?.debug("diff.commitFile.open", {
      filePath,
      hash,
      repositoryRoot
    });
    const parent = await this.getFirstParent(repositoryRoot, hash);
    const [oldContent, newContent] = await Promise.all([
      parent ? this.getFileContent(repositoryRoot, parent, filePath) : Promise.resolve(null),
      this.getFileContent(repositoryRoot, hash, filePath)
    ]);
    const shortHash = hash.slice(0, 8);
    const title = parent
      ? `${baseFileName(filePath)} (${shortHash})`
      : `${baseFileName(filePath)} (${shortHash}) - Initial Commit`;

    await this.openContentDiff({
      filePath,
      leftContent: oldContent,
      rightContent: newContent,
      title
    });
    this.logger?.debug("diff.commitFile.opened", {
      filePath,
      hash,
      parent,
      repositoryRoot
    });

    return {
      message: `Opened diff for ${filePath}`,
      status: "ok"
    };
  }

  public async openCompareFileDiff(
    repositoryRoot: string,
    fromHash: string,
    toHash: string,
    filePath: string
  ): Promise<OperationResultViewModel> {
    this.logger?.debug("diff.compareFile.open", {
      filePath,
      fromHash,
      repositoryRoot,
      toHash
    });
    const [fromContent, toContent] = await Promise.all([
      this.getFileContent(repositoryRoot, fromHash, filePath),
      this.getFileContent(repositoryRoot, toHash, filePath)
    ]);
    const shortFromHash = fromHash.slice(0, 8);
    const shortToHash = toHash.slice(0, 8);

    if (fromContent === toContent) {
      const message = `No changes in ${filePath} between these commits`;
      this.logger?.debug("diff.compareFile.unchanged", {
        filePath,
        fromHash,
        repositoryRoot,
        toHash
      });
      return {
        message,
        status: "ok"
      };
    }

    await this.openContentDiff({
      filePath,
      leftContent: fromContent,
      rightContent: toContent,
      title: compareTitle(filePath, shortFromHash, shortToHash, fromContent, toContent)
    });
    this.logger?.debug("diff.compareFile.opened", {
      filePath,
      fromHash,
      repositoryRoot,
      toHash
    });

    return {
      message: `Opened diff for ${filePath}`,
      status: "ok"
    };
  }

  public async openWorkingTreeFileDiff(
    repositoryRoot: string,
    filePath: string,
    kind: WorkingTreeDiffKind,
    previousPath?: string
  ): Promise<OperationResultViewModel> {
    this.logger?.debug("diff.workingTreeFile.open", {
      filePath,
      kind,
      repositoryRoot
    });
    const [leftContent, rightContent] = await Promise.all([
      kind === "staged" ? this.getFileContent(repositoryRoot, "HEAD", previousPath ?? filePath) : this.getIndexFileContent(repositoryRoot, previousPath ?? filePath),
      kind === "staged" ? this.getIndexFileContent(repositoryRoot, filePath) : this.getWorkingTreeFileContent(repositoryRoot, filePath)
    ]);

    await this.openContentDiff({
      filePath,
      leftContent,
      rightContent,
      title: `${baseFileName(filePath)} (${kind})`
    });
    this.logger?.debug("diff.workingTreeFile.opened", {
      filePath,
      kind,
      repositoryRoot
    });

    return {
      message: `Opened diff for ${filePath}`,
      status: "ok"
    };
  }

  public async openStashFileDiff(
    repositoryRoot: string,
    stashRef: string,
    filePath: string,
    previousPath?: string
  ): Promise<OperationResultViewModel> {
    this.logger?.debug("diff.stashFile.open", {
      filePath,
      previousPath,
      repositoryRoot,
      stashRef
    });
    const [leftContent, rightContent] = await Promise.all([
      this.getFileContent(repositoryRoot, `${stashRef}^1`, previousPath ?? filePath),
      this.getFileContent(repositoryRoot, stashRef, filePath)
    ]);

    await this.openContentDiff({
      filePath,
      leftContent,
      rightContent,
      title: `${baseFileName(filePath)} (${stashRef})`
    });
    this.logger?.debug("diff.stashFile.opened", {
      filePath,
      previousPath,
      repositoryRoot,
      stashRef
    });

    return {
      message: `Opened diff for ${filePath}`,
      status: "ok"
    };
  }

  private async getFirstParent(repositoryRoot: string, hash: string): Promise<string | undefined> {
    const output = await this.gitRaw(repositoryRoot, ["show", "--no-patch", "--pretty=%P", hash]);
    return output.trim().split(" ")[0] || undefined;
  }

  private async getFileContent(repositoryRoot: string, ref: string, filePath: string): Promise<string | null> {
    try {
      return await this.gitRaw(repositoryRoot, ["show", `${ref}:${filePath}`]);
    } catch {
      return null;
    }
  }

  private async getIndexFileContent(repositoryRoot: string, filePath: string): Promise<string | null> {
    try {
      return await this.gitRaw(repositoryRoot, ["show", `:${filePath}`]);
    } catch {
      return null;
    }
  }

  private async getWorkingTreeFileContent(repositoryRoot: string, filePath: string): Promise<string | null> {
    try {
      return await this.readFile(join(repositoryRoot, filePath), "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async openContentDiff(input: {
    filePath: string;
    leftContent: string | null;
    rightContent: string | null;
    title: string;
  }): Promise<void> {
    const leftUri = this.virtualDocuments.createDocument(input.leftContent ?? "", input.filePath);
    const rightUri = this.virtualDocuments.createDocument(input.rightContent ?? "", input.filePath);

    await this.executeCommand("vscode.diff", leftUri, rightUri, input.title, {
      preview: true,
      viewColumn: ViewColumn.One
    });
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function baseFileName(filePath: string): string {
  return filePath.split("/").at(-1) ?? "file";
}

function compareTitle(
  filePath: string,
  fromHash: string,
  toHash: string,
  fromContent: string | null,
  toContent: string | null
): string {
  const baseTitle = `${baseFileName(filePath)} (${fromHash}..${toHash})`;
  if (fromContent === null) {
    return `${baseTitle} - New File`;
  }

  if (toContent === null) {
    return `${baseTitle} - Deleted File`;
  }

  return baseTitle;
}
