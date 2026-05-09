import { describe, expect, it, vi } from "vitest";
import { WorkingTreeService } from "../../src/backend/git/WorkingTreeService";

describe("WorkingTreeService", () => {
  it("loads branch, staged files, unstaged files, and stashes", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "status --porcelain=v1") {
        return "M  src/staged.ts\n M src/unstaged.ts\n?? src/untracked.ts\n";
      }
      if (args.join(" ") === "stash list") {
        return "stash@{0}: WIP on main: abc1234 message";
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return "main\n";
      }
      return "";
    });
    const service = new WorkingTreeService({ gitRaw });

    const result = await service.load("/repo", "/repo");

    expect(result.branch).toBe("main");
    expect(result.staged.map((file) => file.path)).toEqual(["src/staged.ts"]);
    expect(result.unstaged.map((file) => file.path)).toEqual(["src/unstaged.ts", "src/untracked.ts"]);
    expect(result.stashes).toHaveLength(1);
  });
});
