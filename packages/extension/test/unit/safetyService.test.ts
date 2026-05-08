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
    const logs: unknown[] = [];
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      calls.push(args.join(" "));
      return args[0] === "status" ? " M src/file.ts\n?? new-file.ts\n" : "";
    });
    const operation = vi.fn(async () => {
      calls.push("operation");
      return { message: "pulled", status: "ok" as const };
    });
    const service = new SafetyService({
      gitRaw,
      logger: {
        debug: () => undefined,
        info: (_message, context) => logs.push(context)
      }
    });

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
    expect(logs).toEqual([
      { command: "git -C /repo stash push --include-untracked -m GUI Git History auto stash" },
      { command: "git -C /repo stash pop" }
    ]);
  });

  it("waits for conflict resolution before continuing and popping the auto stash", async () => {
    const calls: string[] = [];
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      calls.push(args.join(" "));
      if (args.join(" ") === "status --porcelain") {
        return calls.includes("operation") ? "UU src/file.ts\n" : " M src/file.ts\n";
      }

      return "";
    });
    const operation = vi.fn(async () => {
      calls.push("operation");
      throw new Error("CONFLICT (content): Merge conflict in src/file.ts");
    });
    const showWarningMessage = vi.fn(async () => "Continue");
    const service = new SafetyService({ gitRaw, showWarningMessage });

    await expect(
      service.runWithAutoStash("/repo", "always", operation, {
        abortArgs: ["merge", "--abort"],
        continueArgs: ["commit", "--no-edit"],
        operationName: "Pull"
      })
    ).resolves.toEqual({
      message: "Pull conflicts resolved",
      status: "ok"
    });

    expect(calls).toEqual([
      "status --porcelain",
      "stash push --include-untracked -m GUI Git History auto stash",
      "operation",
      "status --porcelain",
      "commit --no-edit",
      "stash pop"
    ]);
    expect(showWarningMessage).toHaveBeenCalledWith(
      "Pull has conflicts. Resolve them in the working tree, then continue. GUI Git History will finish Pull and restore your stashed changes.",
      "Continue",
      "Abort"
    );
  });

  it("aborts the conflicted operation and restores the auto stash", async () => {
    const calls: string[] = [];
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      calls.push(args.join(" "));
      if (args.join(" ") === "status --porcelain") {
        return calls.includes("operation") ? "UU src/file.ts\n" : " M src/file.ts\n";
      }

      return "";
    });
    const operation = vi.fn(async () => {
      calls.push("operation");
      throw new Error("Automatic merge failed; fix conflicts and then commit the result.");
    });
    const showWarningMessage = vi.fn(async () => "Abort");
    const service = new SafetyService({ gitRaw, showWarningMessage });

    await expect(
      service.runWithAutoStash("/repo", "always", operation, {
        abortArgs: ["merge", "--abort"],
        continueArgs: ["commit", "--no-edit"],
        operationName: "Pull"
      })
    ).resolves.toEqual({
      message: "Pull aborted and stashed changes restored",
      status: "cancelled"
    });

    expect(calls).toEqual([
      "status --porcelain",
      "stash push --include-untracked -m GUI Git History auto stash",
      "operation",
      "status --porcelain",
      "merge --abort",
      "stash pop"
    ]);
  });
});
