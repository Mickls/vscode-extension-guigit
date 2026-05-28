import { describe, expect, it, vi } from "vitest";
import { CommitMessageAiService, type CommitMessageAiServiceInput } from "../../src/backend/git/CommitMessageAiService";
import type { AiProviderKind, SettingsViewModel } from "../../src/backend/rpc/contract";

describe("CommitMessageAiService", () => {
  it("uses the language model provider and includes staged file paths in the prompt", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "diff --cached --stat") {
        return " src/a.ts | 2 ++\n src/b.ts | 1 +\n 2 files changed, 3 insertions(+)";
      }

      if (args.join(" ") === "diff --cached --name-status") {
        return "M\tsrc/a.ts\nA\tsrc/b.ts\n";
      }

      return "";
    });
    const languageModelProvider = {
      generate: vi.fn().mockResolvedValue("feat: add staged files")
    };
    const openAICompatibleProvider = {
      generate: vi.fn()
    };
    const service = new CommitMessageAiService({
      gitRaw,
      languageModelProvider,
      openAICompatibleProvider,
      settingsService: createSettingsService("vscodeLanguageModel")
    });

    await expect(service.generate("/repo")).resolves.toEqual({
      suggestion: {
        message: "feat: add staged files"
      }
    });

    expect(gitRaw).toHaveBeenNthCalledWith(1, "/repo", ["diff", "--cached", "--stat"]);
    expect(gitRaw).toHaveBeenNthCalledWith(2, "/repo", ["diff", "--cached", "--name-status"]);
    expect(languageModelProvider.generate).toHaveBeenCalledWith(
      expect.stringContaining("src/a.ts")
    );
    expect(languageModelProvider.generate).toHaveBeenCalledWith(
      expect.stringContaining("one conventional commit message line")
    );
    expect(openAICompatibleProvider.generate).not.toHaveBeenCalled();
  });

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
    const service = createService({
      gitRaw,
      languageModelProvider
    });

    await service.generate("/repo");

    expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("+export const value = 1;"));
  });

  it("decodes quoted UTF-8 staged paths before requesting text diff content", async () => {
    const quotedPath = String.raw`"src/\346\225\260\346\215\256\345\272\223/README.md"`;
    const decodedPath = "src/数据库/README.md";
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "diff --cached --stat") {
        return ` ${quotedPath} | 1 +`;
      }

      if (args.join(" ") === "diff --cached --name-status") {
        return `M\t${quotedPath}\n`;
      }

      if (args.join(" ") === "diff --cached --numstat") {
        return `1\t0\t${quotedPath}\n`;
      }

      if (args.at(-1) === decodedPath) {
        return "diff --git a/src/数据库/README.md b/src/数据库/README.md\n+content\n";
      }

      return "";
    });
    const languageModelProvider = {
      generate: vi.fn().mockResolvedValue("docs: update database readme")
    };
    const service = createService({
      gitRaw,
      languageModelProvider
    });

    await service.generate("/repo");

    expect(gitRaw).toHaveBeenCalledWith("/repo", ["diff", "--cached", "--no-ext-diff", "--", decodedPath]);
    expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining(`- ${decodedPath}`));
    expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("+content"));
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
    const service = createService({
      gitRaw,
      languageModelProvider
    });

    await service.generate("/repo");

    expect(gitRaw).toHaveBeenCalledWith("/repo", ["diff", "--cached", "--no-ext-diff", "--", "src/a.ts"]);
    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["diff", "--cached", "--no-ext-diff", "--", "assets/logo.png"]);
    expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("Binary files changed:"));
    expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("- assets/logo.png"));
  });

  it("treats renamed binary staged files as binary metadata", async () => {
    const gitRaw = vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
      if (args.join(" ") === "diff --cached --stat") {
        return " assets/{old-logo.png => logo.png} | Bin 120 -> 120 bytes";
      }

      if (args.join(" ") === "diff --cached --name-status") {
        return "R100\tassets/old-logo.png\tassets/logo.png\n";
      }

      if (args.join(" ") === "diff --cached --numstat") {
        return "-\t-\tassets/{old-logo.png => logo.png}\n";
      }

      if (args.includes("assets/logo.png")) {
        return "Binary files a/assets/old-logo.png and b/assets/logo.png differ\n";
      }

      return "";
    });
    const languageModelProvider = {
      generate: vi.fn().mockResolvedValue("chore: rename logo asset")
    };
    const service = createService({
      gitRaw,
      languageModelProvider
    });

    await service.generate("/repo");

    expect(gitRaw).not.toHaveBeenCalledWith("/repo", ["diff", "--cached", "--no-ext-diff", "--", "assets/logo.png"]);
    expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("Binary files changed:"));
    expect(languageModelProvider.generate).toHaveBeenCalledWith(expect.stringContaining("- assets/logo.png"));
    expect(languageModelProvider.generate).not.toHaveBeenCalledWith(expect.stringContaining("Binary files a/assets/old-logo.png"));
  });

  it("uses the OpenAI-compatible provider when selected", async () => {
    const openAICompatibleProvider = {
      generate: vi.fn().mockResolvedValue("fix: use the OpenAI-compatible provider")
    };
    const service = new CommitMessageAiService({
      gitRaw: vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
        if (args.join(" ") === "diff --cached --stat") {
          return " src/a.ts | 1 +\n 1 file changed, 1 insertion(+)";
        }

        if (args.join(" ") === "diff --cached --name-status") {
          return "M\tsrc/a.ts\n";
        }

        return "";
      }),
      languageModelProvider: {
        generate: vi.fn()
      },
      openAICompatibleProvider,
      settingsService: createSettingsService("openAICompatible", "sk-test")
    });

    await expect(service.generate("/repo")).resolves.toEqual({
      suggestion: {
        message: "fix: use the OpenAI-compatible provider"
      }
    });

    expect(openAICompatibleProvider.generate).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com",
      model: "gpt-test",
      prompt: expect.stringContaining("src/a.ts"),
      protocol: "responses"
    });
  });

  it("uses custom prompt rules when configured", async () => {
    const languageModelProvider = {
      generate: vi.fn().mockResolvedValue("refactor: simplify history cache")
    };
    const service = new CommitMessageAiService({
      gitRaw: vi.fn(async (_repositoryRoot: string, args: readonly string[]) => {
        if (args.join(" ") === "diff --cached --stat") {
          return " src/cache.ts | 4 ++--";
        }

        if (args.join(" ") === "diff --cached --name-status") {
          return "M\tsrc/cache.ts\n";
        }

        return "";
      }),
      languageModelProvider,
      openAICompatibleProvider: {
        generate: vi.fn()
      },
      settingsService: createSettingsService("vscodeLanguageModel", undefined, {
        customRules: "Use refactor type and mention cache behavior.",
        mode: "custom"
      })
    });

    await service.generate("/repo");

    expect(languageModelProvider.generate).toHaveBeenCalledWith(
      expect.stringContaining("Use refactor type and mention cache behavior.")
    );
    expect(languageModelProvider.generate).toHaveBeenCalledWith(
      expect.stringContaining("src/cache.ts")
    );
    expect(languageModelProvider.generate).not.toHaveBeenCalledWith(
      expect.stringContaining("one conventional commit message line")
    );
  });

  it("summarizes oversized staged text diff chunks before final generation", async () => {
    const languageModelProvider = {
      generate: vi
        .fn()
        .mockResolvedValueOnce("src/a.ts adds the first exported value.")
        .mockResolvedValueOnce("src/b.ts adds the second exported value.")
        .mockResolvedValueOnce("feat: add exported values")
    };
    const service = createService({
      gitRaw: createDiffGitRaw(
        "diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n\ndiff --git a/src/b.ts b/src/b.ts\n+export const b = 2;\n"
      ),
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
    const finalPrompt = languageModelProvider.generate.mock.calls.at(-1)![0];
    expect(finalPrompt).toContain("用中文生成提交信息，并且必须以 修复: 开头。");
    expect(finalPrompt).not.toContain("one conventional commit message line");
  });

  it("returns a cancelled result when the OpenAI-compatible API key is missing", async () => {
    const service = new CommitMessageAiService({
      gitRaw: vi.fn(),
      languageModelProvider: {
        generate: vi.fn()
      },
      openAICompatibleProvider: {
        generate: vi.fn()
      },
      settingsService: createSettingsService("openAICompatible")
    });

    await expect(service.testProvider()).resolves.toEqual({
      message: "OpenAI-compatible API key is not configured",
      status: "cancelled"
    });
  });

  it("tests an OpenAI-compatible override with the stored API key when the panel key is unchanged", async () => {
    const openAICompatibleProvider = {
      generate: vi.fn().mockResolvedValue("fix: test provider")
    };
    const service = new CommitMessageAiService({
      gitRaw: vi.fn(),
      languageModelProvider: {
        generate: vi.fn()
      },
      openAICompatibleProvider,
      settingsService: createSettingsService("openAICompatible", "sk-stored")
    });

    await expect(
      service.testProvider({
        provider: "openAICompatible",
        commitMessagePrompt: {
          customRules: "",
          mode: "default"
        },
        openAICompatible: {
          baseUrl: "https://api.anthropic.com",
          configured: true,
          model: "claude-test",
          protocol: "claudeMessages"
        }
      })
    ).resolves.toEqual({
      message: "OpenAI-compatible provider tested",
      status: "ok"
    });

    expect(openAICompatibleProvider.generate).toHaveBeenCalledWith({
      apiKey: "sk-stored",
      baseUrl: "https://api.anthropic.com",
      model: "claude-test",
      prompt: "Return one conventional commit message line for a small backend change.",
      protocol: "claudeMessages"
    });
  });

  it("tests an OpenAI-compatible override with the panel API key when it is provided", async () => {
    const openAICompatibleProvider = {
      generate: vi.fn().mockResolvedValue("fix: test provider")
    };
    const service = new CommitMessageAiService({
      gitRaw: vi.fn(),
      languageModelProvider: {
        generate: vi.fn()
      },
      openAICompatibleProvider,
      settingsService: createSettingsService("openAICompatible", "sk-stored")
    });

    await service.testProvider({
      provider: "openAICompatible",
      commitMessagePrompt: {
        customRules: "",
        mode: "default"
      },
      openAICompatible: {
        apiKey: "sk-panel",
        baseUrl: "https://api.openai.com",
        configured: true,
        model: "gpt-test",
        protocol: "responses"
      }
    });

    expect(openAICompatibleProvider.generate).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "sk-panel",
      baseUrl: "https://api.openai.com",
      model: "gpt-test",
      protocol: "responses"
    }));
  });
});

function createService(
  input: Partial<CommitMessageAiServiceInput> & { promptWindowCharacters?: number } = {}
): CommitMessageAiService {
  return new CommitMessageAiService({
    gitRaw: input.gitRaw ?? createDiffGitRaw("diff --git a/src/a.ts b/src/a.ts\n+value\n"),
    languageModelProvider: input.languageModelProvider ?? {
      generate: vi.fn().mockResolvedValue("feat: generated")
    },
    openAICompatibleProvider: input.openAICompatibleProvider ?? {
      generate: vi.fn()
    },
    promptWindowCharacters: input.promptWindowCharacters,
    settingsService: input.settingsService ?? createSettingsService("vscodeLanguageModel")
  } as CommitMessageAiServiceInput);
}

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

function createSettingsService(
  provider: AiProviderKind,
  apiKey?: string,
  commitMessagePrompt: SettingsViewModel["ai"]["commitMessagePrompt"] = {
    customRules: "",
    mode: "default"
  }
): CommitMessageAiServiceInput["settingsService"] {
  return {
    getOpenAICompatibleApiKey: async () => apiKey,
    getSettings: () => createSettings(provider, commitMessagePrompt)
  };
}

function createSettings(
  provider: AiProviderKind,
  commitMessagePrompt: SettingsViewModel["ai"]["commitMessagePrompt"]
): SettingsViewModel {
  return {
    autoStashOnPull: "ask",
    ai: {
      commitMessagePrompt,
      openAICompatible: {
        baseUrl: "https://api.openai.com",
        configured: provider === "openAICompatible",
        model: "gpt-test",
        protocol: "responses"
      },
      provider
    },
    blameEnabled: true,
    blameFormat: "${author}: ${summary}",
    blameShowOnlyCurrentLine: true,
    fileViewMode: "tree",
    language: "auto",
    proxy: {
      enabled: false,
      http: "",
      https: "",
      noProxy: ""
    }
  };
}
