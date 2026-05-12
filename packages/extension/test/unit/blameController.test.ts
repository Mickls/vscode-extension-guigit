import { describe, expect, it, vi } from "vitest";
import { BlameController } from "../../src/backend/vscode/BlameController";
import type { SettingsViewModel } from "../../src/backend/rpc/contract";

describe("BlameController", () => {
  it("shows relative commit time after the author in inline blame", async () => {
    const editor = createEditor(0);
    const controller = createController({
      editor,
      now: () => new Date("2026-05-07T10:05:00+08:00"),
      settings: createSettings({})
    });

    await controller.refreshEditor(editor);

    expect(editor.setDecorations).toHaveBeenCalledWith("decoration", [
      expect.objectContaining({
        renderOptions: expect.objectContaining({
          after: expect.objectContaining({ contentText: "  Ada 5 分钟前: Wire data" })
        })
      })
    ]);
  });

  it("decorates only the active line with subdued truncated author and summary text", async () => {
    const editor = createEditor(1);
    const hoverMessages: unknown[] = [];
    const controller = createController({
      createMarkdownString: (value) => {
        const markdown = { isTrusted: false, value };
        hoverMessages.push(markdown);
        return markdown;
      },
      editor,
      now: () => new Date("2026-05-09T10:05:00+08:00"),
      settings: createSettings({
        blameFormat: "${author}, ${time}: ${summary}",
        blameShowOnlyCurrentLine: false
      })
    });

    await controller.refreshEditor(editor);

    expect(editor.setDecorations).toHaveBeenCalledWith("decoration", [
      expect.objectContaining({
        hoverMessage: hoverMessages[0],
        range: { endCharacter: 13, line: 1, startCharacter: 13 },
        renderOptions: {
          after: {
            contentText: "  Grace 2 天前: Add graph with an intentionally long commit summary that should be trim...",
            color: "rgba(127, 127, 127, 0.72)",
            fontStyle: "italic"
          }
        }
      })
    ]);
    expect(hoverMessages).toEqual([
      expect.objectContaining({
        isTrusted: {
          enabledCommands: ["guigit.showCommitDetails", "guigit.copyCommitHash"]
        },
        value: expect.stringContaining("command:guigit.showCommitDetails")
      })
    ]);
    expect(hoverMessages[0]).toEqual(expect.objectContaining({
      value: expect.stringContaining("command:guigit.copyCommitHash")
    }));
  });

  it("keeps blame scoped to the cursor line even when legacy all-line mode is disabled", async () => {
    const editor = createEditor(0);
    const controller = createController({
      editor,
      now: () => new Date("2026-05-09T10:05:00+08:00"),
      settings: createSettings({
        blameFormat: "${hash} ${author}: ${summary}",
        blameShowOnlyCurrentLine: false
      })
    });

    await controller.refreshEditor(editor);

    const decorations = editor.setDecorations.mock.calls.at(-1)![1];
    expect(decorations).toHaveLength(1);
    expect(decorations.map((item) => item.renderOptions.after.contentText)).toEqual([
      "  Ada 2 天前: Wire data"
    ]);
  });

  it("clears decorations when blame is disabled", async () => {
    const editor = createEditor(0);
    const controller = createController({
      editor,
      settings: createSettings({
        blameEnabled: false
      })
    });

    await controller.refreshEditor(editor);

    expect(editor.setDecorations).toHaveBeenCalledWith("decoration", []);
  });

  it("toggles the blame setting and refreshes the active editor", async () => {
    const editor = createEditor(0);
    const updateBlameEnabled = vi.fn();
    const controller = createController({
      editor,
      now: () => new Date("2026-05-09T10:05:00+08:00"),
      settings: createSettings({
        blameEnabled: false
      }),
      updateBlameEnabled
    });

    await controller.toggleBlame();

    expect(updateBlameEnabled).toHaveBeenCalledWith(true);
    expect(editor.setDecorations).toHaveBeenCalledWith("decoration", [
      expect.objectContaining({
        renderOptions: expect.objectContaining({
          after: expect.objectContaining({ contentText: "  Ada 2 天前: Wire data" })
        })
      })
    ]);
  });
});

function createController(input: {
  editor: ReturnType<typeof createEditor>;
  now?: () => Date;
  settings: SettingsViewModel;
  updateBlameEnabled?: (enabled: boolean) => Promise<void>;
  createMarkdownString?: (value: string) => unknown;
}): BlameController {
  return new BlameController({
    activeEditor: () => input.editor,
    createDecorationType: () => "decoration",
    createRange: (line, startCharacter, _endLine, endCharacter) => ({
      endCharacter,
      line,
      startCharacter
    }),
    createMarkdownString: input.createMarkdownString ?? ((value) => ({ isTrusted: true, value })),
    gitRaw: async () => blameOutput,
    now: input.now ?? (() => new Date("2026-05-09T10:00:00+08:00")),
    repositoryService: {
      discoverRepositories: async () => [{ id: "/repo", name: "repo", rootPath: "/repo" }]
    },
    settingsService: {
      getSettings: () => input.settings
    },
    updateBlameEnabled: input.updateBlameEnabled ?? (async () => undefined)
  });
}

function createEditor(activeLine: number) {
  return {
    document: {
      lineAt: (line: number) => ({
        range: {
          end: {
            character: line === 0 ? 11 : 13
          }
        }
      }),
      uri: {
        fsPath: "/repo/src/app.ts",
        scheme: "file"
      }
    },
    selection: {
      active: {
        line: activeLine
      }
    },
    setDecorations: vi.fn()
  };
}

function createSettings(input: Partial<SettingsViewModel>): SettingsViewModel {
  return {
    autoStashOnPull: "ask",
    blameEnabled: true,
    blameFormat: "${author}, ${time}: ${summary}",
    blameShowOnlyCurrentLine: true,
    fileViewMode: "tree",
    language: "auto",
    proxy: {
      enabled: false,
      http: "",
      https: "",
      noProxy: ""
    },
    ...input
  };
}

const blameOutput = [
  "abc1234567890abcdef 1 1 1",
  "author Ada",
  "author-mail <ada@example.com>",
  "author-time 1778119200",
  "author-tz +0800",
  "summary Wire data",
  "\tconst one = 1;",
  "def4567890abcdefabc 2 2 1",
  "author Grace",
  "author-mail <grace@example.com>",
  "author-time 1778115600",
  "author-tz +0800",
  "summary Add graph with an intentionally long commit summary that should be trimmed before it consumes the whole editor row",
  "\tconst two = 2;"
].join("\n");
