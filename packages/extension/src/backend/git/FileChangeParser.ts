import type { FileChangeViewModel } from "../rpc/contract";

interface FileStats {
  binary: boolean;
  deletions: number;
  insertions: number;
  path: string;
}

interface FileStatus {
  path: string;
  previousPath?: string;
  status: FileChangeViewModel["status"];
}

export function parseGitFileChanges(numstatOutput: string, nameStatusOutput: string): readonly FileChangeViewModel[] {
  return mergeFileChanges(parseNumstat(numstatOutput), parseNameStatus(nameStatusOutput));
}

function parseNumstat(output: string): readonly FileStats[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [insertions, deletions, path] = line.split("\t");

      return {
        binary: insertions === "-" && deletions === "-",
        deletions: deletions === "-" ? 0 : Number.parseInt(deletions!, 10),
        insertions: insertions === "-" ? 0 : Number.parseInt(insertions!, 10),
        path: path!
      };
    });
}

function parseNameStatus(output: string): readonly FileStatus[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const code = parts[0]!;

      if (code.startsWith("R") || code.startsWith("C")) {
        return {
          path: parts[2]!,
          previousPath: parts[1]!,
          status: code.startsWith("R") ? "renamed" : "copied"
        };
      }

      return {
        path: parts[1]!,
        status: statusFromCode(code)
      };
    });
}

function mergeFileChanges(stats: readonly FileStats[], statuses: readonly FileStatus[]): readonly FileChangeViewModel[] {
  const statsByPath = new Map(stats.map((item) => [item.path, item]));

  if (statuses.length === 0) {
    return stats.map((item) => ({
      binary: item.binary,
      deletions: item.deletions,
      insertions: item.insertions,
      path: item.path,
      status: "modified"
    }));
  }

  return statuses.map((item) => {
    const stat = statsByPath.get(item.path) ?? (item.previousPath ? statsByPath.get(item.previousPath) : undefined);

    return {
      binary: stat?.binary ?? false,
      deletions: stat?.deletions ?? 0,
      insertions: stat?.insertions ?? 0,
      path: item.path,
      previousPath: item.previousPath,
      status: item.status
    };
  });
}

function statusFromCode(code: string): FileChangeViewModel["status"] {
  if (code === "A") {
    return "added";
  }

  if (code === "D") {
    return "deleted";
  }

  if (code === "M") {
    return "modified";
  }

  return "unchanged";
}
