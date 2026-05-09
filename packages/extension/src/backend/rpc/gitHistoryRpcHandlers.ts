import type { BranchService } from "../git/BranchService";
import type { CommitService } from "../git/CommitService";
import type { FileService } from "../git/FileService";
import type { GitService } from "../git/GitService";
import type { GraphService } from "../git/GraphService";
import type { RepositoryService } from "../git/RepositoryService";
import type { DiffService } from "../vscode/DiffService";
import type { FileHistoryPanel } from "../vscode/FileHistoryPanel";
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
  fileHistoryPanel: Pick<FileHistoryPanel, "openHistory" | "openWorkingFile">;
  gitService: Pick<
    GitService,
    | "abortOperation"
    | "advancedPull"
    | "advancedPush"
    | "cherryPick"
    | "checkout"
    | "clone"
    | "compareCommits"
    | "continueOperation"
    | "copyHash"
    | "createBranchFromCommit"
    | "editCommitMessage"
    | "fetch"
    | "getOperationState"
    | "pull"
    | "push"
    | "pushAllCommitsToHere"
    | "reset"
    | "revert"
    | "squashCommits"
  >;
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
    "files.openWorkingFile": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.fileHistoryPanel.openWorkingFile(repository.rootPath, request.filePath);
    },
    "files.openHistory": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.fileHistoryPanel.openHistory(repository.rootPath, request.filePath);
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
    "git.pull": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.pull(repository.rootPath);
    },
    "git.advancedPull": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.advancedPull(repository.rootPath);
    },
    "git.continueOperation": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.continueOperation(repository.rootPath);
    },
    "git.operationState": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.getOperationState(repository.rootPath);
    },
    "git.abortOperation": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.abortOperation(repository.rootPath);
    },
    "git.push": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.push(repository.rootPath);
    },
    "git.advancedPush": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.advancedPush(repository.rootPath);
    },
    "git.fetch": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.fetch(repository.rootPath);
    },
    "git.clone": (request) => input.gitService.clone(request.targetDirectory, request.url),
    "git.checkout": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.checkout(repository.rootPath, request.branch);
    },
    "git.copyHash": async (request) => input.gitService.copyHash(request.hash),
    "git.cherryPick": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.cherryPick(repository.rootPath, request.hash);
    },
    "git.revert": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.revert(repository.rootPath, request.hash);
    },
    "git.reset": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.reset(repository.rootPath, request.hash, request.mode);
    },
    "git.compareCommits": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.compareCommits(repository.rootPath, request.hashes);
    },
    "git.squashCommits": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.squashCommits(repository.rootPath, request.hashes);
    },
    "git.createBranchFromCommit": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.createBranchFromCommit(repository.rootPath, request.hash);
    },
    "git.pushAllCommitsToHere": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.pushAllCommitsToHere(repository.rootPath, request.hash);
    },
    "git.editCommitMessage": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.editCommitMessage(repository.rootPath, request.hash);
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
