import type {
  AutoStashPreference,
  AiProviderKind,
  FileViewMode,
  HttpAiProviderProtocol,
  LanguagePreference,
  OperationResultViewModel,
  SettingsViewModel
} from "../backend/rpc/contract";

export type SettingsConfigurationKey =
  | "ai.provider"
  | "ai.openAICompatible.baseUrl"
  | "ai.openAICompatible.model"
  | "ai.openAICompatible.protocol"
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

export interface SettingsServiceInput {
  configuration: SettingsConfiguration;
  secretStorage: SettingsSecretStorage;
}

const openAICompatibleApiKeySecretKey = "guigit.ai.openAICompatible.apiKey";

export class SettingsService {
  private readonly configuration: SettingsConfiguration;
  private readonly secretStorage: SettingsSecretStorage;

  public constructor(input: SettingsServiceInput) {
    this.configuration = input.configuration;
    this.secretStorage = input.secretStorage;
  }

  public getSettings(): SettingsViewModel {
    const provider = (this.configuration.get("ai.provider") ?? "vscodeLanguageModel") as AiProviderKind;
    const baseUrl = (this.configuration.get("ai.openAICompatible.baseUrl") ?? "") as string;
    const model = (this.configuration.get("ai.openAICompatible.model") ?? "") as string;
    const protocol = (this.configuration.get("ai.openAICompatible.protocol") ?? "chatCompletions") as HttpAiProviderProtocol;

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
          model,
          protocol
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
      await this.configuration.update("ai.openAICompatible.protocol", settings.ai.openAICompatible.protocol);
      await this.configuration.update("ai.openAICompatible.baseUrl", settings.ai.openAICompatible.baseUrl);
      await this.configuration.update("ai.openAICompatible.model", settings.ai.openAICompatible.model);
      if (settings.ai.openAICompatible.apiKey !== undefined) {
        await this.secretStorage.store(openAICompatibleApiKeySecretKey, settings.ai.openAICompatible.apiKey);
      }
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

  public configureAiProvider(): Promise<OperationResultViewModel> {
    return Promise.resolve({
      message: "AI provider configuration is available in the Webview",
      status: "cancelled"
    });
  }

  public async getOpenAICompatibleApiKey(): Promise<string | undefined> {
    return this.secretStorage.get(openAICompatibleApiKeySecretKey);
  }
}
