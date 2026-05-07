import { describe, expect, it } from "vitest";
import { CommitService } from "../../src/backend/git/CommitService";
import { CacheService } from "../../src/state/CacheService";

const field = "\x1f";
const record = "\x1e";

describe("CommitService", () => {
  it("loads paged commit history with refs, parents, and editable state", async () => {
    const rawCalls: string[][] = [];
    const gitRaw = async (_repositoryRoot: string, args: readonly string[]): Promise<string> => {
      rawCalls.push([...args]);

      if (args[0] === "log") {
        return [
          commitLine({
            author: "Ada",
            email: "ada@example.com",
            hash: "abc1234567890abcdef",
            parents: "def456 ghi789",
            refs: "HEAD -> main, tag: v1.0, origin/main",
            subject: "Initial commit"
          }),
          commitLine({
            author: "Grace",
            date: "2026-05-07 09:00:00 +0800",
            email: "grace@example.com",
            hash: "def4567890abcdefabc",
            parents: "ghi789",
            refs: "feature/login",
            subject: "Add login"
          }),
          commitLine({
            author: "Linus",
            email: "linus@example.com",
            hash: "ghi789abcdefabc123",
            parents: "",
            refs: "",
            subject: "Root"
          })
        ].join(record);
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
    };

    const service = new CommitService({ cache: new CacheService(), gitRaw });

    await expect(
      service.loadHistory({
        cursor: "2",
        pageSize: 2,
        repositoryRoot: "/workspace/repo"
      })
    ).resolves.toEqual({
      commits: [
        {
          author: "Ada",
          canEditMessage: true,
          date: "2026-05-07 10:00:00 +0800",
          hash: "abc1234567890abcdef",
          message: "Initial commit",
          parents: ["def456", "ghi789"],
          refs: [
            { name: "HEAD", type: "head" },
            { name: "main", type: "local" },
            { name: "v1.0", type: "tag" },
            { name: "origin/main", type: "remote" }
          ],
          shortHash: "abc1234"
        },
        {
          author: "Grace",
          canEditMessage: false,
          date: "2026-05-07 09:00:00 +0800",
          hash: "def4567890abcdefabc",
          message: "Add login",
          parents: ["ghi789"],
          refs: [{ name: "feature/login", type: "remote" }],
          shortHash: "def4567"
        }
      ],
      hasMore: true,
      nextCursor: "4"
    });

    expect(rawCalls[0]).toEqual([
      "log",
      "--branches",
      "--remotes",
      "--tags",
      `--pretty=format:%H${field}%ai${field}%s${field}%an${field}%ae${field}%D${field}%P${record}`,
      "--encoding=UTF-8",
      "--max-count=3",
      "--skip=2"
    ]);
  });

  it("loads a selected ref with an author filter", async () => {
    const logCalls: string[][] = [];
    const service = new CommitService({
      cache: new CacheService(),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "log") {
          logCalls.push([...args]);
          return "";
        }

        return "Mickls\n";
      }
    });

    await service.loadHistory({
      author: "Mickls",
      branch: "origin/release",
      pageSize: 20,
      repositoryRoot: "/workspace/repo"
    });

    expect(logCalls[0]).toContain("origin/release");
    expect(logCalls[0]).toContain("--author=Mickls");
    expect(logCalls[0]).not.toContain("--branches");
    expect(logCalls[0]).not.toContain("--remotes");
    expect(logCalls[0]).not.toContain("--tags");
  });

  it("supports message search", async () => {
    const logCalls: string[][] = [];
    const service = new CommitService({
      cache: new CacheService(),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "log") {
          logCalls.push([...args]);
        }

        return "";
      }
    });

    await service.loadHistory({
      pageSize: 20,
      repositoryRoot: "/workspace/repo",
      search: "fix ui"
    });

    expect(logCalls[0]).toContain("--grep=fix ui");
    expect(logCalls[0]).toContain("-i");
  });

  it("supports hash-prefix search", async () => {
    const service = new CommitService({
      cache: new CacheService(),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "log") {
          return [
            commitLine({ hash: "abc1234567890abcdef", subject: "Match" }),
            commitLine({ hash: "def4567890abcdefabc", subject: "No match" })
          ].join(record);
        }

        return "nobody\n";
      }
    });

    const result = await service.loadHistory({
      pageSize: 20,
      repositoryRoot: "/workspace/repo",
      search: "abc1"
    });

    expect(result.commits.map((commit) => commit.hash)).toEqual(["abc1234567890abcdef"]);
  });

  it("trims git record separators from commit hashes", async () => {
    const service = new CommitService({
      cache: new CacheService(),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "log") {
          return [
            commitLine({ hash: "abc1234567890abcdef", subject: "First" }),
            commitLine({ hash: "def4567890abcdefabc", subject: "Second" })
          ].join(`${record}\n`);
        }

        return "nobody\n";
      }
    });

    const result = await service.loadHistory({
      pageSize: 20,
      repositoryRoot: "/workspace/repo"
    });

    expect(result.commits.map((commit) => commit.hash)).toEqual([
      "abc1234567890abcdef",
      "def4567890abcdefabc"
    ]);
  });

  it("caches total commit counts by repository and filters", async () => {
    const revListCalls: string[][] = [];
    const service = new CommitService({
      cache: new CacheService(),
      gitRaw: async (_repositoryRoot, args) => {
        if (args[0] === "rev-list") {
          revListCalls.push([...args]);
          return "42\n";
        }

        return "";
      }
    });

    await expect(service.getTotalCommitCount({ author: "Ada", branch: "v1.0", repositoryRoot: "/workspace/repo" })).resolves.toBe(
      42
    );
    await expect(service.getTotalCommitCount({ author: "Ada", branch: "v1.0", repositoryRoot: "/workspace/repo" })).resolves.toBe(
      42
    );

    expect(revListCalls).toEqual([["rev-list", "--count", "v1.0", "--author=Ada"]]);
  });
});

function commitLine(input: {
  author?: string;
  date?: string;
  email?: string;
  hash: string;
  parents?: string;
  refs?: string;
  subject: string;
}): string {
  return [
    input.hash,
    input.date ?? "2026-05-07 10:00:00 +0800",
    input.subject,
    input.author ?? "Ada",
    input.email ?? "ada@example.com",
    input.refs ?? "",
    input.parents ?? ""
  ].join(field);
}
