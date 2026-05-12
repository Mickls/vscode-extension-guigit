import { describe, expect, it, vi } from "vitest";
import { RemoteService } from "../../src/backend/git/RemoteService";

vi.mock("vscode", () => ({
  window: {
    showWarningMessage: vi.fn()
  }
}));

describe("RemoteService", () => {
  it("loads remote details from git", async () => {
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        expect(args).toEqual(["remote", "-v"]);
        return [
          "origin\thttps://example.com/repo.git (fetch)",
          "origin\tgit@example.com:repo.git (push)",
          "upstream\thttps://example.com/upstream.git (fetch)",
          "upstream\thttps://example.com/upstream.git (push)"
        ].join("\n");
      }
    });

    await expect(service.listRemotes("/repo")).resolves.toEqual([
      {
        fetchUrl: "https://example.com/repo.git",
        name: "origin",
        pushUrl: "git@example.com:repo.git"
      },
      {
        fetchUrl: "https://example.com/upstream.git",
        name: "upstream",
        pushUrl: "https://example.com/upstream.git"
      }
    ]);
  });

  it("adds and updates remotes", async () => {
    const calls: string[] = [];
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
      }
    });

    await expect(service.addRemote("/repo", "upstream", "https://example.com/up.git")).resolves.toEqual({
      message: "Added remote upstream",
      status: "ok"
    });
    await expect(service.updateRemote("/repo", "origin", "https://example.com/new.git")).resolves.toEqual({
      message: "Updated remote origin",
      status: "ok"
    });

    expect(calls).toEqual([
      "remote add upstream https://example.com/up.git",
      "remote set-url origin https://example.com/new.git",
      "remote set-url --push origin https://example.com/new.git"
    ]);
  });

  it("rejects invalid remote URLs before running git commands", async () => {
    const gitRaw = vi.fn().mockResolvedValue("");
    const service = createService({ gitRaw });

    await expect(service.addRemote("/repo", "upstream", "ftp://example.com/repo.git")).rejects.toThrow(
      "Remote URL must start with git@ or https://"
    );
    await expect(service.updateRemote("/repo", "origin", "http://example.com/repo.git")).rejects.toThrow(
      "Remote URL must start with git@ or https://"
    );
    expect(gitRaw).not.toHaveBeenCalled();
  });

  it("removes remotes only after modal confirmation", async () => {
    const calls: string[] = [];
    const showWarningMessage = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce("Remove Remote");
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        return "";
      },
      showWarningMessage
    });

    await expect(service.deleteRemote("/repo", "origin")).resolves.toEqual({
      message: "Remove remote origin cancelled",
      status: "cancelled"
    });
    await expect(service.deleteRemote("/repo", "origin")).resolves.toEqual({
      message: "Removed remote origin",
      status: "ok"
    });

    expect(showWarningMessage).toHaveBeenCalledWith(
      "Remove remote origin?",
      { modal: true },
      "Remove Remote"
    );
    expect(calls).toEqual(["remote remove origin"]);
  });
});

function createService(input: {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  showWarningMessage?: (
    message: string,
    options: { modal: boolean },
    ...items: readonly string[]
  ) => Thenable<string | undefined> | Promise<string | undefined>;
}): RemoteService {
  return new RemoteService({
    gitRaw: input.gitRaw ?? (async () => ""),
    showWarningMessage: input.showWarningMessage
  });
}
