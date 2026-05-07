import { describe, expect, it } from "vitest";
import { GraphService } from "../../src/backend/git/GraphService";

describe("GraphService", () => {
  it("loads parent links and computes stable rows, columns, and edge points", async () => {
    const gitCalls: Array<{ repositoryRoot: string; args: readonly string[] }> = [];
    const service = new GraphService({
      gitRaw: async (repositoryRoot, args) => {
        gitCalls.push({ args, repositoryRoot });

        return [
          "merge\x1ffirst-parent merged-parent",
          "first-parent\x1fbase",
          "merged-parent\x1fbase",
          "base\x1f"
        ].join("\x1e");
      }
    });

    const graph = await service.getLayout("/workspace/repo", [
      "merge",
      "first-parent",
      "merged-parent",
      "base"
    ]);

    expect(gitCalls).toEqual([
      {
        args: [
          "show",
          "--no-patch",
          "--pretty=format:%H%x1f%P%x1e",
          "merge",
          "first-parent",
          "merged-parent",
          "base"
        ],
        repositoryRoot: "/workspace/repo"
      }
    ]);
    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "merge", row: 0 },
      { column: 0, hash: "first-parent", row: 1 },
      { column: 1, hash: "merged-parent", row: 2 },
      { column: 0, hash: "base", row: 3 }
    ]);
    expect(graph.edges).toContainEqual({
      color: "#f56565",
      fromHash: "merge",
      points: [
        { x: 16, y: 18 },
        { x: 32, y: 18 },
        { x: 32, y: 90 }
      ],
      toHash: "merged-parent"
    });
  });

  it("returns an empty layout without calling git for an empty hash list", async () => {
    const service = new GraphService({
      gitRaw: async () => {
        throw new Error("git should not be called");
      }
    });

    await expect(service.getLayout("/workspace/repo", [])).resolves.toEqual({
      edges: [],
      nodes: []
    });
  });
});
