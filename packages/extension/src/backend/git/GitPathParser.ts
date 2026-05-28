export interface ParsedGitPath {
  path: string;
  previousPath?: string;
}

export function unquoteGitPath(path: string): string {
  const quotedPath = parseQuotedGitPath(path, 0);
  return quotedPath && quotedPath.nextIndex === path.length ? quotedPath.path : path;
}

export function parseGitNumstatPath(path: string, knownPaths: ReadonlySet<string> = new Set()): ParsedGitPath {
  const unquotedPath = unquoteGitPath(path);
  if (knownPaths.has(unquotedPath)) {
    return { path: unquotedPath };
  }

  const renameMatch = /^(.*)\{(.+) => (.+)\}(.*)$/.exec(unquotedPath);
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

  const separatorIndex = findGitPathSeparator(path, " => ");
  if (separatorIndex !== -1) {
    return {
      path: unquoteGitPath(path.slice(separatorIndex + 4)),
      previousPath: unquoteGitPath(path.slice(0, separatorIndex))
    };
  }

  return { path: unquotedPath };
}

export function findGitPathSeparator(path: string, separator: string): number {
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

    if (!quoted && path.slice(index, index + separator.length) === separator) {
      return index;
    }
  }

  return -1;
}

interface QuotedGitPath {
  nextIndex: number;
  path: string;
}

function parseQuotedGitPath(input: string, startIndex: number): QuotedGitPath | undefined {
  if (input.charAt(startIndex) !== '"') {
    return undefined;
  }

  const bytes: number[] = [];
  for (let index = startIndex + 1; index < input.length; index += 1) {
    const character = input.charAt(index);

    if (character === '"') {
      return {
        nextIndex: index + 1,
        path: new TextDecoder().decode(new Uint8Array(bytes))
      };
    }

    if (character === "\\") {
      const nextCharacter = input.charAt(index + 1);
      if (isOctalDigit(nextCharacter)) {
        const octal = input.slice(index + 1, index + 4);
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

  return undefined;
}

function isOctalDigit(character: string): boolean {
  return character >= "0" && character <= "7";
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
