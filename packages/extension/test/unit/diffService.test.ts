import { describe, expect, it, vi } from "vitest";
import { DiffService } from "../../src/backend/vscode/DiffService";

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn()
  },
  ViewColumn: {
    One: 1
  },
  window: {
    showInformationMessage: vi.fn()
  }
}));

describe("DiffService", () => {
  it("opens normal commit file diffs against the first parent", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args[3] === "commit") {
        return "parent other-parent";
      }

      if (args[1] === "parent:src/file.ts") {
        return "before";
      }

      return "after";
    });
    const executeCommand = vi.fn();
    const service = createService({ executeCommand, gitRaw });

    const result = await service.openCommitFileDiff("/repo", "commit", "src/file.ts");

    expect(result).toEqual({ status: "ok", message: "Opened diff for src/file.ts" });
    expect(executeCommand).toHaveBeenCalledWith("vscode.diff", "file.ts (commit^):before", "file.ts (commit):after", "file.ts (commit)", {
      preview: true,
      viewColumn: 1
    });
  });

  it("opens initial commit file diffs against an empty document", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args[3] === "initial") {
        return "";
      }

      return "created";
    });
    const executeCommand = vi.fn();
    const service = createService({ executeCommand, gitRaw });

    await service.openCommitFileDiff("/repo", "initial", "src/file.ts");

    expect(executeCommand).toHaveBeenCalledWith("vscode.diff", "file.ts (empty):", "file.ts (initial):created", "file.ts (initial) - Initial Commit", {
      preview: true,
      viewColumn: 1
    });
  });

  it("opens compare diffs for added and deleted files", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args[1] === "from:added.ts" || args[1] === "to:deleted.ts") {
        throw new Error("missing");
      }

      return args[1] === "to:added.ts" ? "added" : "deleted";
    });
    const executeCommand = vi.fn();
    const service = createService({ executeCommand, gitRaw });

    await service.openCompareFileDiff("/repo", "from", "to", "added.ts");
    await service.openCompareFileDiff("/repo", "from", "to", "deleted.ts");

    expect(executeCommand).toHaveBeenNthCalledWith(1, "vscode.diff", "added.ts (empty):", "added.ts (to):added", "added.ts (from..to) - New File", {
      preview: true,
      viewColumn: 1
    });
    expect(executeCommand).toHaveBeenNthCalledWith(2, "vscode.diff", "deleted.ts (from):deleted", "deleted.ts (deleted):", "deleted.ts (from..to) - Deleted File", {
      preview: true,
      viewColumn: 1
    });
  });

  it("reports unchanged compare files without opening a diff editor", async () => {
    const executeCommand = vi.fn();
    const showInformationMessage = vi.fn();
    const service = createService({
      executeCommand,
      gitRaw: async () => "same",
      showInformationMessage
    });

    const result = await service.openCompareFileDiff("/repo", "from", "to", "unchanged.ts");

    expect(result).toEqual({ status: "ok", message: "No changes in unchanged.ts between these commits" });
    expect(showInformationMessage).toHaveBeenCalledWith("No changes in unchanged.ts between these commits");
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

function createService(input: {
  executeCommand?: (...args: readonly unknown[]) => Thenable<void> | void;
  gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  showInformationMessage?: (message: string) => Thenable<void> | void;
}): DiffService<string> {
  return new DiffService({
    executeCommand: async (command, ...args) => {
      await input.executeCommand?.(command, ...args);
    },
    gitRaw: input.gitRaw,
    showInformationMessage: async (message) => {
      await input.showInformationMessage?.(message);
    },
    virtualDocuments: {
      createDocument: (content, fileName) => `${fileName}:${content}`
    }
  });
}
