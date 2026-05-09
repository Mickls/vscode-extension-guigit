import type { StashEntryViewModel, WorkingTreeFileChangeViewModel } from "../rpc/contract";

export interface PorcelainStatusViewModel {
  staged: readonly WorkingTreeFileChangeViewModel[];
  unstaged: readonly WorkingTreeFileChangeViewModel[];
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
    return { path };
  }

  const parsedPath = parseRenameOrCopyPath(path);
  if (statusCode !== "R" && statusCode !== "C") {
    return { path: parsedPath.path };
  }

  return parsedPath;
}

function parseRenameOrCopyPath(path: string): Pick<WorkingTreeFileChangeViewModel, "path" | "previousPath"> {
  const separatorIndex = findRenameSeparator(path);
  return {
    path: unquotePorcelainPath(path.slice(separatorIndex + 4)),
    previousPath: unquotePorcelainPath(path.slice(0, separatorIndex))
  };
}

function findRenameSeparator(path: string): number {
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < path.length; index += 1) {
    const character = path.charAt(index);

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && path.slice(index, index + 4) === " -> ") {
      return index;
    }
  }

  throw new Error("Rename or copy path is missing separator");
}

function unquotePorcelainPath(path: string): string {
  if (!path.startsWith('"')) {
    return path;
  }

  let unquoted = "";
  for (let index = 1; index < path.length - 1; index += 1) {
    const character = path.charAt(index);
    if (character === "\\") {
      index += 1;
      unquoted += path.charAt(index);
      continue;
    }

    unquoted += character;
  }

  return unquoted;
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
