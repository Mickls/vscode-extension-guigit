export class WorkspaceStateService {
  private currentRepositoryId: string | undefined;

  public getCurrentRepositoryId(): string | undefined {
    return this.currentRepositoryId;
  }

  public setCurrentRepositoryId(repositoryId: string): void {
    this.currentRepositoryId = repositoryId;
  }
}
