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

  it("records a conflict session and waits for explicit continuation before popping the auto stash", async () => {
    const calls: string[] = [];
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      calls.push(args.join(" "));
      if (args.join(" ") === "status --porcelain") {
        return calls.includes("operation") && !calls.includes("commit --no-edit") ? "UU src/file.ts\n" : " M src/file.ts\n";
      }

      return "";
    });
    const operation = vi.fn(async () => {
      calls.push("operation");
      throw new Error("CONFLICT (content): Merge conflict in src/file.ts");
    });
    const service = new SafetyService({ gitRaw });

    await expect(
      service.runWithAutoStash("/repo", "always", operation, {
        abortArgs: ["merge", "--abort"],
        continueArgs: ["commit", "--no-edit"],
        operationKind: "merge",
        operationName: "Pull"
      })
    ).resolves.toEqual({
      message: "Pull has conflicts. Resolve all conflicted files, stage them, then continue from GUI Git History.",
      status: "conflict"
    });

    expect(calls).toEqual([
      "status --porcelain",
      "stash push --include-untracked -m GUI Git History auto stash",
      "operation",
      "status --porcelain"
    ]);

    await expect(service.continueOperation("/repo")).resolves.toEqual({
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
  });

  it("aborts the active conflict session and restores the auto stash", async () => {
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
    const service = new SafetyService({ gitRaw });

    await expect(
      service.runWithAutoStash("/repo", "always", operation, {
        abortArgs: ["merge", "--abort"],
        continueArgs: ["commit", "--no-edit"],
        operationKind: "merge",
        operationName: "Pull"
      })
    ).resolves.toEqual({
      message: "Pull has conflicts. Resolve all conflicted files, stage them, then continue from GUI Git History.",
      status: "conflict"
    });

    await expect(service.abortOperation("/repo")).resolves.toEqual({
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

  it("keeps the conflict session active when continue is clicked before conflicts are resolved", async () => {
    const calls: string[] = [];
    let statusCalls = 0;
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      calls.push(args.join(" "));
      if (args.join(" ") === "status --porcelain") {
        statusCalls += 1;
        return statusCalls === 1 ? " M app.txt\n" : "UU app.txt\n";
      }

      if (args.join(" ") === "-c core.editor=true rebase --continue") {
        if (calls.filter((call) => call === "-c core.editor=true rebase --continue").length === 1) {
          throw new Error("app.txt: needs merge");
        }

        return "";
      }

      return "";
    });
    const operation = vi.fn(async () => {
      calls.push("operation");
      throw new Error("CONFLICT (content): Merge conflict in app.txt");
    });
    const service = new SafetyService({ gitRaw });

    await expect(
      service.runWithAutoStash("/repo", "always", operation, {
        abortArgs: ["rebase", "--abort"],
        continueArgs: ["-c", "core.editor=true", "rebase", "--continue"],
        operationKind: "rebase",
        operationName: "Rebase"
      })
    ).resolves.toEqual({
      message: "Rebase has conflicts. Resolve all conflicted files, stage them, then continue from GUI Git History.",
      status: "conflict"
    });

    await expect(service.continueOperation("/repo")).resolves.toEqual({
      message: "Rebase still has unresolved conflicts. Resolve all conflicted files and stage them, then continue.",
      status: "conflict"
    });
    await expect(service.continueOperation("/repo")).resolves.toEqual({
      message: "Rebase conflicts resolved",
      status: "ok"
    });
    expect(calls).toEqual([
      "status --porcelain",
      "stash push --include-untracked -m GUI Git History auto stash",
      "operation",
      "status --porcelain",
      "-c core.editor=true rebase --continue",
      "status --porcelain",
      "-c core.editor=true rebase --continue",
      "stash pop"
    ]);
  });

  it("keeps the conflict session active when continue fails while rebase is still in progress", async () => {
    const calls: string[] = [];
    let statusCalls = 0;
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      calls.push(args.join(" "));
      if (args.join(" ") === "status --porcelain") {
        statusCalls += 1;
        if (statusCalls === 1) {
          return " M app.txt\n";
        }

        return statusCalls === 2 ? "UU app.txt\n" : "";
      }

      if (args.join(" ") === "-c core.editor=true rebase --continue") {
        if (calls.filter((call) => call === "-c core.editor=true rebase --continue").length === 1) {
          throw new Error("No changes - did you forget to use 'git add'?");
        }

        return "";
      }

      if (args.join(" ") === "status --untracked-files=no") {
        return "interactive rebase in progress; onto abc123\n";
      }

      return "";
    });
    const operation = vi.fn(async () => {
      calls.push("operation");
      throw new Error("CONFLICT (content): Merge conflict in app.txt");
    });
    const service = new SafetyService({ gitRaw });

    await expect(
      service.runWithAutoStash("/repo", "always", operation, {
        abortArgs: ["rebase", "--abort"],
        continueArgs: ["-c", "core.editor=true", "rebase", "--continue"],
        operationKind: "rebase",
        operationName: "Rebase"
      })
    ).resolves.toEqual({
      message: "Rebase has conflicts. Resolve all conflicted files, stage them, then continue from GUI Git History.",
      status: "conflict"
    });

    await expect(service.continueOperation("/repo")).resolves.toEqual({
      message: "Rebase is still in progress. Do not create a manual commit; resolve conflicts, stage the files, then continue from GUI Git History.",
      status: "conflict"
    });
    await expect(service.continueOperation("/repo")).resolves.toEqual({
      message: "Rebase conflicts resolved",
      status: "ok"
    });
    expect(calls).toEqual([
      "status --porcelain",
      "stash push --include-untracked -m GUI Git History auto stash",
      "operation",
      "status --porcelain",
      "-c core.editor=true rebase --continue",
      "status --porcelain",
      "status --untracked-files=no",
      "-c core.editor=true rebase --continue",
      "stash pop"
    ]);
  });
});
