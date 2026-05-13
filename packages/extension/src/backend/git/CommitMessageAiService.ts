import type { CommitMessageSuggestionViewModel, OperationResultViewModel } from "../rpc/contract";
import type { SettingsService } from "../../state/SettingsService";
import type { LanguageModelCommitMessageProvider } from "../vscode/LanguageModelCommitMessageProvider";
import type { OpenAICompatibleCommitMessageProvider } from "./OpenAICompatibleCommitMessageProvider";

export interface CommitMessageAiServiceInput {
  gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  languageModelProvider: Pick<LanguageModelCommitMessageProvider, "generate">;
  openAICompatibleProvider: Pick<OpenAICompatibleCommitMessageProvider, "generate">;
  settingsService: Pick<SettingsService, "getOpenAICompatibleApiKey" | "getSettings">;
}

export interface CommitMessageGenerationResult {
  suggestion: CommitMessageSuggestionViewModel;
}

export class CommitMessageAiService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly languageModelProvider: Pick<LanguageModelCommitMessageProvider, "generate">;
  private readonly openAICompatibleProvider: Pick<OpenAICompatibleCommitMessageProvider, "generate">;
  private readonly settingsService: Pick<SettingsService, "getOpenAICompatibleApiKey" | "getSettings">;

  public constructor(input: CommitMessageAiServiceInput) {
    this.gitRaw = input.gitRaw;
    this.languageModelProvider = input.languageModelProvider;
    this.openAICompatibleProvider = input.openAICompatibleProvider;
    this.settingsService = input.settingsService;
  }

  public async generate(repositoryRoot: string): Promise<CommitMessageGenerationResult> {
    const prompt = await this.buildPrompt(repositoryRoot);
    const message = await this.generateMessage(prompt);

    return {
      suggestion: {
        message
      }
    };
  }

  public async testProvider(): Promise<OperationResultViewModel> {
    const settings = this.settingsService.getSettings();
    const prompt = "Return one conventional commit message line for a small backend change.";

    if (settings.ai.provider === "openAICompatible") {
      const apiKey = await this.settingsService.getOpenAICompatibleApiKey();
      if (!apiKey) {
        return {
          message: "OpenAI-compatible API key is not configured",
          status: "cancelled"
        };
      }

      await this.openAICompatibleProvider.generate({
        apiKey,
        baseUrl: settings.ai.openAICompatible.baseUrl,
        model: settings.ai.openAICompatible.model,
        prompt,
        protocol: settings.ai.openAICompatible.protocol
      });
      return {
        message: "OpenAI-compatible provider tested",
        status: "ok"
      };
    }

    await this.languageModelProvider.generate(prompt);
    return {
      message: "VS Code language model provider tested",
      status: "ok"
    };
  }

  private async generateMessage(prompt: string): Promise<string> {
    const settings = this.settingsService.getSettings();

    if (settings.ai.provider === "openAICompatible") {
      const apiKey = await this.settingsService.getOpenAICompatibleApiKey();
      if (!apiKey) {
        throw new Error("OpenAI-compatible API key is not configured");
      }

      return this.openAICompatibleProvider.generate({
        apiKey,
        baseUrl: settings.ai.openAICompatible.baseUrl,
        model: settings.ai.openAICompatible.model,
        prompt,
        protocol: settings.ai.openAICompatible.protocol
      });
    }

    return this.languageModelProvider.generate(prompt);
  }

  private async buildPrompt(repositoryRoot: string): Promise<string> {
    const [statOutput, nameStatusOutput] = await Promise.all([
      this.gitRaw(repositoryRoot, ["diff", "--cached", "--stat"]),
      this.gitRaw(repositoryRoot, ["diff", "--cached", "--name-status"])
    ]);
    const filePaths = nameStatusOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t").at(-1)!)
      .filter(Boolean);

    return [
      "Write one conventional commit message line.",
      "Return exactly one line with no markdown, no code fences, and no explanation.",
      "",
      "Staged file paths:",
      ...filePaths.map((path) => `- ${path}`),
      "",
      "Diff summary:",
      statOutput.trim()
    ].join("\n");
  }
}
