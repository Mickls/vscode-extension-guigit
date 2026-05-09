import { describe, expect, it, vi } from "vitest";
import { BlameController } from "../../src/backend/vscode/BlameController";
import type { SettingsViewModel } from "../../src/backend/rpc/contract";

describe("BlameController", () => {
  it("decorates only the active line when configured", async () => {
    const editor = createEditor(1);
    const controller = createController({
      editor,
      settings: createSettings({
        blameFormat: "${author}, ${time}: ${summary}",
        blameShowOnlyCurrentLine: true
      })
    });

    await controller.refreshEditor(editor);

    expect(editor.setDecorations).toHaveBeenCalledWith("decoration", [
      expect.objectContaining({
        hoverMessage: expect.stringContaining("command:guigit.showCommitDetails"),
        range: { endCharacter: 13, line: 1, startCharacter: 13 },
        renderOptions: {
          after: {
            contentText: "  Grace, 2026-05-07 09:00:00 +0800: Add graph",
            color: "editorCodeLens.foreground",
            fontStyle: "italic"
          }
        }
      })
    ]);
  });

  it("decorates all committed lines when current-line mode is disabled", async () => {
    const editor = createEditor(0);
    const controller = createController({
      editor,
      settings: createSettings({
        blameFormat: "${hash} ${author}: ${summary}",
        blameShowOnlyCurrentLine: false
      })
    });

    await controller.refreshEditor(editor);

    const decorations = editor.setDecorations.mock.calls.at(-1)![1];
    expect(decorations).toHaveLength(2);
    expect(decorations.map((item) => item.renderOptions.after.contentText)).toEqual([
      "  abc1234 Ada: Wire data",
      "  def4567 Grace: Add graph"
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
          after: expect.objectContaining({ contentText: "  Ada, 2026-05-07 10:00:00 +0800: Wire data" })
        })
      })
    ]);
  });
});

function createController(input: {
  editor: ReturnType<typeof createEditor>;
  settings: SettingsViewModel;
  updateBlameEnabled?: (enabled: boolean) => Promise<void>;
}): BlameController {
  return new BlameController({
    activeEditor: () => input.editor,
    createDecorationType: () => "decoration",
    createRange: (line, startCharacter, _endLine, endCharacter) => ({
      endCharacter,
      line,
      startCharacter
    }),
    gitRaw: async () => blameOutput,
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
  "summary Add graph",
  "\tconst two = 2;"
].join("\n");
