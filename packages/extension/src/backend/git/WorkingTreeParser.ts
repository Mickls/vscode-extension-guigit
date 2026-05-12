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

export function parseStashFiles(
  nameStatusOutput: string,
  numstatOutput: string
): readonly WorkingTreeFileChangeViewModel[] {
  const files = new Map<string, WorkingTreeFileChangeViewModel>();

  for (const line of nameStatusOutput.split("\n").filter(Boolean)) {
    const columns = line.split("\t");
    const statusCode = columns[0]!.charAt(0);
    const path = columns.at(-1)!;
    files.set(path, {
      area: "stash",
      binary: false,
      deletions: 0,
      insertions: 0,
      path,
      previousPath: statusCode === "R" || statusCode === "C" ? columns[1] : undefined,
      status: mapStatusCode(statusCode)
    });
  }

  for (const line of numstatOutput.split("\n").filter(Boolean)) {
    const columns = line.split("\t");
    const numstatPath = columns[2]!;
    const parsedPath = files.has(numstatPath) ? { path: numstatPath } : parseNumstatPath(numstatPath);
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
    return { path: unquotePorcelainPath(path) };
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

  const bytes: number[] = [];
  for (let index = 1; index < path.length - 1; index += 1) {
    const character = path.charAt(index);
    if (character === "\\") {
      const nextCharacter = path.charAt(index + 1);
      if (isOctalDigit(nextCharacter)) {
        const octal = path.slice(index + 1, index + 4);
        bytes.push(Number.parseInt(octal, 8));
        index += 3;
        continue;
      }

      bytes.push(escapedByte(nextCharacter));
      index += 1;
      continue;
    }

    bytes.push(...new TextEncoder().encode(character));
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

function isOctalDigit(character: string): boolean {
  return character >= "0" && character <= "7";
}

function parseNumstatPath(path: string): Pick<WorkingTreeFileChangeViewModel, "path" | "previousPath"> {
  const renameMatch = /^(.*)\{(.+) => (.+)\}(.*)$/.exec(path);
  if (renameMatch) {
    const prefix = renameMatch[1]!;
    const previousName = renameMatch[2]!;
    const nextName = renameMatch[3]!;
    const suffix = renameMatch[4]!;

    return {
      path: `${prefix}${nextName}${suffix}`,
      previousPath: `${prefix}${previousName}${suffix}`
    };
  }

  const separatorIndex = path.indexOf(" => ");
  if (separatorIndex !== -1) {
    return {
      path: path.slice(separatorIndex + 4),
      previousPath: path.slice(0, separatorIndex)
    };
  }

  return { path };
}

function escapedByte(character: string): number {
  if (character === "a") {
    return 7;
  }

  if (character === "b") {
    return 8;
  }

  if (character === "t") {
    return 9;
  }

  if (character === "n") {
    return 10;
  }

  if (character === "v") {
    return 11;
  }

  if (character === "f") {
    return 12;
  }

  if (character === "r") {
    return 13;
  }

  return character.charCodeAt(0);
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
