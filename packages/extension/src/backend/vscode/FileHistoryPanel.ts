import { existsSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { simpleGit } from "simple-git";
import { commands, extensions as vscodeExtensions, languages, Uri, ViewColumn, window, workspace } from "vscode";
import type { RepositoryService } from "../git/RepositoryService";
import type { OperationResultViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";
import { VirtualDocumentService } from "./VirtualDocumentService";

interface UriLike {
  fsPath: string;
}

type TextDocumentLike<TUri> = {
  uri: TUri;
};

interface WebviewPanelLike {
  webview: {
    html: string;
    onDidReceiveMessage(callback: (message: unknown) => void): { dispose(): void };
  };
}

type CreateWebviewPanel = (viewType: string, title: string, showOptions: ViewColumn, options: { enableScripts: boolean }) => WebviewPanelLike;

export interface FileHistoryPanelInput<TUri extends UriLike> {
  activeEditorUri?: () => TUri | undefined;
  createWebviewPanel?: CreateWebviewPanel;
  executeCommand?: (command: string, ...args: readonly unknown[]) => Thenable<unknown>;
  fileExists?: (path: string) => boolean;
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  languageIdForPath?: (filePath: string) => string | undefined;
  logger?: Pick<Logger, "debug">;
  openTextDocument?: (uri: TUri) => Thenable<TextDocumentLike<TUri>>;
  repositoryService: Pick<RepositoryService, "discoverRepositories">;
  setTextDocumentLanguage?: (
    document: TextDocumentLike<TUri>,
    languageId: string
  ) => Thenable<TextDocumentLike<TUri>>;
  showTextDocument?: (
    document: TextDocumentLike<TUri>,
    options: { preview: boolean; viewColumn: ViewColumn }
  ) => Thenable<unknown>;
  uriFile?: (path: string) => TUri;
  virtualDocuments?: {
    createDocument(content: string, fileName: string): TUri;
  };
}

interface FileHistoryCommit {
  author: string;
  date: string;
  hash: string;
  message: string;
  shortHash: string;
}

export class FileHistoryPanel<TUri extends UriLike = Uri> {
  private readonly activeEditorUri: () => TUri | undefined;
  private readonly createWebviewPanel: CreateWebviewPanel;
  private readonly executeCommand: (command: string, ...args: readonly unknown[]) => Thenable<unknown>;
  private readonly fileExists: (path: string) => boolean;
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly languageIdForPath: (filePath: string) => string | undefined;
  private readonly logger: Pick<Logger, "debug"> | undefined;
  private readonly openTextDocument: (uri: TUri) => Thenable<TextDocumentLike<TUri>>;
  private readonly repositoryService: Pick<RepositoryService, "discoverRepositories">;
  private readonly setTextDocumentLanguage: (
    document: TextDocumentLike<TUri>,
    languageId: string
  ) => Thenable<TextDocumentLike<TUri>>;
  private readonly showTextDocument: (
    document: TextDocumentLike<TUri>,
    options: { preview: boolean; viewColumn: ViewColumn }
  ) => Thenable<unknown>;
  private readonly uriFile: (path: string) => TUri;
  private readonly virtualDocuments: {
    createDocument(content: string, fileName: string): TUri;
  };

  public constructor(input: FileHistoryPanelInput<TUri>) {
    this.activeEditorUri =
      input.activeEditorUri ??
      (() => window.activeTextEditor?.document.uri as TUri | undefined);
    this.createWebviewPanel =
      input.createWebviewPanel ??
      ((viewType, title, showOptions, options) => window.createWebviewPanel(viewType, title, showOptions, options));
    this.executeCommand =
      input.executeCommand ??
      (async (command, ...args) => {
        await commands.executeCommand(command, ...args);
      });
    this.fileExists = input.fileExists ?? existsSync;
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.languageIdForPath = input.languageIdForPath ?? languageIdForPath;
    this.logger = input.logger;
    this.openTextDocument =
      input.openTextDocument ??
      ((uri) => workspace.openTextDocument(uri as unknown as Uri) as unknown as Thenable<TextDocumentLike<TUri>>);
    this.repositoryService = input.repositoryService;
    this.setTextDocumentLanguage =
      input.setTextDocumentLanguage ??
      ((document, languageId) =>
        languages.setTextDocumentLanguage(document as unknown as Parameters<typeof languages.setTextDocumentLanguage>[0], languageId) as unknown as Thenable<TextDocumentLike<TUri>>);
    this.showTextDocument =
      input.showTextDocument ??
      (async (document, options) => {
        await window.showTextDocument(document as unknown as Parameters<typeof window.showTextDocument>[0], options);
      });
    this.uriFile = input.uriFile ?? ((path) => Uri.file(path) as unknown as TUri);
    this.virtualDocuments = input.virtualDocuments ?? new VirtualDocumentService<TUri>();
  }

  public async openWorkingFile(
    repositoryRoot: string,
    filePath: string,
    hash?: string
  ): Promise<OperationResultViewModel> {
    this.logger?.debug("file.openWorkingFile", { filePath, repositoryRoot });
    const workingFilePath = resolve(repositoryRoot, filePath);
    if (hash === undefined && !this.fileExists(workingFilePath)) {
      return {
        message: `Cannot open missing file ${filePath} without a commit snapshot`,
        status: "cancelled"
      };
    }

    if (hash !== undefined && !this.fileExists(workingFilePath)) {
      const uri = this.virtualDocuments.createDocument(
        await this.getCommitFileContent(repositoryRoot, hash, filePath),
        fileSnapshotName(filePath, hash)
      );
      const document = await this.openTextDocument(uri);
      const languageId = this.languageIdForPath(filePath);
      const displayedDocument = languageId ? await this.setTextDocumentLanguage(document, languageId) : document;
      await this.showTextDocument(displayedDocument, {
        preview: false,
        viewColumn: ViewColumn.One
      });

      return {
        message: `Opened ${filePath}`,
        status: "ok"
      };
    }

    await this.executeCommand("vscode.open", this.uriFile(workingFilePath), {
      preview: false,
      viewColumn: ViewColumn.One
    });

    return {
      message: `Opened ${filePath}`,
      status: "ok"
    };
  }

  public async openHistory(repositoryRoot: string, filePath: string): Promise<OperationResultViewModel> {
    this.logger?.debug("fileHistory.open", { filePath, repositoryRoot });
    const commits = parseFileHistoryLog(
      await this.gitRaw(repositoryRoot, [
        "log",
        "--follow",
        "--date=iso",
        "--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s",
        "--",
        filePath
      ])
    );
    const panel = this.createWebviewPanel("guigit.fileHistory", `File History: ${filePath}`, ViewColumn.Two, {
      enableScripts: true
    });
    panel.webview.html = renderFileHistoryHtml(filePath, commits);
    panel.webview.onDidReceiveMessage((message) => {
      if (isRevealCommitMessage(message)) {
        void this.executeCommand("guigit.showCommitDetails", message.hash);
      }
    });

    return {
      message: `Opened history for ${filePath}`,
      status: "ok"
    };
  }

  public async openHistoryForUri(resource?: TUri): Promise<OperationResultViewModel> {
    const uri = resource ?? this.activeEditorUri();
    if (!uri) {
      return {
        message: "No file selected",
        status: "cancelled"
      };
    }

    const repositories = await this.repositoryService.discoverRepositories();
    const repository = repositories
      .filter((candidate) => isPathInside(uri.fsPath, candidate.rootPath))
      .sort((a, b) => b.rootPath.length - a.rootPath.length)[0];
    if (!repository) {
      return {
        message: "Selected file is not inside a discovered repository",
        status: "cancelled"
      };
    }

    return this.openHistory(repository.rootPath, toGitPath(relative(repository.rootPath, uri.fsPath)));
  }

  private async getCommitFileContent(repositoryRoot: string, hash: string, filePath: string): Promise<string> {
    try {
      return await this.gitRaw(repositoryRoot, ["show", `${hash}:${filePath}`]);
    } catch {
      const parent = await this.getFirstParent(repositoryRoot, hash);
      return this.gitRaw(repositoryRoot, ["show", `${parent}:${filePath}`]);
    }
  }

  private async getFirstParent(repositoryRoot: string, hash: string): Promise<string> {
    const output = await this.gitRaw(repositoryRoot, ["show", "--no-patch", "--pretty=%P", hash]);
    return output.trim().split(" ")[0]!;
  }
}

function parseFileHistoryLog(output: string): readonly FileHistoryCommit[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, date, message] = line.split("\u001f");
      return {
        author: author!,
        date: date!,
        hash: hash!,
        message: message!,
        shortHash: shortHash!
      };
    });
}

function renderFileHistoryHtml(filePath: string, commits: readonly FileHistoryCommit[]): string {
  const rows = commits
    .map(
      (commit) => `<button data-hash="${escapeAttribute(commit.hash)}" type="button">
  <span class="hash">${escapeHtml(commit.shortHash)}</span>
  <span class="message">${escapeHtml(commit.message)}</span>
  <span class="meta">${escapeHtml(commit.author)} - ${escapeHtml(commit.date)}</span>
</button>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); margin: 0; padding: 12px; }
    h1 { font-size: 13px; margin: 0 0 10px; }
    button { align-items: center; background: transparent; border: 0; border-bottom: 1px solid var(--vscode-panel-border); color: inherit; cursor: pointer; display: grid; gap: 8px; grid-template-columns: 76px 1fr 220px; padding: 7px 4px; text-align: left; width: 100%; }
    button:hover { background: var(--vscode-list-hoverBackground); }
    .hash { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 11px; }
    .message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <h1>File History: ${escapeHtml(filePath)}</h1>
  <main>${rows || `<p class="meta">No history found.</p>`}</main>
  <script>
    const vscode = acquireVsCodeApi();
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-hash]");
      if (button) {
        vscode.postMessage({ type: "revealCommit", hash: button.dataset.hash });
      }
    });
  </script>
</body>
</html>`;
}

function isRevealCommitMessage(message: unknown): message is { hash: string; type: "revealCommit" } {
  return (message as { type?: string }).type === "revealCommit";
}

function isPathInside(targetPath: string, rootPath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function toGitPath(filePath: string): string {
  return filePath.split("\\").join("/");
}

function fileSnapshotName(filePath: string, hash: string): string {
  return `${filePath} (${hash.slice(0, 7)})`;
}

function languageIdForPath(filePath: string): string | undefined {
  const normalizedPath = filePath.toLowerCase();
  const fileName = basename(normalizedPath);
  let match: { id: string; length: number } | undefined;

  for (const extension of vscodeExtensions.all) {
    const languagesContribution = (extension.packageJSON as ExtensionPackageJson).contributes?.languages ?? [];
    for (const language of languagesContribution) {
      for (const extensionPattern of language.extensions ?? []) {
        const normalizedExtension = extensionPattern.toLowerCase();
        if (normalizedPath.endsWith(normalizedExtension) && normalizedExtension.length > (match?.length ?? 0)) {
          match = { id: language.id, length: normalizedExtension.length };
        }
      }

      for (const filenamePattern of language.filenames ?? []) {
        const normalizedFilename = filenamePattern.toLowerCase();
        if (fileName === normalizedFilename && normalizedFilename.length > (match?.length ?? 0)) {
          match = { id: language.id, length: normalizedFilename.length };
        }
      }
    }
  }

  return match?.id;
}

interface ExtensionPackageJson {
  contributes?: {
    languages?: readonly {
      extensions?: readonly string[];
      filenames?: readonly string[];
      id: string;
    }[];
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
