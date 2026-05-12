import type {
  AutoStashPreference,
  AiProviderKind,
  FileViewMode,
  LanguagePreference,
  OperationResultViewModel,
  SettingsViewModel
} from "../backend/rpc/contract";

export type SettingsConfigurationKey =
  | "ai.provider"
  | "ai.openAICompatible.baseUrl"
  | "ai.openAICompatible.model"
  | "autoStashOnPull"
  | "blame.enabled"
  | "blame.format"
  | "blame.showOnlyCurrentLine"
  | "fileViewMode"
  | "language"
  | "proxy.enabled"
  | "proxy.http"
  | "proxy.https"
  | "proxy.noProxy";

export interface SettingsConfiguration {
  get(key: SettingsConfigurationKey): unknown;
  update(key: SettingsConfigurationKey, value: unknown): Promise<void>;
}

export interface SettingsSecretStorage {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
}

interface SettingsQuickPickItem {
  label: string;
  value: AiProviderKind;
}

interface SettingsInputBoxOptions {
  password?: boolean;
  placeHolder?: string;
  prompt: string;
  value?: string;
}

export interface SettingsServiceInput {
  configuration: SettingsConfiguration;
  secretStorage: SettingsSecretStorage;
  showInputBox: (options: SettingsInputBoxOptions) => Thenable<string | undefined>;
  showQuickPick: (
    items: readonly SettingsQuickPickItem[],
    options: { placeHolder: string }
  ) => Thenable<SettingsQuickPickItem | undefined>;
}

const openAICompatibleApiKeySecretKey = "guigit.ai.openAICompatible.apiKey";
const aiProviderItems = [
  { label: "VS Code Language Model", value: "vscodeLanguageModel" },
  { label: "OpenAI-compatible", value: "openAICompatible" }
] as const satisfies readonly SettingsQuickPickItem[];

export class SettingsService {
  private readonly configuration: SettingsConfiguration;
  private readonly secretStorage: SettingsSecretStorage;
  private readonly showInputBox: (options: SettingsInputBoxOptions) => Thenable<string | undefined>;
  private readonly showQuickPick: (
    items: readonly SettingsQuickPickItem[],
    options: { placeHolder: string }
  ) => Thenable<SettingsQuickPickItem | undefined>;

  public constructor(input: SettingsServiceInput) {
    this.configuration = input.configuration;
    this.secretStorage = input.secretStorage;
    this.showInputBox = input.showInputBox;
    this.showQuickPick = input.showQuickPick;
  }

  public getSettings(): SettingsViewModel {
    const provider = (this.configuration.get("ai.provider") ?? "vscodeLanguageModel") as AiProviderKind;
    const baseUrl = (this.configuration.get("ai.openAICompatible.baseUrl") ?? "") as string;
    const model = (this.configuration.get("ai.openAICompatible.model") ?? "") as string;

    return {
      autoStashOnPull: (this.configuration.get("autoStashOnPull") ?? "ask") as AutoStashPreference,
      blameEnabled: (this.configuration.get("blame.enabled") ?? true) as boolean,
      blameFormat: (this.configuration.get("blame.format") ?? "${author}: ${summary}") as string,
      blameShowOnlyCurrentLine: (this.configuration.get("blame.showOnlyCurrentLine") ?? true) as boolean,
      fileViewMode: (this.configuration.get("fileViewMode") ?? "tree") as FileViewMode,
      language: (this.configuration.get("language") ?? "auto") as LanguagePreference,
      ai: {
        provider,
        openAICompatible: {
          baseUrl,
          configured: baseUrl.length > 0 && model.length > 0,
          model
        }
      },
      proxy: {
        enabled: (this.configuration.get("proxy.enabled") ?? false) as boolean,
        http: (this.configuration.get("proxy.http") ?? "") as string,
        https: (this.configuration.get("proxy.https") ?? "") as string,
        noProxy: (this.configuration.get("proxy.noProxy") ?? "") as string
      }
    };
  }

  public async updateSettings(settings: Partial<SettingsViewModel>): Promise<void> {
    if (settings.autoStashOnPull !== undefined) {
      await this.configuration.update("autoStashOnPull", settings.autoStashOnPull);
    }

    if (settings.fileViewMode !== undefined) {
      await this.configuration.update("fileViewMode", settings.fileViewMode);
    }

    if (settings.language !== undefined) {
      await this.configuration.update("language", settings.language);
    }

    if (settings.ai !== undefined) {
      await this.configuration.update("ai.provider", settings.ai.provider);
      await this.configuration.update("ai.openAICompatible.baseUrl", settings.ai.openAICompatible.baseUrl);
      await this.configuration.update("ai.openAICompatible.model", settings.ai.openAICompatible.model);
    }

    if (settings.proxy !== undefined) {
      await this.configuration.update("proxy.enabled", settings.proxy.enabled);
      await this.configuration.update("proxy.http", settings.proxy.http);
      await this.configuration.update("proxy.https", settings.proxy.https);
      await this.configuration.update("proxy.noProxy", settings.proxy.noProxy);
    }
  }

  public async resetAutoStashPreference(): Promise<void> {
    await this.configuration.update("autoStashOnPull", "ask");
  }

  public async configureAiProvider(): Promise<OperationResultViewModel> {
    const choice = await this.showQuickPick(aiProviderItems, {
      placeHolder: "Select AI provider"
    });

    if (!choice) {
      return {
        message: "AI provider configuration cancelled",
        status: "cancelled"
      };
    }

    if (choice.value === "vscodeLanguageModel") {
      await this.updateSettings({
        ai: {
          provider: choice.value,
          openAICompatible: this.getSettings().ai.openAICompatible
        }
      });

      return {
        message: "AI provider configured",
        status: "ok"
      };
    }

    const current = this.getSettings().ai.openAICompatible;
    const baseUrl = await this.showInputBox({
      placeHolder: "https://api.example.com/v1",
      prompt: "OpenAI-compatible base URL",
      value: current.baseUrl
    });
    if (baseUrl === undefined) {
      return {
        message: "AI provider configuration cancelled",
        status: "cancelled"
      };
    }

    const model = await this.showInputBox({
      placeHolder: "gpt-4.1-mini",
      prompt: "OpenAI-compatible model",
      value: current.model
    });
    if (model === undefined) {
      return {
        message: "AI provider configuration cancelled",
        status: "cancelled"
      };
    }

    const apiKey = await this.showInputBox({
      password: true,
      placeHolder: "sk-...",
      prompt: "OpenAI-compatible API key"
    });
    if (apiKey === undefined) {
      return {
        message: "AI provider configuration cancelled",
        status: "cancelled"
      };
    }

    await this.updateSettings({
      ai: {
        provider: choice.value,
        openAICompatible: {
          baseUrl,
          configured: true,
          model
        }
      }
    });
    await this.secretStorage.store(openAICompatibleApiKeySecretKey, apiKey);

    return {
      message: "AI provider configured",
      status: "ok"
    };
  }

  public async getOpenAICompatibleApiKey(): Promise<string | undefined> {
    return this.secretStorage.get(openAICompatibleApiKeySecretKey);
  }
}
