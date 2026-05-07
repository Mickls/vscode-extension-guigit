import { describe, expect, it } from "vitest";
import { WorkspaceStateService } from "../../src/state/WorkspaceStateService";

describe("WorkspaceStateService", () => {
  it("stores the current repository id", () => {
    const service = new WorkspaceStateService();

    service.setCurrentRepositoryId("/workspace/repo");

    expect(service.getCurrentRepositoryId()).toBe("/workspace/repo");
  });
});
