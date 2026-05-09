import { describe, expect, it } from "vitest";
import { parsePorcelainStatus, parseStashList } from "../../src/backend/git/WorkingTreeParser";

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
});
