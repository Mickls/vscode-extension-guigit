import { describe, expect, it } from "vitest";
import { parsePorcelainStatus, parseStashList } from "../../src/backend/git/WorkingTreeParser";

describe("WorkingTreeParser", () => {
  it("groups porcelain status into staged, unstaged, and untracked files", () => {
    const result = parsePorcelainStatus(
      ["M  src/staged.ts", " M src/unstaged.ts", "A  src/new.ts", "?? src/untracked.ts", "R  src/new-name.ts"].join("\n")
    );

    expect(result.staged.map((file) => [file.area, file.path, file.status])).toEqual([
      ["staged", "src/staged.ts", "modified"],
      ["staged", "src/new.ts", "added"],
      ["staged", "src/new-name.ts", "renamed"]
    ]);
    expect(result.unstaged.map((file) => [file.area, file.path, file.status])).toEqual([
      ["unstaged", "src/unstaged.ts", "modified"],
      ["untracked", "src/untracked.ts", "added"]
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
