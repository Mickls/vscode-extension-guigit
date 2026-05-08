import type { BranchService } from "../git/BranchService";
import type { CommitService } from "../git/CommitService";
import type { FileService } from "../git/FileService";
import type { GraphService } from "../git/GraphService";
import type { RepositoryService } from "../git/RepositoryService";
import type { DiffService } from "../vscode/DiffService";
import type { SettingsService } from "../../state/SettingsService";
import type { BranchesViewModel, RepositoryViewModel } from "./contract";
import type { RpcHandlerMap } from "./router";

const emptyBranches: BranchesViewModel = {
  locals: [],
  remotes: []
};

export interface GitHistoryRpcHandlerInput {
  branchService: Pick<BranchService, "listBranches">;
  commitService: Pick<CommitService, "loadHistory">;
  fileService: Pick<FileService, "getCommitDetails" | "getFileChanges">;
  graphService: Pick<GraphService, "getLayout">;
  diffService: Pick<DiffService, "openCommitFileDiff" | "openCompareFileDiff">;
  repositoryService: Pick<
    RepositoryService,
    "discoverRepositories" | "getCurrentRepository" | "switchToActiveEditorRepository"
  >;
  settingsService: Pick<SettingsService, "getSettings" | "updateSettings">;
}

export function createGitHistoryRpcHandlers(input: GitHistoryRpcHandlerInput): RpcHandlerMap {
  return {
    "branches.list": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return {
        branches: await input.branchService.listBranches(repository.rootPath)
      };
    },
    "commits.getDetails": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return {
        commit: await input.fileService.getCommitDetails(repository.rootPath, request.hash)
      };
    },
    "files.getChanges": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.fileService.getFileChanges(repository.rootPath, request.hash, request.mode);
    },
    "graph.getLayout": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return {
        graph: await input.graphService.getLayout(repository.rootPath, request.hashes)
      };
    },
    "diff.openCommitFile": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.diffService.openCommitFileDiff(repository.rootPath, request.hash, request.filePath);
    },
    "diff.openCompareFile": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.diffService.openCompareFileDiff(repository.rootPath, request.fromHash, request.toHash, request.filePath);
    },
    "settings.get": () => ({
      settings: input.settingsService.getSettings()
    }),
    "settings.update": async (request) => {
      await input.settingsService.updateSettings(request.settings);

      return {
        settings: input.settingsService.getSettings()
      };
    },
    "history.load": async (request) => {
      const repositories = await input.repositoryService.discoverRepositories();
      const repository = selectRepository(input.repositoryService, repositories, request.repositoryId);

      if (!repository) {
        return {
          branches: emptyBranches,
          commits: [],
          hasMore: false,
          repositories
        };
      }

      const [branches, history] = await Promise.all([
        input.branchService.listBranches(repository.rootPath),
        input.commitService.loadHistory({
          author: request.author,
          branch: request.branch,
          cursor: request.cursor,
          pageSize: request.pageSize,
          repositoryRoot: repository.rootPath,
          search: request.search
        })
      ]);

      return {
        branches,
        commits: history.commits,
        hasMore: history.hasMore,
        nextCursor: history.nextCursor,
        repositories
      };
    }
  };
}

async function findRepository(
  repositoryService: GitHistoryRpcHandlerInput["repositoryService"],
  repositoryId: string
): Promise<RepositoryViewModel> {
  const repositories = await repositoryService.discoverRepositories();
  const repository = repositories.find((candidate) => candidate.id === repositoryId);
  if (!repository) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  return repository;
}

function selectRepository(
  repositoryService: GitHistoryRpcHandlerInput["repositoryService"],
  repositories: readonly RepositoryViewModel[],
  repositoryId: string | undefined
): RepositoryViewModel | undefined {
  if (repositoryId) {
    return repositories.find((repository) => repository.id === repositoryId);
  }

  return repositoryService.switchToActiveEditorRepository() ?? repositoryService.getCurrentRepository() ?? repositories[0];
}
