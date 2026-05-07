import { describe, expect, it, vi } from "vitest";
import { registerGitHistoryCommands } from "../../src/extension/commands";

describe("git history commands", () => {
  it("registers compatible guigit commands and delegates to backend boundaries", async () => {
    const callbacks = new Map<string, (...args: readonly unknown[]) => unknown>();
    const executeCommand = vi.fn();
    const refresh = vi.fn();
    const revealCommit = vi.fn();
    const showFileHistoryForUri = vi.fn();
    const toggleBlame = vi.fn();

    registerGitHistoryCommands({
      executeCommand,
      logger: {
        debug: vi.fn(),
        info: vi.fn()
      },
      registerCommand: (command, callback) => {
        callbacks.set(command, callback);
        return { dispose: vi.fn() };
      },
      view: {
        refresh,
        revealCommit,
        showFileHistoryForUri
      },
      blame: {
        toggleBlame
      }
    });

    expect([...callbacks.keys()]).toEqual([
      "guigit.showHistory",
      "guigit.refresh",
      "guigit.viewFileHistory",
      "guigit.toggleBlame",
      "guigit.showCommitDetails"
    ]);

    await callbacks.get("guigit.showHistory")!();
    callbacks.get("guigit.refresh")!();
    await callbacks.get("guigit.viewFileHistory")!("file-uri");
    callbacks.get("guigit.toggleBlame")!();
    await callbacks.get("guigit.showCommitDetails")!("abc1234");

    expect(executeCommand).toHaveBeenCalledWith("workbench.view.extension.guigit");
    expect(refresh).toHaveBeenCalledWith("command");
    expect(showFileHistoryForUri).toHaveBeenCalledWith("file-uri");
    expect(toggleBlame).toHaveBeenCalled();
    expect(revealCommit).toHaveBeenCalledWith("abc1234");
  });
});
