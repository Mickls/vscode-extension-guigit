import { describe, expect, it } from "vitest";
import { WorkspaceStateService } from "../../src/state/WorkspaceStateService";

describe("WorkspaceStateService", () => {
  it("stores the current repository id", () => {
    const service = new WorkspaceStateService();

    service.setCurrentRepositoryId("/workspace/repo");

    expect(service.getCurrentRepositoryId()).toBe("/workspace/repo");
  });

  it("persists advanced git selections in workspace storage", async () => {
    const values = new Map<string, string>();
    const service = new WorkspaceStateService({
      storage: {
        get: (key) => values.get(key),
        update: async (key, value) => {
          values.set(key, value);
        }
      }
    });

    await service.setAdvancedGitSelection("/workspace/repo", "advancedPullMode", "rebase");

    expect(service.getAdvancedGitSelection("/workspace/repo", "advancedPullMode")).toBe("rebase");
  });
});
