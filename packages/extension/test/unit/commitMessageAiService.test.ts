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
      baseUrl: "https://api.example.com/v1",
      model: "gpt-test",
      prompt: expect.stringContaining("src/a.ts")
    });
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
});

function createSettingsService(
  provider: AiProviderKind,
  apiKey?: string
): CommitMessageAiServiceInput["settingsService"] {
  return {
    getOpenAICompatibleApiKey: async () => apiKey,
    getSettings: () => createSettings(provider)
  };
}

function createSettings(provider: AiProviderKind): SettingsViewModel {
  return {
    autoStashOnPull: "ask",
    ai: {
      openAICompatible: {
        baseUrl: "https://api.example.com/v1",
        configured: provider === "openAICompatible",
        model: "gpt-test"
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
