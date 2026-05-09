import { simpleGit } from "simple-git";
import { window } from "vscode";
import type { OperationResultViewModel, RemoteViewModel } from "../rpc/contract";

export interface RemoteServiceInput {
  gitRaw?: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  showWarningMessage?: (
    message: string,
    options: { modal: boolean },
    ...items: readonly string[]
  ) => Thenable<string | undefined>;
}

export class RemoteService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly showWarningMessage: (
    message: string,
    options: { modal: boolean },
    ...items: readonly string[]
  ) => Thenable<string | undefined>;

  public constructor(input: RemoteServiceInput = {}) {
    this.gitRaw = input.gitRaw ?? ((repositoryRoot, args) => simpleGit(repositoryRoot).raw([...args]));
    this.showWarningMessage =
      input.showWarningMessage ??
      ((message, options, ...items) => window.showWarningMessage(message, options, ...items));
  }

  public async listRemotes(repositoryRoot: string): Promise<readonly RemoteViewModel[]> {
    return parseRemoteVerbose(await this.gitRaw(repositoryRoot, ["remote", "-v"]));
  }

  public async addRemote(repositoryRoot: string, name: string, url: string): Promise<OperationResultViewModel> {
    validateRemoteUrl(url);
    await this.gitRaw(repositoryRoot, ["remote", "add", name, url]);
    return {
      message: `Added remote ${name}`,
      status: "ok"
    };
  }

  public async updateRemote(repositoryRoot: string, name: string, url: string): Promise<OperationResultViewModel> {
    validateRemoteUrl(url);
    await this.gitRaw(repositoryRoot, ["remote", "set-url", name, url]);
    await this.gitRaw(repositoryRoot, ["remote", "set-url", "--push", name, url]);
    return {
      message: `Updated remote ${name}`,
      status: "ok"
    };
  }

  public async deleteRemote(repositoryRoot: string, name: string): Promise<OperationResultViewModel> {
    const choice = await this.showWarningMessage(`Remove remote ${name}?`, { modal: true }, "Remove Remote");
    if (choice !== "Remove Remote") {
      return {
        message: `Remove remote ${name} cancelled`,
        status: "cancelled"
      };
    }

    await this.gitRaw(repositoryRoot, ["remote", "remove", name]);
    return {
      message: `Removed remote ${name}`,
      status: "ok"
    };
  }
}

function validateRemoteUrl(url: string): void {
  if (!url.startsWith("git@") && !url.startsWith("https://")) {
    throw new Error("Remote URL must start with git@ or https://");
  }
}

function parseRemoteVerbose(output: string): readonly RemoteViewModel[] {
  const remotesByName = new Map<string, { fetchUrl?: string; pushUrl?: string }>();
  for (const line of output.split("\n").filter(Boolean)) {
    const match = /^(?<name>\S+)\s+(?<url>.+)\s+\((?<direction>fetch|push)\)$/.exec(line);
    const groups = match!.groups as { direction: "fetch" | "push"; name: string; url: string };
    const remote = remotesByName.get(groups.name) ?? {};
    if (groups.direction === "fetch") {
      remote.fetchUrl = groups.url;
    } else {
      remote.pushUrl = groups.url;
    }
    remotesByName.set(groups.name, remote);
  }

  return [...remotesByName.entries()].map(([name, remote]) => ({
    fetchUrl: remote.fetchUrl!,
    name,
    pushUrl: remote.pushUrl ?? remote.fetchUrl!
  }));
}
