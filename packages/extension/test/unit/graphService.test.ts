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
      color: "#4299e1",
      fromHash: "merge",
      points: [
        { x: 8, y: 18 },
        { x: 8, y: 54 },
        { x: 20, y: 54 },
        { x: 20, y: 90 }
      ],
      toHash: "merged-parent"
    });
  });

  it("keeps graph rows aligned to the requested commit order", async () => {
    const service = new GraphService({
      gitRaw: async () => ["third\x1fsecond", "first\x1f", "second\x1ffirst"].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", ["first", "second", "third"]);

    expect(graph.nodes.map((node) => ({ hash: node.hash, row: node.row, y: node.y }))).toEqual([
      { hash: "first", row: 0, y: 18 },
      { hash: "second", row: 1, y: 54 },
      { hash: "third", row: 2, y: 90 }
    ]);
  });

  it("uses stable mainline color and branch colors for merge edges", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "main-3\x1fmain-2 branch-2",
          "branch-2\x1fbranch-1",
          "main-2\x1fmain-1",
          "branch-1\x1fmain-1",
          "main-1\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", ["main-3", "branch-2", "main-2", "branch-1", "main-1"]);

    expect(graph.nodes.filter((node) => node.hash.startsWith("main-")).map((node) => node.color)).toEqual([
      "#f56565",
      "#f56565",
      "#f56565"
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "main-3" && edge.toHash === "branch-2")?.color).toBe(
      graph.nodes.find((node) => node.hash === "branch-2")?.color
    );
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

  it("keeps the first-parent mainline on column zero through interleaved branches", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "main-5\x1fmain-4 feature-2",
          "feature-2\x1ffeature-1",
          "main-4\x1fmain-3",
          "feature-1\x1fmain-2",
          "main-3\x1fmain-2",
          "main-2\x1fmain-1",
          "main-1\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", [
      "main-5",
      "feature-2",
      "main-4",
      "feature-1",
      "main-3",
      "main-2",
      "main-1"
    ]);

    expect(
      graph.nodes
        .filter((node) => node.hash.startsWith("main-"))
        .map((node) => ({ column: node.column, hash: node.hash, x: node.x }))
    ).toEqual([
      { column: 0, hash: "main-5", x: 8 },
      { column: 0, hash: "main-4", x: 8 },
      { column: 0, hash: "main-3", x: 8 },
      { column: 0, hash: "main-2", x: 8 },
      { column: 0, hash: "main-1", x: 8 }
    ]);
  });

  it("compresses many active columns inside the graph strip", async () => {
    const branchCount = 40;
    const branchNames = Array.from({ length: branchCount }, (_value, index) => `branch-${index + 1}`);
    const service = new GraphService({
      gitRaw: async () =>
        [
          `merge\x1fmain ${branchNames.join(" ")}`,
          "main\x1fbase",
          ...branchNames.map((branchName) => `${branchName}\x1fbase`),
          "base\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", ["merge", "main", ...branchNames, "base"]);

    expect(Math.max(...graph.nodes.map((node) => node.x))).toBeLessThanOrEqual(108);
  });
});
