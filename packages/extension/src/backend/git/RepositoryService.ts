import { readdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep, join } from "node:path";
import type { RepositoryViewModel } from "../rpc/contract";
import type { WorkspaceStateService } from "../../state/WorkspaceStateService";

export interface RepositoryServiceInput {
  activeEditorPath: () => string | undefined;
  state: WorkspaceStateService;
  workspaceFolders: readonly string[];
}

export class RepositoryService {
  private repositories: RepositoryViewModel[] = [];
  private readonly activeEditorPath: () => string | undefined;
  private readonly state: WorkspaceStateService;
  private readonly workspaceFolders: readonly string[];

  public constructor(input: RepositoryServiceInput) {
    this.activeEditorPath = input.activeEditorPath;
    this.state = input.state;
    this.workspaceFolders = input.workspaceFolders;
  }

  public async discoverRepositories(): Promise<readonly RepositoryViewModel[]> {
    const seenRootPaths = new Set<string>();
    const repositories: RepositoryViewModel[] = [];

    for (const workspaceFolder of this.workspaceFolders) {
      await this.collectRepositoriesFromWorkspace(workspaceFolder, seenRootPaths, repositories);
    }

    this.repositories = repositories.sort((a, b) => {
      const scoreDiff = this.repositoryScore(a.rootPath) - this.repositoryScore(b.rootPath);
      return scoreDiff === 0 ? a.rootPath.localeCompare(b.rootPath) : scoreDiff;
    });

    if (!this.state.getCurrentRepositoryId() && this.repositories[0]) {
      this.state.setCurrentRepositoryId(this.repositories[0].id);
    }

    return this.repositories;
  }

  public getCurrentRepository(): RepositoryViewModel | undefined {
    return this.repositories.find((repository) => repository.id === this.state.getCurrentRepositoryId());
  }

  public switchToActiveEditorRepository(): RepositoryViewModel | undefined {
    const activePath = this.activeEditorPath();
    if (!activePath) {
      return this.getCurrentRepository();
    }

    const containingRepositories = this.repositories
      .filter((repository) => isPathInside(activePath, repository.rootPath))
      .sort((a, b) => b.rootPath.length - a.rootPath.length);

    const repository = containingRepositories[0];
    if (repository) {
      this.state.setCurrentRepositoryId(repository.id);
    }

    return repository;
  }

  private async collectRepositoriesFromWorkspace(
    workspaceFolder: string,
    seenRootPaths: Set<string>,
    repositories: RepositoryViewModel[]
  ): Promise<void> {
    await this.searchForRepositories(workspaceFolder, seenRootPaths, repositories, 0);
    await this.searchParentRepositories(workspaceFolder, seenRootPaths, repositories);
  }

  private async searchForRepositories(
    searchPath: string,
    seenRootPaths: Set<string>,
    repositories: RepositoryViewModel[],
    depth: number
  ): Promise<void> {
    if (depth > 3) {
      return;
    }

    if (await isGitRepository(searchPath)) {
      addRepository(searchPath, seenRootPaths, repositories);
    }

    let entries = await readdir(searchPath, { withFileTypes: true });
    entries = entries.filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        entry.name !== "dist" &&
        entry.name !== "build" &&
        entry.name !== "target" &&
        entry.name !== "vendor"
    );

    await Promise.all(
      entries.map((entry) => this.searchForRepositories(join(searchPath, entry.name), seenRootPaths, repositories, depth + 1))
    );
  }

  private async searchParentRepositories(
    workspaceFolder: string,
    seenRootPaths: Set<string>,
    repositories: RepositoryViewModel[]
  ): Promise<void> {
    let currentPath = resolve(workspaceFolder);

    while (dirname(currentPath) !== currentPath) {
      currentPath = dirname(currentPath);

      if (await isGitRepository(currentPath)) {
        addRepository(currentPath, seenRootPaths, repositories);
      }
    }
  }

  private repositoryScore(repositoryRoot: string): number {
    const repositoryPath = resolve(repositoryRoot);
    const scores = this.workspaceFolders.map((workspaceFolder) => {
      const workspacePath = resolve(workspaceFolder);

      if (repositoryPath === workspacePath) {
        return 0;
      }

      if (isPathInside(repositoryPath, workspacePath)) {
        return pathDistance(relative(workspacePath, repositoryPath));
      }

      if (isPathInside(workspacePath, repositoryPath)) {
        return pathDistance(relative(repositoryPath, workspacePath));
      }

      return repositoryPath.split(sep).length + workspacePath.split(sep).length;
    });

    return Math.min(...scores);
  }
}

async function isGitRepository(rootPath: string): Promise<boolean> {
  try {
    const gitStat = await stat(join(rootPath, ".git"));
    return gitStat.isDirectory() || gitStat.isFile();
  } catch {
    return false;
  }
}

function addRepository(rootPath: string, seenRootPaths: Set<string>, repositories: RepositoryViewModel[]): void {
  const resolvedRoot = resolve(rootPath);
  if (seenRootPaths.has(resolvedRoot)) {
    return;
  }

  seenRootPaths.add(resolvedRoot);
  repositories.push({
    id: resolvedRoot,
    name: basename(resolvedRoot),
    rootPath: resolvedRoot
  });
}

function isPathInside(targetPath: string, rootPath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function pathDistance(relativePath: string): number {
  return relativePath.split(sep).filter(Boolean).length;
}
