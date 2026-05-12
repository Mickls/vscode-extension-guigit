import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { RepositoryService } from "../../src/backend/git/RepositoryService";
import { WorkspaceStateService } from "../../src/state/WorkspaceStateService";

const tempRoots: string[] = [];

describe("RepositoryService", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
    tempRoots.length = 0;
  });

  it("discovers workspace repositories and parent repositories for nested workspaces", async () => {
    const root = await createTempRoot();
    const workspace = join(root, "workspace");
    const nestedWorkspace = join(root, "parent", "packages", "app");
    const childRepo = join(workspace, "packages", "tool");

    await markGitRepository(workspace);
    await markGitRepository(childRepo);
    await markGitRepository(join(root, "parent"));
    await mkdir(nestedWorkspace, { recursive: true });

    const service = new RepositoryService({
      activeEditorPath: () => undefined,
      state: new WorkspaceStateService(),
      workspaceFolders: [workspace, nestedWorkspace]
    });

    const repositories = await service.discoverRepositories();

    expect(repositories.map((repository) => repository.rootPath)).toEqual([
      workspace,
      join(root, "parent"),
      childRepo
    ]);
  });

  it("switches the current repository to the active editor repository", async () => {
    const root = await createTempRoot();
    const workspace = join(root, "workspace");
    const childRepo = join(workspace, "packages", "tool");

    await markGitRepository(workspace);
    await markGitRepository(childRepo);
    await writeFile(join(childRepo, "index.ts"), "export {};\n");

    const state = new WorkspaceStateService();
    const service = new RepositoryService({
      activeEditorPath: () => join(childRepo, "index.ts"),
      state,
      workspaceFolders: [workspace]
    });

    await service.discoverRepositories();
    const current = service.switchToActiveEditorRepository();

    expect(current?.rootPath).toBe(childRepo);
    expect(state.getCurrentRepositoryId()).toBe(childRepo);
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gui-git-history-"));
  tempRoots.push(root);
  return root;
}

async function markGitRepository(rootPath: string): Promise<void> {
  await mkdir(join(rootPath, ".git"), { recursive: true });
}
