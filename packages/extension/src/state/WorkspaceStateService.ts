import type { Memento } from "vscode";

type AdvancedGitSelectionKey =
  | "advancedPullBranch"
  | "advancedPullMode"
  | "advancedPushBranch"
  | "advancedPushMode";

export interface WorkspaceStateServiceInput {
  storage?: Pick<Memento, "get" | "update">;
}

export class WorkspaceStateService {
  private readonly advancedGitSelections = new Map<string, string>();
  private currentRepositoryId: string | undefined;
  private readonly storage: Pick<Memento, "get" | "update"> | undefined;

  public constructor(input: WorkspaceStateServiceInput = {}) {
    this.storage = input.storage;
  }

  public getCurrentRepositoryId(): string | undefined {
    return this.currentRepositoryId;
  }

  public setCurrentRepositoryId(repositoryId: string): void {
    this.currentRepositoryId = repositoryId;
  }

  public getAdvancedGitSelection(repositoryRoot: string, key: AdvancedGitSelectionKey): string | undefined {
    const stateKey = advancedGitSelectionKey(repositoryRoot, key);
    return this.storage?.get<string>(stateKey) ?? this.advancedGitSelections.get(stateKey);
  }

  public async setAdvancedGitSelection(
    repositoryRoot: string,
    key: AdvancedGitSelectionKey,
    value: string
  ): Promise<void> {
    const stateKey = advancedGitSelectionKey(repositoryRoot, key);
    this.advancedGitSelections.set(stateKey, value);
    await this.storage?.update(stateKey, value);
  }
}

function advancedGitSelectionKey(repositoryRoot: string, key: AdvancedGitSelectionKey): string {
  return `advancedGit.${repositoryRoot}.${key}`;
}
