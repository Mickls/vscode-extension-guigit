import type { CommitMessageSuggestionViewModel, OperationResultViewModel } from "../rpc/contract";
import type { SettingsService } from "../../state/SettingsService";
import type { LanguageModelCommitMessageProvider } from "../vscode/LanguageModelCommitMessageProvider";
import type { OpenAICompatibleCommitMessageProvider } from "./OpenAICompatibleCommitMessageProvider";

export interface CommitMessageAiServiceInput {
  gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  languageModelProvider: Pick<LanguageModelCommitMessageProvider, "generate">;
  openAICompatibleProvider: Pick<OpenAICompatibleCommitMessageProvider, "generate">;
  promptWindowCharacters?: number;
  settingsService: Pick<SettingsService, "getOpenAICompatibleApiKey" | "getSettings">;
}

export interface CommitMessageGenerationResult {
  suggestion: CommitMessageSuggestionViewModel;
}

export class CommitMessageAiService {
  private readonly gitRaw: (repositoryRoot: string, args: readonly string[]) => Promise<string>;
  private readonly languageModelProvider: Pick<LanguageModelCommitMessageProvider, "generate">;
  private readonly openAICompatibleProvider: Pick<OpenAICompatibleCommitMessageProvider, "generate">;
  private readonly promptWindowCharacters: number;
  private readonly settingsService: Pick<SettingsService, "getOpenAICompatibleApiKey" | "getSettings">;

  public constructor(input: CommitMessageAiServiceInput) {
    this.gitRaw = input.gitRaw;
    this.languageModelProvider = input.languageModelProvider;
    this.openAICompatibleProvider = input.openAICompatibleProvider;
    this.promptWindowCharacters = input.promptWindowCharacters ?? defaultPromptWindowCharacters;
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
    const settings = this.settingsService.getSettings();
    const [statOutput, nameStatusOutput, numstatOutput] = await Promise.all([
      this.gitRaw(repositoryRoot, ["diff", "--cached", "--stat"]),
      this.gitRaw(repositoryRoot, ["diff", "--cached", "--name-status"]),
      this.gitRaw(repositoryRoot, ["diff", "--cached", "--numstat"])
    ]);
    const metadata = parseStagedDiffMetadata(nameStatusOutput, numstatOutput);
    const textDiff =
      metadata.textFilePaths.length > 0
        ? await this.gitRaw(repositoryRoot, ["diff", "--cached", "--no-ext-diff", "--", ...metadata.textFilePaths])
        : "";
    const promptRules =
      settings.ai.commitMessagePrompt.mode === "custom"
        ? settings.ai.commitMessagePrompt.customRules.trim()
        : defaultCommitMessagePromptRules;
    const fullPrompt = buildFinalPrompt({
      binaryFilePaths: metadata.binaryFilePaths,
      filePaths: metadata.filePaths,
      promptRules,
      statOutput,
      textDiff
    });

    if (fullPrompt.length <= this.promptWindowCharacters || !textDiff.trim()) {
      return fullPrompt;
    }

    const summaries: string[] = [];
    for (const chunk of splitTextByCharacterWindow(textDiff, this.promptWindowCharacters)) {
      summaries.push(await this.generateMessage(buildDiffSummaryPrompt(chunk)));
    }

    return buildFinalPrompt({
      binaryFilePaths: metadata.binaryFilePaths,
      diffSummaries: summaries,
      filePaths: metadata.filePaths,
      promptRules,
      statOutput
    });
  }
}

interface StagedDiffMetadata {
  binaryFilePaths: readonly string[];
  filePaths: readonly string[];
  textFilePaths: readonly string[];
}

interface FinalPromptInput {
  binaryFilePaths: readonly string[];
  diffSummaries?: readonly string[];
  filePaths: readonly string[];
  promptRules: string;
  statOutput: string;
  textDiff?: string;
}

const defaultCommitMessagePromptRules = [
  "Write one conventional commit message line.",
  "Return exactly one line with no markdown, no code fences, and no explanation."
].join("\n");

const defaultPromptWindowCharacters = 12000;

function parseStagedDiffMetadata(nameStatusOutput: string, numstatOutput: string): StagedDiffMetadata {
  const numstatEntries = parseNumstatEntries(numstatOutput);
  const binaryFilePaths = new Set(numstatEntries.filter((entry) => entry.isBinary).map((entry) => entry.path));
  const filePaths = nameStatusOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t").at(-1)!)
    .filter(Boolean);

  return {
    binaryFilePaths: filePaths.filter((path, index) => binaryFilePaths.has(path) || numstatEntries[index]?.isBinary === true),
    filePaths,
    textFilePaths: filePaths.filter((path, index) => !binaryFilePaths.has(path) && numstatEntries[index]?.isBinary !== true)
  };
}

function parseNumstatEntries(numstatOutput: string): readonly { isBinary: boolean; path: string }[] {
  return numstatOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...pathParts] = line.split("\t");
      return {
        isBinary: added === "-" && deleted === "-",
        path: pathParts.join("\t")
      };
    });
}

function buildFinalPrompt(input: FinalPromptInput): string {
  const sections = [
    input.promptRules,
    "",
    "Staged file paths:",
    ...input.filePaths.map((path) => `- ${path}`),
    "",
    "Diff summary:",
    input.statOutput.trim()
  ];

  if (input.binaryFilePaths.length > 0) {
    sections.push("", "Binary files changed:", ...input.binaryFilePaths.map((path) => `- ${path}`));
  }

  if (input.diffSummaries !== undefined) {
    sections.push("", "Diff chunk summaries:", ...input.diffSummaries.map((summary, index) => `Chunk ${index + 1}: ${summary}`));
  } else if (input.textDiff?.trim()) {
    sections.push("", "Text diff:", input.textDiff.trim());
  }

  return sections.join("\n");
}

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

function splitTextByCharacterWindow(value: string, windowCharacters: number): readonly string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += windowCharacters) {
    chunks.push(value.slice(index, index + windowCharacters));
  }

  return chunks;
}
