import { describe, expect, it } from "vitest";
import { BranchService } from "../../src/backend/git/BranchService";

describe("BranchService", () => {
  it("returns sorted local branches and remote branches grouped by remote", async () => {
    const service = new BranchService({
      branchSummary: async (_repositoryRoot, args) => {
        if (args[0] === "-r") {
          return {
            all: ["upstream/feature-x", "origin/HEAD -> origin/main", "origin/release", "origin/main"],
            current: ""
          };
        }

        return {
          all: ["feature-x", "main", "master"],
          current: "main"
        };
      }
    });

    await expect(service.listBranches("/workspace/repo")).resolves.toEqual({
      locals: [
        { current: true, name: "main" },
        { current: false, name: "master" },
        { current: false, name: "feature-x" }
      ],
      remotes: [
        {
          branches: [
            { current: false, name: "origin/main", remote: "origin" },
            { current: false, name: "origin/release", remote: "origin" }
          ],
          remote: "origin"
        },
        {
          branches: [{ current: false, name: "upstream/feature-x", remote: "upstream" }],
          remote: "upstream"
        }
      ]
    });
  });
});
