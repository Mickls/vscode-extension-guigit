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
    expect(executeCommand).toHaveBeenCalledWith("vscode.diff", "src/file.ts:before", "src/file.ts:after", "file.ts (commit)", {
      preview: true,
      viewColumn: 1
    });
  });

  it("creates diff virtual documents with the original file path for language detection", async () => {
    const documentNames: string[] = [];
    const service = new DiffService({
      executeCommand: vi.fn(),
      gitRaw: async (_repositoryRoot, args) => (args[3] === "commit" ? "parent" : "content"),
      virtualDocuments: {
        createDocument: (content, fileName) => {
          documentNames.push(fileName);
          return `${fileName}:${content}`;
        }
      }
    });

    await service.openCommitFileDiff("/repo", "commit", "src/components/App.tsx");

    expect(documentNames).toEqual(["src/components/App.tsx", "src/components/App.tsx"]);
  });

  it("loads normal commit diff sides in parallel after resolving the first parent", async () => {
    const oldContent = deferred<string>();
    let newContentRequested = false;
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args[3] === "commit") {
        return "parent";
      }

      if (args[1] === "parent:src/file.ts") {
        return oldContent.promise;
      }

      newContentRequested = true;
      return "after";
    });
    const service = createService({ gitRaw });

    const result = service.openCommitFileDiff("/repo", "commit", "src/file.ts");
    await Promise.resolve();
    await Promise.resolve();

    expect(newContentRequested).toBe(true);

    oldContent.resolve("before");
    await expect(result).resolves.toEqual({ status: "ok", message: "Opened diff for src/file.ts" });
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

    expect(executeCommand).toHaveBeenCalledWith("vscode.diff", "src/file.ts:", "src/file.ts:created", "file.ts (initial) - Initial Commit", {
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

    expect(executeCommand).toHaveBeenNthCalledWith(1, "vscode.diff", "added.ts:", "added.ts:added", "added.ts (from..to) - New File", {
      preview: true,
      viewColumn: 1
    });
    expect(executeCommand).toHaveBeenNthCalledWith(2, "vscode.diff", "deleted.ts:deleted", "deleted.ts:", "deleted.ts (from..to) - Deleted File", {
      preview: true,
      viewColumn: 1
    });
  });

  it("reports unchanged compare files without using VS Code notifications", async () => {
    const executeCommand = vi.fn();
    const showInformationMessage = vi.fn();
    const service = createService({
      executeCommand,
      gitRaw: async () => "same"
    });

    const result = await service.openCompareFileDiff("/repo", "from", "to", "unchanged.ts");

    expect(result).toEqual({ status: "ok", message: "No changes in unchanged.ts between these commits" });
    expect(showInformationMessage).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

function createService(input: {
  executeCommand?: (...args: readonly unknown[]) => Thenable<void> | void;
  gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
}): DiffService<string> {
  return new DiffService({
    executeCommand: async (command, ...args) => {
      await input.executeCommand?.(command, ...args);
    },
    gitRaw: input.gitRaw,
    virtualDocuments: {
      createDocument: (content, fileName) => `${fileName}:${content}`
    }
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}
