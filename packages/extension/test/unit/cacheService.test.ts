import { describe, expect, it } from "vitest";
import { CacheService } from "../../src/state/CacheService";
import type { CommitDetailsViewModel } from "../../src/backend/rpc/contract";

describe("CacheService", () => {
  it("stores total commit counts by filter key", () => {
    const cache = new CacheService();

    cache.setTotalCommitCount("repo:all", 42);

    expect(cache.getTotalCommitCount("repo:all")).toBe(42);
  });

  it("stores commit details by repository and hash", () => {
    const cache = new CacheService();
    const details = {
      author: "Ada",
      body: "Body",
      canEditMessage: true,
      date: "2026-05-07 10:00:00 +0800",
      email: "ada@example.com",
      files: [],
      hash: "abc1234",
      message: "Initial commit",
      refs: []
    } satisfies CommitDetailsViewModel;

    cache.setCommitDetails("/workspace/repo", "abc1234", details);

    expect(cache.getCommitDetails("/workspace/repo", "abc1234")).toBe(details);
  });
});
