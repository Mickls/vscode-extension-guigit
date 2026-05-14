import type { BranchService } from "../git/BranchService";
import type { CommitService } from "../git/CommitService";
import type { CommitMessageAiService } from "../git/CommitMessageAiService";
import type { FileService } from "../git/FileService";
import type { GitService } from "../git/GitService";
import type { GraphService } from "../git/GraphService";
import type { LanguageService } from "../i18n/LanguageService";
import type { ProxyService } from "../git/ProxyService";
import type { RemoteService } from "../git/RemoteService";
import type { RepositoryService } from "../git/RepositoryService";
import type { WorkingTreeService } from "../git/WorkingTreeService";
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
  commitService: Pick<CommitService, "getCurrentUser" | "loadHistory">;
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
    | "init"
    | "getOperationState"
    | "pull"
    | "push"
    | "pushAllCommitsToHere"
    | "reset"
    | "revert"
    | "squashCommits"
  >;
  graphService: Pick<GraphService, "getLayout">;
  languageService: Pick<LanguageService, "changeLanguagePreference" | "getBundle">;
  proxyService: Pick<ProxyService, "configureProxy" | "refreshProxy">;
  remoteService: Pick<RemoteService, "addRemote" | "deleteRemote" | "listRemotes" | "updateRemote">;
  diffService: Pick<DiffService, "openCommitFileDiff" | "openCompareFileDiff" | "openStashFileDiff" | "openWorkingTreeFileDiff">;
  repositoryService: Pick<
    RepositoryService,
    "discoverRepositories" | "getCurrentRepository" | "switchToActiveEditorRepository"
  >;
  commitMessageAiService: Pick<CommitMessageAiService, "generate" | "testProvider">;
  settingsService: Pick<SettingsService, "configureAiProvider" | "getSettings" | "resetAutoStashPreference" | "updateSettings">;
  workingTreeService: Pick<
    WorkingTreeService,
    | "applyStash"
    | "commit"
    | "createStash"
    | "discardFile"
    | "dropStash"
    | "getStashDetails"
    | "load"
    | "popStash"
    | "stageAll"
    | "stageFile"
    | "unstageAll"
    | "unstageFile"
  >;
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

      return input.fileHistoryPanel.openWorkingFile(repository.rootPath, request.filePath, request.hash);
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
    "remotes.list": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return {
        remotes: await input.remoteService.listRemotes(repository.rootPath)
      };
    },
    "remotes.add": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.remoteService.addRemote(repository.rootPath, request.name, request.url);
    },
    "remotes.update": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.remoteService.updateRemote(repository.rootPath, request.name, request.url);
    },
    "remotes.delete": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.remoteService.deleteRemote(repository.rootPath, request.name);
    },
    "settings.get": () => ({
      i18n: input.languageService.getBundle(),
      settings: input.settingsService.getSettings()
    }),
    "settings.update": async (request) => {
      await input.settingsService.updateSettings(request.settings);

      return {
        i18n: input.languageService.getBundle(),
        settings: input.settingsService.getSettings()
      };
    },
    "settings.configureAiProvider": async () => {
      const result = await input.settingsService.configureAiProvider();

      return {
        i18n: input.languageService.getBundle(),
        result,
        settings: input.settingsService.getSettings()
      };
    },
    "settings.resetAutoStash": async () => {
      await input.settingsService.resetAutoStashPreference();

      return {
        message: "Auto stash preference reset to Ask",
        status: "ok"
      };
    },
    "settings.changeLanguage": () => input.languageService.changeLanguagePreference(),
    "settings.testAiProvider": () => input.commitMessageAiService.testProvider(),
    "proxy.configure": () => input.proxyService.configureProxy(),
    "proxy.refresh": () => input.proxyService.refreshProxy(),
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
    "git.init": () => input.gitService.init(),
    "git.clone": () => input.gitService.clone(),
    "git.checkout": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.gitService.checkout(repository.rootPath);
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
    "commitMessage.generate": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.commitMessageAiService.generate(repository.rootPath);
    },
    "workingTree.load": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return {
        workingTree: await input.workingTreeService.load(repository.id, repository.rootPath)
      };
    },
    "workingTree.stageFile": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.stageFile(repository.id, repository.rootPath, request.filePath);
    },
    "workingTree.stageAll": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.stageAll(repository.id, repository.rootPath);
    },
    "workingTree.unstageFile": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.unstageFile(repository.id, repository.rootPath, request.filePath);
    },
    "workingTree.unstageAll": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.unstageAll(repository.id, repository.rootPath);
    },
    "workingTree.discardFile": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.discardFile(repository.id, repository.rootPath, request.filePath);
    },
    "workingTree.commit": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.commit(repository.id, repository.rootPath, request.message);
    },
    "workingTree.openFile": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.fileHistoryPanel.openWorkingFile(repository.rootPath, request.filePath);
    },
    "workingTree.openDiff": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.diffService.openWorkingTreeFileDiff(repository.rootPath, request.filePath, request.kind, request.previousPath);
    },
    "stash.list": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);
      const workingTree = await input.workingTreeService.load(repository.id, repository.rootPath);

      return {
        stashes: workingTree.stashes
      };
    },
    "stash.getDetails": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return {
        stash: await input.workingTreeService.getStashDetails(repository.rootPath, request.stashRef)
      };
    },
    "stash.openDiff": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.diffService.openStashFileDiff(repository.rootPath, request.stashRef, request.filePath, request.previousPath);
    },
    "stash.create": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.createStash(repository.id, repository.rootPath);
    },
    "stash.apply": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.applyStash(repository.id, repository.rootPath, request.stashRef);
    },
    "stash.pop": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.popStash(repository.id, repository.rootPath, request.stashRef);
    },
    "stash.drop": async (request) => {
      const repository = await findRepository(input.repositoryService, request.repositoryId);

      return input.workingTreeService.dropStash(repository.id, repository.rootPath, request.stashRef);
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

      const [branches, currentUser, history] = await Promise.all([
        input.branchService.listBranches(repository.rootPath),
        input.commitService.getCurrentUser(repository.rootPath),
        input.commitService.loadHistory({
          author: request.author,
          branch: request.branch,
          branches: request.branches,
          cursor: request.cursor,
          pageSize: request.pageSize,
          repositoryRoot: repository.rootPath,
          search: request.search
        })
      ]);

      return {
        branches,
        commits: history.commits,
        currentUser,
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
