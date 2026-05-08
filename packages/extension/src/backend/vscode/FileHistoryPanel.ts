import { isAbsolute, relative, resolve } from "node:path";
import { simpleGit } from "simple-git";
import { commands, Uri, ViewColumn, window } from "vscode";
import type { RepositoryService } from "../git/RepositoryService";
import type { OperationResultViewModel } from "../rpc/contract";
import type { Logger } from "../../logging/LoggerService";

interface UriLike {
  fsPath: string;
}

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
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  logger?: Pick<Logger, "debug">;
  repositoryService: Pick<RepositoryService, "discoverRepositories">;
  uriFile?: (path: string) => TUri;
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
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly logger: Pick<Logger, "debug"> | undefined;
  private readonly repositoryService: Pick<RepositoryService, "discoverRepositories">;
  private readonly uriFile: (path: string) => TUri;

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
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.logger = input.logger;
    this.repositoryService = input.repositoryService;
    this.uriFile = input.uriFile ?? ((path) => Uri.file(path) as unknown as TUri);
  }

  public async openWorkingFile(repositoryRoot: string, filePath: string): Promise<OperationResultViewModel> {
    this.logger?.debug("file.openWorkingFile", { filePath, repositoryRoot });
    await this.executeCommand("vscode.open", this.uriFile(resolve(repositoryRoot, filePath)), {
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
