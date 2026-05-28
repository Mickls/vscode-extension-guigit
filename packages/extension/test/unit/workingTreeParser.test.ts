import { describe, expect, it } from "vitest";
import { parsePorcelainStatus, parseStashFiles, parseStashList, parseWorkingTreeStatus } from "../../src/backend/git/WorkingTreeParser";

describe("WorkingTreeParser", () => {
  it("groups porcelain status into staged, unstaged, and untracked files", () => {
    const result = parsePorcelainStatus(
      [
        "M  src/staged.ts",
        " M src/unstaged.ts",
        "A  src/new.ts",
        "?? src/untracked.ts",
        "R  src/old.ts -> src/new-name.ts",
        "C  src/source.ts -> src/copied.ts"
      ].join("\n")
    );

    expect(result.staged.map((file) => [file.area, file.path, file.previousPath, file.status])).toEqual([
      ["staged", "src/staged.ts", undefined, "modified"],
      ["staged", "src/new.ts", undefined, "added"],
      ["staged", "src/new-name.ts", "src/old.ts", "renamed"],
      ["staged", "src/copied.ts", "src/source.ts", "copied"]
    ]);
    expect(result.unstaged.map((file) => [file.area, file.path, file.previousPath, file.status])).toEqual([
      ["unstaged", "src/unstaged.ts", undefined, "modified"],
      ["untracked", "src/untracked.ts", undefined, "added"]
    ]);
  });

  it("uses the current path for unstaged changes on staged renames", () => {
    const result = parsePorcelainStatus("RM src/old.ts -> src/new.ts");

    expect(result.staged).toMatchObject([
      {
        area: "staged",
        path: "src/new.ts",
        previousPath: "src/old.ts",
        status: "renamed"
      }
    ]);
    expect(result.unstaged).toMatchObject([
      {
        area: "unstaged",
        path: "src/new.ts",
        previousPath: undefined,
        status: "modified"
      }
    ]);
  });

  it("parses quoted rename paths containing separators", () => {
    const result = parsePorcelainStatus('RM "src/old -> name.ts" -> "src/new -> name.ts"');

    expect(result.staged).toMatchObject([
      {
        path: "src/new -> name.ts",
        previousPath: "src/old -> name.ts",
        status: "renamed"
      }
    ]);
    expect(result.unstaged).toMatchObject([
      {
        path: "src/new -> name.ts",
        previousPath: undefined,
        status: "modified"
      }
    ]);
  });

  it("unquotes untracked paths", () => {
    const result = parsePorcelainStatus('?? "src/space name.ts"');

    expect(result.unstaged).toMatchObject([
      {
        area: "untracked",
        path: "src/space name.ts",
        status: "added"
      }
    ]);
  });

  it("decodes octal UTF-8 path escapes", () => {
    const result = parsePorcelainStatus(String.raw`?? "src/unicode-\303\251.ts"`);

    expect(result.unstaged).toMatchObject([
      {
        area: "untracked",
        path: "src/unicode-é.ts",
        status: "added"
      }
    ]);
  });

  it("merges quoted UTF-8 numstat paths into working tree status", () => {
    const path = String.raw`"issue/EPIC-20260527-001_VSCode\346\225\260\346\215\256\345\272\223\346\217\222\344\273\266/README.md"`;
    const result = parseWorkingTreeStatus(` M ${path}`, "", `2\t1\t${path}`);

    expect(result.unstaged).toMatchObject([
      {
        deletions: 1,
        insertions: 2,
        path: "issue/EPIC-20260527-001_VSCode数据库插件/README.md",
        status: "modified"
      }
    ]);
  });

  it("parses stash list entries", () => {
    expect(parseStashList("stash@{0}: WIP on main: abc1234 message\nstash@{1}: On feature: save work")).toEqual([
      {
        branch: "main",
        date: "",
        message: "WIP on main: abc1234 message",
        ref: "stash@{0}"
      },
      {
        branch: "feature",
        date: "",
        message: "On feature: save work",
        ref: "stash@{1}"
      }
    ]);
  });

  it("merges real-shaped stash name-status and numstat outputs including renames", () => {
    const result = parseStashFiles(
      "M\tsrc/a.ts\nA\tsrc/image.png\nR100\tsrc/old.txt\tsrc/new.txt\n",
      "10\t2\tsrc/a.ts\n-\t-\tsrc/image.png\n3\t1\tsrc/{old.txt => new.txt}\n"
    );

    expect(result).toEqual([
      { area: "stash", binary: false, deletions: 2, insertions: 10, path: "src/a.ts", status: "modified" },
      { area: "stash", binary: true, deletions: 0, insertions: 0, path: "src/image.png", status: "added" },
      {
        area: "stash",
        binary: false,
        deletions: 1,
        insertions: 3,
        path: "src/new.txt",
        previousPath: "src/old.txt",
        status: "renamed"
      }
    ]);
  });

  it("decodes quoted UTF-8 rename paths in stash files", () => {
    const previousPath = String.raw`"src/\346\227\247\347\233\256\345\275\225/\346\227\247\346\226\207\344\273\266.md"`;
    const nextPath = String.raw`"src/\346\226\260\347\233\256\345\275\225/\346\226\260\346\226\207\344\273\266.md"`;
    const result = parseStashFiles(`R050\t${previousPath}\t${nextPath}\n`, `1\t0\t${previousPath} => ${nextPath}\n`);

    expect(result).toEqual([
      {
        area: "stash",
        binary: false,
        deletions: 0,
        insertions: 1,
        path: "src/新目录/新文件.md",
        previousPath: "src/旧目录/旧文件.md",
        status: "renamed"
      }
    ]);
  });

  it("merges unbraced cross-directory rename numstat paths into renamed stash files", () => {
    const result = parseStashFiles("R073\tsrc/old.txt\tdst/new.txt\n", "1\t0\tsrc/old.txt => dst/new.txt\n");

    expect(result).toEqual([
      {
        area: "stash",
        binary: false,
        deletions: 0,
        insertions: 1,
        path: "dst/new.txt",
        previousPath: "src/old.txt",
        status: "renamed"
      }
    ]);
  });

  it("does not treat arrow text in modified stash paths as renames", () => {
    const result = parseStashFiles("M\tsrc/a => b.txt\n", "4\t2\tsrc/a => b.txt\n");

    expect(result).toEqual([
      {
        area: "stash",
        binary: false,
        deletions: 2,
        insertions: 4,
        path: "src/a => b.txt",
        status: "modified"
      }
    ]);
  });
});
