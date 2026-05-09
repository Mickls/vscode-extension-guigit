import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("package manifest", () => {
  it("bundles the extension host before dependency-free packaging", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: {
        build: string;
        package: string;
      };
    };

    expect(manifest.scripts.build).toContain("scripts/bundle-extension-host.mjs");
    expect(manifest.scripts.package).toContain("--no-dependencies");
  });

  it("contributes the GUI Git History log grammar", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      contributes: {
        grammars: readonly { language: string; path: string; scopeName: string }[];
        languages: readonly { id: string }[];
      };
    };
    const grammar = JSON.parse(await readFile("syntaxes/guigit-log.tmLanguage.json", "utf8")) as {
      patterns: readonly { match?: string; name?: string }[];
      scopeName: string;
    };

    expect(manifest.contributes.languages).toContainEqual(expect.objectContaining({ id: "guigit-log" }));
    expect(manifest.contributes.grammars).toContainEqual({
      language: "guigit-log",
      path: "./syntaxes/guigit-log.tmLanguage.json",
      scopeName: "source.guigit-log"
    });
    expect(grammar.patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ match: "\\[info\\]", name: "markup.inserted.guigit-log" }),
        expect.objectContaining({ match: "\\[debug\\]", name: "markup.changed.guigit-log" }),
        expect.objectContaining({ match: "\\[error\\]", name: "markup.deleted.guigit-log" }),
        expect.objectContaining({ name: "meta.git-command.guigit-log" })
      ])
    );
  });
});
