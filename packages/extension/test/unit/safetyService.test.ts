import { describe, expect, it, vi } from "vitest";
import { SafetyService } from "../../src/backend/git/SafetyService";

vi.mock("vscode", () => ({
  window: {
    showWarningMessage: vi.fn()
  }
}));

describe("SafetyService", () => {
  it("detects uncommitted changes from porcelain status", async () => {
    const service = new SafetyService({
      gitRaw: async () => " M src/file.ts\n?? new-file.ts\n"
    });

    await expect(service.hasUncommittedChanges("/repo")).resolves.toBe(true);
  });

  it("runs operations directly when the repository is clean", async () => {
    const gitRaw = vi.fn(async () => "");
    const operation = vi.fn(async () => ({ message: "pulled", status: "ok" as const }));
    const service = new SafetyService({ gitRaw });

    await expect(service.runWithAutoStash("/repo", "ask", operation)).resolves.toEqual({
      message: "pulled",
      status: "ok"
    });

    expect(operation).toHaveBeenCalled();
    expect(gitRaw).toHaveBeenCalledTimes(1);
    expect(gitRaw).toHaveBeenCalledWith("/repo", ["status", "--porcelain"]);
  });

  it("cancels dirty operations when auto stash is never", async () => {
    const operation = vi.fn(async () => ({ message: "pulled", status: "ok" as const }));
    const service = new SafetyService({
      gitRaw: async () => " M src/file.ts\n"
    });

    await expect(service.runWithAutoStash("/repo", "never", operation)).resolves.toEqual({
      message: "Uncommitted changes detected",
      status: "cancelled"
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("asks before stashing dirty work and cancels when declined", async () => {
    const operation = vi.fn(async () => ({ message: "pulled", status: "ok" as const }));
    const showWarningMessage = vi.fn(async () => "Cancel");
    const service = new SafetyService({
      gitRaw: async () => " M src/file.ts\n",
      showWarningMessage
    });

    await expect(service.runWithAutoStash("/repo", "ask", operation)).resolves.toEqual({
      message: "Auto stash cancelled",
      status: "cancelled"
    });
    expect(showWarningMessage).toHaveBeenCalledWith(
      "Uncommitted changes detected. Stash them before continuing?",
      "Stash and Continue",
      "Cancel"
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it("stashes dirty work with untracked files and pops it after the operation", async () => {
    const calls: string[] = [];
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      calls.push(args.join(" "));
      return args[0] === "status" ? " M src/file.ts\n?? new-file.ts\n" : "";
    });
    const operation = vi.fn(async () => {
      calls.push("operation");
      return { message: "pulled", status: "ok" as const };
    });
    const service = new SafetyService({ gitRaw });

    await expect(service.runWithAutoStash("/repo", "always", operation)).resolves.toEqual({
      message: "pulled",
      status: "ok"
    });

    expect(calls).toEqual([
      "status --porcelain",
      "stash push --include-untracked -m GUI Git History auto stash",
      "operation",
      "stash pop"
    ]);
  });
});
