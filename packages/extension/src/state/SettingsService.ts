import type {
  AutoStashPreference,
  FileViewMode,
  LanguagePreference,
  SettingsViewModel
} from "../backend/rpc/contract";

export type SettingsConfigurationKey =
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

export interface SettingsServiceInput {
  configuration: SettingsConfiguration;
}

export class SettingsService {
  private readonly configuration: SettingsConfiguration;

  public constructor(input: SettingsServiceInput) {
    this.configuration = input.configuration;
  }

  public getSettings(): SettingsViewModel {
    return {
      autoStashOnPull: (this.configuration.get("autoStashOnPull") ?? "ask") as AutoStashPreference,
      blameEnabled: (this.configuration.get("blame.enabled") ?? true) as boolean,
      blameFormat: (this.configuration.get("blame.format") ?? "${author}: ${summary}") as string,
      blameShowOnlyCurrentLine: (this.configuration.get("blame.showOnlyCurrentLine") ?? true) as boolean,
      fileViewMode: (this.configuration.get("fileViewMode") ?? "tree") as FileViewMode,
      language: (this.configuration.get("language") ?? "auto") as LanguagePreference,
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
}
