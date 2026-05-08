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
        { x: 20, y: 18 },
        { x: 20, y: 90 }
      ],
      toHash: "merged-parent"
    });
  });

  it("continues lanes to the loaded window boundary for parents that are not loaded yet", async () => {
    const service = new GraphService({
      gitRaw: async () => "child\x1fparent"
    });

    const graph = await service.getLayout("/workspace/repo", ["child"]);

    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "child", row: 0 }
    ]);
    expect(graph.edges).toEqual([
      {
        color: "#f56565",
        fromHash: "child",
        points: [
          { x: 8, y: 18 },
          { x: 8, y: 36 }
        ],
        toHash: "parent"
      }
    ]);
  });

  it("routes first-parent branch edges from the parent row and merge edges from the merge row", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "merge\x1fmain-tip branch-tip",
          "branch-tip\x1fbranch-base main-side",
          "main-side\x1fmain-base",
          "main-tip\x1fmain-base",
          "branch-base\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", [
      "merge",
      "branch-tip",
      "main-side",
      "main-tip",
      "branch-base"
    ]);

    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "merge", row: 0 },
      { column: 1, hash: "branch-tip", row: 1 },
      { column: 2, hash: "main-side", row: 2 },
      { column: 0, hash: "main-tip", row: 3 },
      { column: 1, hash: "branch-base", row: 4 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "branch-tip" && edge.toHash === "branch-base")?.points).toEqual([
      { x: 20, y: 54 },
      { x: 20, y: 162 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "branch-tip" && edge.toHash === "main-side")?.points).toEqual([
      { x: 20, y: 54 },
      { x: 32, y: 54 },
      { x: 32, y: 90 }
    ]);
  });

  it("routes first-parent joins into an occupied parent lane from the parent row", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "main-tip\x1fmain-parent branch-tip",
          "branch-tip\x1fmain-parent",
          "main-parent\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", ["main-tip", "branch-tip", "main-parent"]);

    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "main-tip", row: 0 },
      { column: 1, hash: "branch-tip", row: 1 },
      { column: 0, hash: "main-parent", row: 2 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "branch-tip" && edge.toHash === "main-parent")?.points).toEqual([
      { x: 20, y: 54 },
      { x: 20, y: 90 },
      { x: 8, y: 90 }
    ]);
  });

  it("keeps a shared parent on the lane of the nearest first-parent continuation", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "main-merge\x1fmain-parent branch-head",
          "branch-head\x1fbranch-merge",
          "branch-merge\x1fbranch-cont side-merge",
          "side-merge\x1fshared-base side-main",
          "side-main\x1fside-base",
          "branch-cont\x1fshared-base",
          "shared-base\x1f",
          "main-parent\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", [
      "main-merge",
      "branch-head",
      "branch-merge",
      "side-merge",
      "side-main",
      "branch-cont",
      "shared-base",
      "main-parent"
    ]);

    const branchHead = graph.nodes.find((node) => node.hash === "branch-head")!;
    const branchCont = graph.nodes.find((node) => node.hash === "branch-cont")!;
    const sharedBase = graph.nodes.find((node) => node.hash === "shared-base")!;
    const sideMerge = graph.nodes.find((node) => node.hash === "side-merge")!;
    const sideMain = graph.nodes.find((node) => node.hash === "side-main")!;

    expect(branchCont.column).toBe(branchHead.column);
    expect(sharedBase.column).toBe(branchHead.column);
    expect(sharedBase.color).toBe(branchHead.color);
    expect(sideMerge.column).not.toBe(sharedBase.column);
    expect(sideMain.column).not.toBe(sideMerge.column);
    expect(graph.edges.find((edge) => edge.fromHash === "branch-cont" && edge.toHash === "shared-base")?.points).toEqual([
      { x: 20, y: 198 },
      { x: 20, y: 234 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "side-merge" && edge.toHash === "side-main")?.points).toEqual([
      { x: 32, y: 126 },
      { x: 44, y: 126 },
      { x: 44, y: 162 }
    ]);
  });

  it("keeps hidden parents on fixed lanes until the parent commit is loaded", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "merge\x1fmain side-a",
          "side-a\x1fhidden-shared",
          "side-b\x1fhidden-shared",
          "main\x1fmain-parent unrelated-hidden"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", ["merge", "side-a", "side-b", "main"]);

    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "merge", row: 0 },
      { column: 1, hash: "side-a", row: 1 },
      { column: 2, hash: "side-b", row: 2 },
      { column: 0, hash: "main", row: 3 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "side-b" && edge.toHash === "hidden-shared")?.points).toEqual([
      { x: 32, y: 90 },
      { x: 32, y: 144 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "main" && edge.toHash === "unrelated-hidden")?.points).toEqual([
      { x: 8, y: 126 },
      { x: 44, y: 126 },
      { x: 44, y: 144 }
    ]);
  });

  it("keeps lane spacing fixed and expands the graph width for many branches", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "merge\x1fmain branch-a branch-b branch-c branch-d branch-e branch-f branch-g branch-h",
          "main\x1fbase",
          "branch-a\x1fbase",
          "branch-b\x1fbase",
          "branch-c\x1fbase",
          "branch-d\x1fbase",
          "branch-e\x1fbase",
          "branch-f\x1fbase",
          "branch-g\x1fbase",
          "branch-h\x1fbase",
          "base\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", [
      "merge",
      "main",
      "branch-a",
      "branch-b",
      "branch-c",
      "branch-d",
      "branch-e",
      "branch-f",
      "branch-g",
      "branch-h",
      "base"
    ]);

    expect(graph.width).toBe(128);
    expect(Math.max(...graph.nodes.map((node) => node.x))).toBe(104);
    expect(
      [...new Set(graph.nodes.map((node) => node.x))]
        .sort((left, right) => left - right)
        .slice(0, 3)
    ).toEqual([8, 20, 32]);
  });

  it("keeps visible shared-parent branches on separate lanes until they merge", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "head\x1fmain branch-a",
          "branch-a\x1fshared-parent",
          "main\x1fmerge",
          "merge\x1fmain-parent branch-b",
          "branch-b\x1fshared-parent",
          "shared-parent\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", [
      "head",
      "branch-a",
      "main",
      "merge",
      "branch-b",
      "shared-parent"
    ]);

    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "head", row: 0 },
      { column: 1, hash: "branch-a", row: 1 },
      { column: 0, hash: "main", row: 2 },
      { column: 0, hash: "merge", row: 3 },
      { column: 2, hash: "branch-b", row: 4 },
      { column: 2, hash: "shared-parent", row: 5 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "branch-a" && edge.toHash === "shared-parent")?.points).toEqual([
      { x: 20, y: 54 },
      { x: 20, y: 198 },
      { x: 32, y: 198 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "branch-b" && edge.toHash === "shared-parent")?.points).toEqual([
      { x: 32, y: 162 },
      { x: 32, y: 198 }
    ]);
  });

  it("moves continuations inward when an inner lane has been released", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "head\x1fmain branch-a",
          "branch-a\x1fshared-parent",
          "main\x1fmerge",
          "merge\x1fmain-parent branch-b",
          "branch-b\x1fshared-parent",
          "shared-parent\x1fbase",
          "side\x1fside-parent",
          "base\x1f"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", [
      "head",
      "branch-a",
      "main",
      "merge",
      "branch-b",
      "shared-parent",
      "side",
      "base"
    ]);

    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "head", row: 0 },
      { column: 1, hash: "branch-a", row: 1 },
      { column: 0, hash: "main", row: 2 },
      { column: 0, hash: "merge", row: 3 },
      { column: 2, hash: "branch-b", row: 4 },
      { column: 2, hash: "shared-parent", row: 5 },
      { column: 2, hash: "side", row: 6 },
      { column: 1, hash: "base", row: 7 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "shared-parent" && edge.toHash === "base")?.points).toEqual([
      { x: 32, y: 198 },
      { x: 20, y: 198 },
      { x: 20, y: 270 }
    ]);
  });

  it("keeps a shared first-parent edge separate until the parent row releases its lane", async () => {
    const service = new GraphService({
      gitRaw: async () =>
        [
          "main-tip\x1fmain-parent branch-tip",
          "branch-tip\x1fbranch-merge",
          "branch-merge\x1fbranch-first-parent branch-side",
          "branch-side\x1fshared-parent right-continuation",
          "right-continuation\x1fright-base",
          "right-base\x1fhidden-base",
          "branch-first-parent\x1fshared-parent",
          "shared-parent\x1fhidden-base",
          "main-parent\x1fmain-base main-side",
          "main-side\x1fhidden-base"
        ].join("\x1e")
    });

    const graph = await service.getLayout("/workspace/repo", [
      "main-tip",
      "branch-tip",
      "branch-merge",
      "branch-side",
      "right-continuation",
      "right-base",
      "branch-first-parent",
      "shared-parent",
      "main-parent",
      "main-side"
    ]);

    expect(graph.nodes.map((node) => ({ column: node.column, hash: node.hash, row: node.row }))).toEqual([
      { column: 0, hash: "main-tip", row: 0 },
      { column: 1, hash: "branch-tip", row: 1 },
      { column: 1, hash: "branch-merge", row: 2 },
      { column: 2, hash: "branch-side", row: 3 },
      { column: 3, hash: "right-continuation", row: 4 },
      { column: 3, hash: "right-base", row: 5 },
      { column: 1, hash: "branch-first-parent", row: 6 },
      { column: 1, hash: "shared-parent", row: 7 },
      { column: 0, hash: "main-parent", row: 8 },
      { column: 3, hash: "main-side", row: 9 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "branch-side" && edge.toHash === "shared-parent")?.points).toEqual([
      { x: 32, y: 126 },
      { x: 32, y: 270 },
      { x: 20, y: 270 }
    ]);
    expect(graph.edges.find((edge) => edge.fromHash === "right-base" && edge.toHash === "hidden-base")?.points).toEqual([
      { x: 44, y: 198 },
      { x: 44, y: 306 },
      { x: 32, y: 306 },
      { x: 32, y: 360 }
    ]);
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
      nodes: [],
      width: 32
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

  it("keeps many active columns at fixed spacing outside the base graph strip", async () => {
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

    expect(Math.max(...graph.nodes.map((node) => node.x))).toBe(488);
    expect(graph.width).toBe(512);
  });
});
