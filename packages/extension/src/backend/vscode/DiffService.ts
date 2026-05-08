import { commands, ViewColumn, window } from "vscode";
import { simpleGit } from "simple-git";
import type { OperationResultViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";
import { VirtualDocumentService } from "./VirtualDocumentService";

export interface DiffVirtualDocuments<TUri> {
  createDocument(content: string, fileName: string): TUri;
}

export interface DiffServiceInput<TUri> {
  executeCommand?: (command: string, ...args: readonly unknown[]) => Thenable<void>;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug">;
  showInformationMessage?: (message: string) => Thenable<void>;
  virtualDocuments?: DiffVirtualDocuments<TUri>;
}

export class DiffService<TUri extends { toString(): string } = { toString(): string }> {
  private readonly executeCommand: (command: string, ...args: readonly unknown[]) => Thenable<void>;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug"> | undefined;
  private readonly showInformationMessage: (message: string) => Thenable<void>;
  private readonly virtualDocuments: DiffVirtualDocuments<TUri>;

  public constructor(input: DiffServiceInput<TUri> = {}) {
    this.executeCommand =
      input.executeCommand ??
      (async (command, ...args) => {
        await commands.executeCommand(command, ...args);
      });
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.showInformationMessage =
      input.showInformationMessage ??
      (async (message) => {
        await window.showInformationMessage(message);
      });
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
      leftContent: oldContent,
      leftLabel: parent ? `${baseFileName(filePath)} (${shortHash}^)` : `${baseFileName(filePath)} (empty)`,
      rightContent: newContent,
      rightLabel: `${baseFileName(filePath)} (${shortHash})`,
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
      await this.showInformationMessage(message);
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
      leftContent: fromContent,
      leftLabel: fromContent === null ? `${baseFileName(filePath)} (empty)` : `${baseFileName(filePath)} (${shortFromHash})`,
      rightContent: toContent,
      rightLabel: toContent === null ? `${baseFileName(filePath)} (deleted)` : `${baseFileName(filePath)} (${shortToHash})`,
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

  private async openContentDiff(input: {
    leftContent: string | null;
    leftLabel: string;
    rightContent: string | null;
    rightLabel: string;
    title: string;
  }): Promise<void> {
    const leftUri = this.virtualDocuments.createDocument(input.leftContent ?? "", input.leftLabel);
    const rightUri = this.virtualDocuments.createDocument(input.rightContent ?? "", input.rightLabel);

    await this.executeCommand("vscode.diff", leftUri, rightUri, input.title, {
      preview: true,
      viewColumn: ViewColumn.One
    });
  }
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
