import { relative } from "path";
import type { RepositoryService } from "../git/RepositoryService";
import type { SettingsViewModel } from "../rpc/contract";
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
  hoverMessage: string;
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
  createRange: (startLine: number, startCharacter: number, endLine: number, endCharacter: number) => unknown;
  gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  onDidChangeActiveTextEditor?: (listener: (editor: TextEditorLike | undefined) => void) => DisposableLike;
  onDidChangeConfiguration?: (listener: (event: { affectsConfiguration(section: string): boolean }) => void) => DisposableLike;
  onDidChangeTextDocument?: (listener: (event: { document: TextEditorLike["document"] }) => void) => DisposableLike;
  onDidChangeTextEditorSelection?: (listener: (event: { textEditor: TextEditorLike }) => void) => DisposableLike;
  repositoryService: Pick<RepositoryService, "discoverRepositories">;
  settingsService: Pick<SettingsService, "getSettings">;
  updateBlameEnabled: (enabled: boolean) => Promise<void>;
}

export class BlameController {
  private readonly activeEditor: () => TextEditorLike | undefined;
  private readonly createRange: BlameControllerInput["createRange"];
  private readonly decorationType: unknown;
  private readonly disposables: DisposableLike[];
  private readonly gitRaw: BlameControllerInput["gitRaw"];
  private readonly repositoryService: Pick<RepositoryService, "discoverRepositories">;
  private readonly settingsService: Pick<SettingsService, "getSettings">;
  private readonly updateBlameEnabled: (enabled: boolean) => Promise<void>;

  public constructor(input: BlameControllerInput) {
    this.activeEditor = input.activeEditor;
    this.createRange = input.createRange;
    this.decorationType = input.createDecorationType();
    this.gitRaw = input.gitRaw;
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
    const targetLines = settings.blameShowOnlyCurrentLine
      ? lines.filter((line) => line.line === editor.selection.active.line + 1)
      : lines;

    editor.setDecorations(
      this.decorationType,
      targetLines.filter((line) => !line.hash.startsWith("0000000")).map((line) => this.createDecoration(editor, line, settings))
    );
  }

  public dispose(): void {
    this.clearDecorations();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    (this.decorationType as DecorationTypeLike).dispose?.();
  }

  private createDecoration(editor: TextEditorLike, line: BlameLine, settings: SettingsViewModel): BlameDecoration {
    const lineIndex = line.line - 1;
    const endCharacter = editor.document.lineAt(lineIndex).range.end.character;
    return {
      hoverMessage: createHover(line),
      range: this.createRange(lineIndex, endCharacter, lineIndex, endCharacter),
      renderOptions: {
        after: {
          color: "editorCodeLens.foreground",
          contentText: `  ${formatBlame(settings.blameFormat, line)}`,
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

function formatBlame(format: string, line: BlameLine): string {
  return format
    .replaceAll("${author}", line.author)
    .replaceAll("${time}", line.date)
    .replaceAll("${summary}", line.summary)
    .replaceAll("${hash}", line.hash.slice(0, 7));
}

function createHover(line: BlameLine): string {
  const commandUri = `command:guigit.showCommitDetails?${encodeURIComponent(JSON.stringify([line.hash]))}`;
  return [
    `**Commit:** ${line.summary}`,
    `**Author:** ${line.author} <${line.email}>`,
    `**Date:** ${line.date}`,
    `**Hash:** \`${line.hash}\``,
    `[View Commit Details](${commandUri})`
  ].join("\n\n");
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
