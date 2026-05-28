import { describe, expect, it } from "vitest";
import { parseGitFileChanges } from "../../src/backend/git/FileChangeParser";

describe("FileChangeParser", () => {
  it("decodes Git-quoted UTF-8 paths from file change output", () => {
    const path = String.raw`"issue/EPIC-20260527-001_VSCode\346\225\260\346\215\256\345\272\223\346\217\222\344\273\266/20-connections/002-\350\277\236\346\216\245\347\256\241\347\220\206\344\270\216\345\257\206\351\222\245\345\255\230\345\202\250/README.md"`;

    expect(parseGitFileChanges(`1\t0\t${path}`, `M\t${path}`)).toEqual([
      {
        binary: false,
        deletions: 0,
        insertions: 1,
        path: "issue/EPIC-20260527-001_VSCode数据库插件/20-connections/002-连接管理与密钥存储/README.md",
        status: "modified"
      }
    ]);
  });

  it("decodes quoted rename paths and keeps numstat counts", () => {
    const previousPath = String.raw`"src/\346\227\247\347\233\256\345\275\225/\346\227\247\346\226\207\344\273\266.md"`;
    const nextPath = String.raw`"src/\346\226\260\347\233\256\345\275\225/\346\226\260\346\226\207\344\273\266.md"`;

    expect(parseGitFileChanges(`1\t0\t${previousPath} => ${nextPath}`, `R050\t${previousPath}\t${nextPath}`)).toEqual([
      {
        binary: false,
        deletions: 0,
        insertions: 1,
        path: "src/新目录/新文件.md",
        previousPath: "src/旧目录/旧文件.md",
        status: "renamed"
      }
    ]);
  });
});
