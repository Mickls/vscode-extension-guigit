import type { StashEntryViewModel, WorkingTreeFileChangeViewModel } from "../rpc/contract";

export interface PorcelainStatusViewModel {
  staged: readonly WorkingTreeFileChangeViewModel[];
  unstaged: readonly WorkingTreeFileChangeViewModel[];
}

export function parsePorcelainStatus(output: string): PorcelainStatusViewModel {
  const staged: WorkingTreeFileChangeViewModel[] = [];
  const unstaged: WorkingTreeFileChangeViewModel[] = [];

  for (const line of output.split("\n").filter(Boolean)) {
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const path = line.slice(3);

    if (line.startsWith("?? ")) {
      unstaged.push(toFileChange("untracked", path, "A"));
      continue;
    }

    if (indexStatus !== " ") {
      staged.push(toFileChange("staged", path, indexStatus));
    }

    if (workTreeStatus !== " ") {
      unstaged.push(toFileChange("unstaged", path, workTreeStatus));
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
  statusCode: string
): WorkingTreeFileChangeViewModel {
  return {
    area,
    binary: false,
    deletions: 0,
    insertions: 0,
    path,
    status: mapStatusCode(statusCode)
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

function parseStashBranch(message: string): string {
  const wipMatch = /^WIP on (?<branch>[^:]+):/.exec(message);
  if (wipMatch) {
    return wipMatch.groups!.branch;
  }

  const onMatch = /^On (?<branch>[^:]+):/.exec(message);
  if (onMatch) {
    return onMatch.groups!.branch;
  }

  return "";
}
