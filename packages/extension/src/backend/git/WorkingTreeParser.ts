import type { StashEntryViewModel, WorkingTreeFileChangeViewModel } from "../rpc/contract";
import { findGitPathSeparator, parseGitNumstatPath, unquoteGitPath } from "./GitPathParser";

export interface PorcelainStatusViewModel {
  staged: readonly WorkingTreeFileChangeViewModel[];
  unstaged: readonly WorkingTreeFileChangeViewModel[];
}

interface NumstatFileStats {
  binary: boolean;
  deletions: number;
  insertions: number;
  path: string;
}

export function parsePorcelainStatus(output: string): PorcelainStatusViewModel {
  const staged: WorkingTreeFileChangeViewModel[] = [];
  const unstaged: WorkingTreeFileChangeViewModel[] = [];

  for (const line of output.split("\n").filter(Boolean)) {
    const indexStatus = line.charAt(0);
    const workTreeStatus = line.charAt(1);
    const path = line.slice(3);

    if (line.startsWith("?? ")) {
      unstaged.push(toFileChange("untracked", path, "A", indexStatus, workTreeStatus));
      continue;
    }

    if (indexStatus !== " ") {
      staged.push(toFileChange("staged", path, indexStatus, indexStatus, workTreeStatus));
    }

    if (workTreeStatus !== " ") {
      unstaged.push(toFileChange("unstaged", path, workTreeStatus, indexStatus, workTreeStatus));
    }
  }

  return { staged, unstaged };
}

export function parseWorkingTreeStatus(
  statusOutput: string,
  stagedNumstatOutput: string,
  unstagedNumstatOutput: string
): PorcelainStatusViewModel {
  const status = parsePorcelainStatus(statusOutput);

  return {
    staged: mergeNumstat(status.staged, stagedNumstatOutput),
    unstaged: mergeNumstat(status.unstaged, unstagedNumstatOutput)
  };
}

export function parseStashList(output: string): readonly StashEntryViewModel[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(": ");
      const ref = line.slice(0, separatorIndex);
      const message = line.slice(separatorIndex + 2);

      return {
        branch: parseStashBranch(message),
        date: "",
        message,
        ref
      };
    });
}

export function parseStashFiles(
  nameStatusOutput: string,
  numstatOutput: string
): readonly WorkingTreeFileChangeViewModel[] {
  const files = new Map<string, WorkingTreeFileChangeViewModel>();

  for (const line of nameStatusOutput.split("\n").filter(Boolean)) {
    const columns = line.split("\t");
    const statusCode = columns[0]!.charAt(0);
    const path = unquoteGitPath(columns.at(-1)!);
    files.set(path, {
      area: "stash",
      binary: false,
      deletions: 0,
      insertions: 0,
      path,
      previousPath: statusCode === "R" || statusCode === "C" ? unquoteGitPath(columns[1]!) : undefined,
      status: mapStatusCode(statusCode)
    });
  }

  const knownPaths = knownPathsForFiles([...files.values()]);
  for (const line of numstatOutput.split("\n").filter(Boolean)) {
    const columns = line.split("\t");
    const numstatPath = columns[2]!;
    const parsedPath = parseGitNumstatPath(numstatPath, knownPaths);
    const existing = files.get(parsedPath.path);
    files.set(parsedPath.path, {
      area: "stash",
      binary: columns[0] === "-",
      deletions: columns[1] === "-" ? 0 : Number(columns[1]),
      insertions: columns[0] === "-" ? 0 : Number(columns[0]),
      path: parsedPath.path,
      previousPath: existing?.previousPath ?? parsedPath.previousPath,
      status: existing?.status ?? "modified"
    });
  }

  return [...files.values()];
}

function mergeNumstat(
  files: readonly WorkingTreeFileChangeViewModel[],
  numstatOutput: string
): readonly WorkingTreeFileChangeViewModel[] {
  const stats = parseNumstat(numstatOutput, files);
  const statsByPath = new Map(stats.map((item) => [item.path, item]));

  return files.map((file) => {
    const stat = statsByPath.get(file.path) ?? (file.previousPath ? statsByPath.get(file.previousPath) : undefined);
    if (!stat) {
      return file;
    }

    return {
      ...file,
      binary: stat.binary,
      deletions: stat.deletions,
      insertions: stat.insertions
    };
  });
}

function parseNumstat(
  output: string,
  files: readonly WorkingTreeFileChangeViewModel[]
): readonly NumstatFileStats[] {
  const knownPaths = knownPathsForFiles(files);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const columns = line.split("\t");
      const numstatPath = columns[2]!;
      const parsedPath = parseGitNumstatPath(numstatPath, knownPaths);

      return {
        binary: columns[0] === "-" && columns[1] === "-",
        deletions: columns[1] === "-" ? 0 : Number(columns[1]),
        insertions: columns[0] === "-" ? 0 : Number(columns[0]),
        path: parsedPath.path
      };
    });
}

function toFileChange(
  area: WorkingTreeFileChangeViewModel["area"],
  path: string,
  statusCode: string,
  indexStatus: string,
  workTreeStatus: string
): WorkingTreeFileChangeViewModel {
  const parsedPath = parseStatusPath(statusCode, path, indexStatus, workTreeStatus);

  return {
    area,
    binary: false,
    deletions: 0,
    insertions: 0,
    path: parsedPath.path,
    previousPath: parsedPath.previousPath,
    status: mapStatusCode(statusCode)
  };
}

function parseStatusPath(
  statusCode: string,
  path: string,
  indexStatus: string,
  workTreeStatus: string
): Pick<WorkingTreeFileChangeViewModel, "path" | "previousPath"> {
  if (![indexStatus, workTreeStatus].some((status) => status === "R" || status === "C")) {
    return { path: unquoteGitPath(path) };
  }

  const parsedPath = parseRenameOrCopyPath(path);
  if (statusCode !== "R" && statusCode !== "C") {
    return { path: parsedPath.path };
  }

  return parsedPath;
}

function parseRenameOrCopyPath(path: string): Pick<WorkingTreeFileChangeViewModel, "path" | "previousPath"> {
  const separatorIndex = findGitPathSeparator(path, " -> ");
  if (separatorIndex === -1) {
    throw new Error("Rename or copy path is missing separator");
  }

  return {
    path: unquoteGitPath(path.slice(separatorIndex + 4)),
    previousPath: unquoteGitPath(path.slice(0, separatorIndex))
  };
}

function mapStatusCode(statusCode: string): WorkingTreeFileChangeViewModel["status"] {
  if (statusCode === "A") {
    return "added";
  }

  if (statusCode === "D") {
    return "deleted";
  }

  if (statusCode === "R") {
    return "renamed";
  }

  if (statusCode === "C") {
    return "copied";
  }

  return "modified";
}

function knownPathsForFiles(files: readonly WorkingTreeFileChangeViewModel[]): ReadonlySet<string> {
  return new Set(files.flatMap((file) => [file.path, file.previousPath].filter((path) => path !== undefined)));
}

function parseStashBranch(message: string): string {
  const wipMatch = /^WIP on ([^:]+):/.exec(message);
  if (wipMatch) {
    return wipMatch[1]!;
  }

  const onMatch = /^On ([^:]+):/.exec(message);
  if (onMatch) {
    return onMatch[1]!;
  }

  return "";
}
