import { describe, expect, it } from "vitest";
import { FileService } from "../../src/backend/git/FileService";
import { CacheService } from "../../src/state/CacheService";
import type { FileViewMode } from "../../src/backend/rpc/contract";

describe("FileService", () => {
  it("returns commit metadata and file changes", async () => {
    const service = new FileService({
      cache: new CacheService(),
      configuration: createConfiguration("list"),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "show" && args.includes("--no-patch")) {
          return [
            "abc1234567890abcdef",
            "2026-05-07 10:00:00 +0800",
            "Add file service",
            "Ada",
            "ada@example.com",
            "HEAD -> main, tag: v1.0",
            "Longer body"
          ].join("\x1f");
        }

        if (args[0] === "show" && args.includes("--numstat")) {
          return ["12\t2\tsrc/file.ts", "-\t-\tassets/logo.png", "1\t0\tsrc/old.ts"].join("\n");
        }

        if (args[0] === "show" && args.includes("--name-status")) {
          return ["M\tsrc/file.ts", "A\tassets/logo.png", "R100\tsrc/old.ts\tsrc/new.ts"].join("\n");
        }

        if (args.join(" ") === "rev-parse HEAD") {
          return "abc1234567890abcdef\n";
        }

        if (args.join(" ") === "config user.name") {
          return "Ada\n";
        }

        if (args.join(" ") === "config user.email") {
          return "ada@example.com\n";
        }

        return "";
      }
    });

    await expect(service.getCommitDetails("/workspace/repo", "abc1234")).resolves.toEqual({
      author: "Ada",
      body: "Longer body",
      canEditMessage: true,
      date: "2026-05-07 10:00:00 +0800",
      email: "ada@example.com",
      files: [
        {
          binary: false,
          deletions: 2,
          insertions: 12,
          path: "src/file.ts",
          status: "modified"
        },
        {
          binary: true,
          deletions: 0,
          insertions: 0,
          path: "assets/logo.png",
          status: "added"
        },
        {
          binary: false,
          deletions: 0,
          insertions: 1,
          path: "src/new.ts",
          previousPath: "src/old.ts",
          status: "renamed"
        }
      ],
      hash: "abc1234567890abcdef",
      message: "Add file service",
      refs: [
        { name: "HEAD", type: "head" },
        { name: "main", type: "local" },
        { name: "v1.0", type: "tag" }
      ]
    });
  });

  it("caches commit details by repository and hash", async () => {
    let showCalls = 0;
    const service = new FileService({
      cache: new CacheService(),
      configuration: createConfiguration("list"),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "show" && args.includes("--no-patch")) {
          showCalls += 1;
          return ["abc1234567890abcdef", "Today", "Message", "Ada", "ada@example.com", "", ""].join("\x1f");
        }

        return "";
      }
    });

    await service.getCommitDetails("/workspace/repo", "abc1234");
    await service.getCommitDetails("/workspace/repo", "abc1234");

    expect(showCalls).toBe(1);
  });

  it("returns file changes with the requested view mode", async () => {
    const service = new FileService({
      cache: new CacheService(),
      configuration: createConfiguration("tree"),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "show" && args.includes("--numstat")) {
          return "4\t1\tsrc/app.ts";
        }

        if (args[0] === "show" && args.includes("--name-status")) {
          return "M\tsrc/app.ts";
        }

        return "";
      }
    });

    await expect(service.getFileChanges("/workspace/repo", "abc1234", "tree")).resolves.toEqual({
      files: [
        {
          binary: false,
          deletions: 1,
          insertions: 4,
          path: "src/app.ts",
          status: "modified"
        }
      ],
      mode: "tree"
    });
  });

  it("stores file view mode through guigit.fileViewMode", async () => {
    const updates: Array<{ key: string; value: FileViewMode }> = [];
    const service = new FileService({
      cache: new CacheService(),
      configuration: {
        get: () => "list",
        update: async (key, value) => {
          updates.push({ key, value });
        }
      },
      gitRaw: async () => ""
    });

    await service.setFileViewMode("tree");

    expect(service.getFileViewMode()).toBe("list");
    expect(updates).toEqual([{ key: "guigit.fileViewMode", value: "tree" }]);
  });
});

function createConfiguration(mode: FileViewMode) {
  return {
    get: () => mode,
    update: async () => undefined
  };
}
