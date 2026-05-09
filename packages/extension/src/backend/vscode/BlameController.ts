import { createHash } from "crypto";
import { relative } from "path";
import type { RepositoryService } from "../git/RepositoryService";
import type { SettingsService } from "../../state/SettingsService";

interface DisposableLike {
  dispose(): void;
}

interface DecorationTypeLike {
  dispose?: () => void;
}

interface TextEditorLike {
  document: {
    lineAt(line: number): { range: { end: { character: number } } };
    uri: {
      fsPath: string;
      scheme: string;
    };
  };
  selection: {
    active: {
      line: number;
    };
  };
  setDecorations(decorationType: unknown, decorations: readonly BlameDecoration[]): void;
}

interface BlameDecoration {
  hoverMessage: unknown;
  range: unknown;
  renderOptions: {
    after: {
      color: string;
      contentText: string;
      fontStyle: "italic";
    };
  };
}

interface BlameLine {
  author: string;
  date: string;
  email: string;
  hash: string;
  line: number;
  summary: string;
}

export interface BlameControllerInput {
  activeEditor: () => TextEditorLike | undefined;
  createDecorationType: () => unknown;
  createMarkdownString: (value: string) => MarkdownStringLike;
  createRange: (startLine: number, startCharacter: number, endLine: number, endCharacter: number) => unknown;
  gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  now?: () => Date;
  onDidChangeActiveTextEditor?: (listener: (editor: TextEditorLike | undefined) => void) => DisposableLike;
  onDidChangeConfiguration?: (listener: (event: { affectsConfiguration(section: string): boolean }) => void) => DisposableLike;
  onDidChangeTextDocument?: (listener: (event: { document: TextEditorLike["document"] }) => void) => DisposableLike;
  onDidChangeTextEditorSelection?: (listener: (event: { textEditor: TextEditorLike }) => void) => DisposableLike;
  repositoryService: Pick<RepositoryService, "discoverRepositories">;
  settingsService: Pick<SettingsService, "getSettings">;
  updateBlameEnabled: (enabled: boolean) => Promise<void>;
}

interface MarkdownStringLike {
  isTrusted?: boolean | { readonly enabledCommands: readonly string[] };
}

export class BlameController {
  private readonly activeEditor: () => TextEditorLike | undefined;
  private readonly createMarkdownString: BlameControllerInput["createMarkdownString"];
  private readonly createRange: BlameControllerInput["createRange"];
  private readonly decorationType: unknown;
  private readonly disposables: DisposableLike[];
  private readonly gitRaw: BlameControllerInput["gitRaw"];
  private readonly now: () => Date;
  private readonly repositoryService: Pick<RepositoryService, "discoverRepositories">;
  private readonly settingsService: Pick<SettingsService, "getSettings">;
  private readonly updateBlameEnabled: (enabled: boolean) => Promise<void>;

  public constructor(input: BlameControllerInput) {
    this.activeEditor = input.activeEditor;
    this.createMarkdownString = input.createMarkdownString;
    this.createRange = input.createRange;
    this.decorationType = input.createDecorationType();
    this.gitRaw = input.gitRaw;
    this.now = input.now ?? (() => new Date());
    this.repositoryService = input.repositoryService;
    this.settingsService = input.settingsService;
    this.updateBlameEnabled = input.updateBlameEnabled;
    this.disposables = [
      input.onDidChangeTextEditorSelection?.((event) => void this.refreshEditor(event.textEditor)),
      input.onDidChangeActiveTextEditor?.((editor) => {
        if (editor) {
          void this.refreshEditor(editor);
        } else {
          this.clearDecorations();
        }
      }),
      input.onDidChangeTextDocument?.((event) => {
        const editor = this.activeEditor();
        if (editor?.document === event.document) {
          void this.refreshEditor(editor);
        }
      }),
      input.onDidChangeConfiguration?.((event) => {
        if (event.affectsConfiguration("guigit.blame")) {
          void this.refreshEditor(this.activeEditor());
        }
      })
    ].filter((item): item is DisposableLike => Boolean(item));
  }

  public async toggleBlame(): Promise<void> {
    const settings = this.settingsService.getSettings();
    const nextEnabled = !settings.blameEnabled;
    await this.updateBlameEnabled(nextEnabled);
    await this.refreshEditor(this.activeEditor(), {
      ...settings,
      blameEnabled: nextEnabled
    });
  }

  public async refreshEditor(editor = this.activeEditor(), settings = this.settingsService.getSettings()): Promise<void> {
    if (!editor || !settings.blameEnabled || editor.document.uri.scheme !== "file") {
      this.clearDecorations(editor);
      return;
    }

    const repository = await this.findRepository(editor.document.uri.fsPath);
    const relativePath = relative(repository.rootPath, editor.document.uri.fsPath);
    const blameOutput = await this.gitRaw(repository.rootPath, ["blame", "--line-porcelain", "--", relativePath]);
    const lines = parseBlameOutput(blameOutput);
    const targetLines = lines.filter((line) => line.line === editor.selection.active.line + 1);

    editor.setDecorations(
      this.decorationType,
      targetLines.filter((line) => !line.hash.startsWith("0000000")).map((line) => this.createDecoration(editor, line))
    );
  }

  public dispose(): void {
    this.clearDecorations();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    (this.decorationType as DecorationTypeLike).dispose?.();
  }

  private createDecoration(editor: TextEditorLike, line: BlameLine): BlameDecoration {
    const lineIndex = line.line - 1;
    const endCharacter = editor.document.lineAt(lineIndex).range.end.character;
    return {
      hoverMessage: createHover(line, this.createMarkdownString),
      range: this.createRange(lineIndex, endCharacter, lineIndex, endCharacter),
      renderOptions: {
        after: {
          color: "rgba(127, 127, 127, 0.72)",
          contentText: `  ${createInlineBlameText(line, this.now())}`,
          fontStyle: "italic"
        }
      }
    };
  }

  private clearDecorations(editor = this.activeEditor()): void {
    editor?.setDecorations(this.decorationType, []);
  }

  private async findRepository(filePath: string): Promise<{ rootPath: string }> {
    const repositories = await this.repositoryService.discoverRepositories();
    return repositories.find((repository) => filePath.startsWith(repository.rootPath))!;
  }
}

function parseBlameOutput(output: string): readonly BlameLine[] {
  const lines: BlameLine[] = [];
  let current: Partial<BlameLine> = {};

  for (const line of output.split("\n")) {
    if (/^[a-f0-9]{7,40}/.test(line)) {
      const [hash, , finalLine] = line.split(" ");
      current = {
        hash: hash!,
        line: Number.parseInt(finalLine!, 10)
      };
    } else if (line.startsWith("author ")) {
      current.author = line.slice("author ".length);
    } else if (line.startsWith("author-mail ")) {
      current.email = line.slice("author-mail ".length).replace(/[<>]/g, "");
    } else if (line.startsWith("author-time ")) {
      current.date = line.slice("author-time ".length);
    } else if (line.startsWith("author-tz ")) {
      current.date = formatAuthorDate(Number.parseInt(current.date!, 10), line.slice("author-tz ".length));
    } else if (line.startsWith("summary ")) {
      current.summary = line.slice("summary ".length);
    } else if (line.startsWith("\t")) {
      lines.push(current as BlameLine);
    }
  }

  return lines;
}

function createInlineBlameText(line: BlameLine, now: Date): string {
  return truncateText(`${line.author} ${formatRelativeDate(line.date, now)}: ${line.summary}`, 86);
}

function createHover(line: BlameLine, createMarkdownString: BlameControllerInput["createMarkdownString"]): MarkdownStringLike {
  const showCommitUri = createCommandUri("guigit.showCommitDetails", line.hash);
  const copyHashUri = createCommandUri("guigit.copyCommitHash", line.hash);
  const markdown = createMarkdownString([
    `![Author avatar](${createAvatarUri(line.email)})`,
    `**Author:** ${line.author} <${line.email}>`,
    `**Commit:** ${line.summary}`,
    `**Date:** ${line.date}`,
    `**Hash:** \`${line.hash}\``,
    `[Open Commit](${showCommitUri}) | [Copy Hash](${copyHashUri})`
  ].join("\n\n"));
  markdown.isTrusted = {
    enabledCommands: ["guigit.showCommitDetails", "guigit.copyCommitHash"]
  };
  return markdown;
}

function createCommandUri(command: string, hash: string): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify([hash]))}`;
}

function createAvatarUri(email: string): string {
  const digest = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  return `https://www.gravatar.com/avatar/${digest}?s=48&d=identicon`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function formatAuthorDate(timestamp: number, timezone: string): string {
  const offsetSign = timezone.startsWith("-") ? -1 : 1;
  const offsetHours = Number.parseInt(timezone.slice(1, 3), 10);
  const offsetMinutes = Number.parseInt(timezone.slice(3, 5), 10);
  const localTimestamp = timestamp + offsetSign * ((offsetHours * 60) + offsetMinutes) * 60;
  const date = new Date(localTimestamp * 1000);
  const value = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return `${value} ${timezone}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatRelativeDate(value: string, now: Date): string {
  const date = parseBlameDate(value);
  const diffMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (diffMinutes < 1) {
    return "一分钟内";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffDays = Math.max(1, Math.floor(diffMinutes / 1440));
  if (diffDays < 30) {
    return `${diffDays} 天前`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseBlameDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{2})(\d{2})$/.exec(value);
  const isoValue = match
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7]}:${match[8]}`
    : value;
  return new Date(isoValue);
}
