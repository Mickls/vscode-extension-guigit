# AI Commit Message Diff Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include staged text diff content in AI commit-message prompts, summarize oversized diffs, and represent binary changes only as file metadata.

**Architecture:** Keep the behavior inside `CommitMessageAiService`. The service will parse staged file metadata from `--name-status` and `--numstat`, request text-only staged diffs, choose direct generation or summary-first generation based on a character window, and preserve custom prompt rules only for the final commit-message prompt.

**Tech Stack:** TypeScript, Vitest, existing `gitRaw` dependency injection, existing AI provider abstractions.

---

### Task 1: Add RED Tests For Full Text Diff And Binary Metadata

**Files:**
- Modify: `packages/extension/test/unit/commitMessageAiService.test.ts`
- Modify: `packages/extension/src/backend/git/CommitMessageAiService.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that expect `CommitMessageAiService.generate()` to request `--numstat`, include full text diff content, and exclude binary paths from the text diff command:

```ts
it("includes staged text diff content when it fits inside the prompt window", async () => {
  const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
    if (args.join(" ") === "diff --cached --stat") {
      return " src/a.ts | 2 ++";
    }
    if (args.join(" ") === "diff --cached --name-status") {
      return "M\tsrc/a.ts\n";
    }
    if (args.join(" ") === "diff --cached --numstat") {
      return "2\t0\tsrc/a.ts\n";
    }
    if (args.join(" ") === "diff --cached --no-ext-diff -- src/a.ts") {
      return "diff --git a/src/a.ts b/src/a.ts\n+export const value = 1;\n";
    }
    return "";
  });
  const languageModelProvider = {
    generate: vi.fn().mockResolvedValue("feat: add value export")
  };
  const service = createService({ gitRaw, languageModelProvider });

  await service.generate("/repo");

  expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("+export const value = 1;"));
});

it("lists binary staged files without requesting their patch content", async () => {
  const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
    if (args.join(" ") === "diff --cached --stat") {
      return " src/a.ts | 1 +\n assets/logo.png | Bin 0 -> 120 bytes";
    }
    if (args.join(" ") === "diff --cached --name-status") {
      return "M\tsrc/a.ts\nA\tassets/logo.png\n";
    }
    if (args.join(" ") === "diff --cached --numstat") {
      return "1\t0\tsrc/a.ts\n-\t-\tassets/logo.png\n";
    }
    if (args.join(" ") === "diff --cached --no-ext-diff -- src/a.ts") {
      return "diff --git a/src/a.ts b/src/a.ts\n+console.log('text');\n";
    }
    return "";
  });
  const languageModelProvider = {
    generate: vi.fn().mockResolvedValue("feat: update text and logo")
  };
  const service = createService({ gitRaw, languageModelProvider });

  await service.generate("/repo");

  expect(gitRaw).toHaveBeenCalledWith("/repo", ["diff", "--cached", "--no-ext-diff", "--", "src/a.ts"]);
  expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["diff", "--cached", "--no-ext-diff", "--", "assets/logo.png"]);
  expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("Binary files changed:"));
  expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("- assets/logo.png"));
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter vscode-extension-guigit test -- commitMessageAiService.test.ts`

Expected: FAIL because `CommitMessageAiService` does not call `--numstat` or include text diff content.

- [ ] **Step 3: Implement minimal full-diff and binary handling**

In `CommitMessageAiService.ts`, add:

```ts
interface StagedDiffMetadata {
  binaryFilePaths: readonly string[];
  textFilePaths: readonly string[];
}

function parseStagedDiffMetadata(nameStatusOutput: string, numstatOutput: string): StagedDiffMetadata {
  const binaryFilePaths = new Set(
    numstatOutput
      .split("\n")
      .filter(Boolean)
      .filter((line) => line.startsWith("-\t-\t"))
      .map((line) => line.split("\t").at(-1)!)
      .filter(Boolean)
  );
  const filePaths = nameStatusOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t").at(-1)!)
    .filter(Boolean);

  return {
    binaryFilePaths: filePaths.filter((path) => binaryFilePaths.has(path)),
    textFilePaths: filePaths.filter((path) => !binaryFilePaths.has(path))
  };
}
```

Then call `gitRaw(repositoryRoot, ["diff", "--cached", "--no-ext-diff", "--", ...textFilePaths])` only when `textFilePaths.length > 0`, and include `Text diff:` plus `Binary files changed:` sections in the final prompt.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter vscode-extension-guigit test -- commitMessageAiService.test.ts`

Expected: PASS for the new tests and existing service tests.

### Task 2: Add RED Tests For Oversized Diff Summaries And Custom Final Rules

**Files:**
- Modify: `packages/extension/test/unit/commitMessageAiService.test.ts`
- Modify: `packages/extension/src/backend/git/CommitMessageAiService.ts`

- [ ] **Step 1: Write failing tests**

Add tests using a small injected prompt window so oversized behavior can be exercised without a huge fixture:

```ts
it("summarizes oversized staged text diff chunks before final generation", async () => {
  const languageModelProvider = {
    generate: vi
      .fn()
      .mockResolvedValueOnce("src/a.ts adds the first exported value.")
      .mockResolvedValueOnce("src/b.ts adds the second exported value.")
      .mockResolvedValueOnce("feat: add exported values")
  };
  const service = createService({
    gitRaw: createDiffGitRaw("diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n\ndiff --git a/src/b.ts b/src/b.ts\n+export const b = 2;\n"),
    languageModelProvider,
    promptWindowCharacters: 60
  });

  await service.generate("/repo");

  expect(languageModelProvider.generate).toHaveBeenCalledTimes(3);
  expect(languageModelProvider.generate.mock.calls[0]![0]).toContain("Summarize this staged git diff chunk");
  expect(languageModelProvider.generate.mock.calls[2]![0]).toContain("Diff chunk summaries:");
  expect(languageModelProvider.generate.mock.calls[2]![0]).toContain("src/a.ts adds the first exported value.");
  expect(languageModelProvider.generate.mock.calls[2]![0]).toContain("src/b.ts adds the second exported value.");
});

it("applies custom prompt rules only to final generation, not chunk summaries", async () => {
  const languageModelProvider = {
    generate: vi
      .fn()
      .mockResolvedValueOnce("src/cache.ts changes cache invalidation.")
      .mockResolvedValueOnce("修复: 更新缓存失效逻辑")
  };
  const service = createService({
    gitRaw: createDiffGitRaw("diff --git a/src/cache.ts b/src/cache.ts\n+invalidateCache();\n"),
    languageModelProvider,
    promptWindowCharacters: 20,
    settingsService: createSettingsService("vscodeLanguageModel", undefined, {
      customRules: "用中文生成提交信息，并且必须以 修复: 开头。",
      mode: "custom"
    })
  });

  await service.generate("/repo");

  expect(languageModelProvider.generate.mock.calls[0]![0]).not.toContain("用中文生成提交信息");
  expect(languageModelProvider.generate.mock.calls[1]![0]).toContain("用中文生成提交信息，并且必须以 修复: 开头。");
  expect(languageModelProvider.generate.mock.calls[1]![0]).not.toContain("one conventional commit message line");
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter vscode-extension-guigit test -- commitMessageAiService.test.ts`

Expected: FAIL because the constructor does not accept `promptWindowCharacters` and oversized diff summarization does not exist.

- [ ] **Step 3: Implement summary orchestration**

Extend `CommitMessageAiServiceInput`:

```ts
promptWindowCharacters?: number;
```

Add a private `promptWindowCharacters` property defaulting to an internal constant:

```ts
const defaultPromptWindowCharacters = 12000;
```

Split oversized diffs with:

```ts
function splitTextByCharacterWindow(value: string, windowCharacters: number): readonly string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += windowCharacters) {
    chunks.push(value.slice(index, index + windowCharacters));
  }
  return chunks;
}
```

Add summary prompt:

```ts
function buildDiffSummaryPrompt(chunk: string): string {
  return [
    "Summarize this staged git diff chunk factually for a later commit-message generator.",
    "Mention changed files, behavior changes, and important implementation details.",
    "Do not write a commit message. Do not follow user commit-message style rules here.",
    "",
    "Diff chunk:",
    chunk
  ].join("\n");
}
```

Use `generateMessage(summaryPrompt)` for each chunk, then build the final prompt with `Diff chunk summaries:` instead of `Text diff:`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter vscode-extension-guigit test -- commitMessageAiService.test.ts`

Expected: PASS.

### Task 3: Verify Service And Existing Provider Paths

**Files:**
- Modify: `packages/extension/test/unit/commitMessageAiService.test.ts`
- Modify: `packages/extension/src/backend/git/CommitMessageAiService.ts`

- [ ] **Step 1: Update existing tests for new Git calls**

Existing tests should stub `diff --cached --numstat` and text diff commands. Add a helper to reduce duplication:

```ts
function createDiffGitRaw(diffOutput: string): CommitMessageAiServiceInput["gitRaw"] {
  return vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
    if (args.join(" ") === "diff --cached --stat") {
      return " src/a.ts | 1 +";
    }
    if (args.join(" ") === "diff --cached --name-status") {
      return "M\tsrc/a.ts\n";
    }
    if (args.join(" ") === "diff --cached --numstat") {
      return "1\t0\tsrc/a.ts\n";
    }
    if (args.join(" ") === "diff --cached --no-ext-diff -- src/a.ts") {
      return diffOutput;
    }
    return "";
  });
}
```

Add:

```ts
function createService(input: Partial<CommitMessageAiServiceInput> = {}): CommitMessageAiService {
  return new CommitMessageAiService({
    gitRaw: input.gitRaw ?? createDiffGitRaw("diff --git a/src/a.ts b/src/a.ts\n+value\n"),
    languageModelProvider: input.languageModelProvider ?? { generate: vi.fn().mockResolvedValue("feat: generated") },
    openAICompatibleProvider: input.openAICompatibleProvider ?? { generate: vi.fn() },
    promptWindowCharacters: input.promptWindowCharacters,
    settingsService: input.settingsService ?? createSettingsService("vscodeLanguageModel")
  });
}
```

- [ ] **Step 2: Run focused tests**

Run: `pnpm --filter vscode-extension-guigit test -- commitMessageAiService.test.ts`

Expected: PASS.

- [ ] **Step 3: Run extension tests**

Run: `pnpm --filter vscode-extension-guigit test`

Expected: PASS.
