import type {
  AutoStashPreference,
  FileViewMode,
  LanguagePreference,
  SettingsViewModel
} from "../backend/rpc/contract";

export type SettingsConfigurationKey =
  | "guigit.autoStashOnPull"
  | "guigit.blame.enabled"
  | "guigit.blame.format"
  | "guigit.blame.showOnlyCurrentLine"
  | "guigit.fileViewMode"
  | "guigit.language"
  | "guigit.proxy.enabled"
  | "guigit.proxy.http"
  | "guigit.proxy.https"
  | "guigit.proxy.noProxy";

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
      autoStashOnPull: (this.configuration.get("guigit.autoStashOnPull") ?? "ask") as AutoStashPreference,
      blameEnabled: (this.configuration.get("guigit.blame.enabled") ?? true) as boolean,
      blameFormat: (this.configuration.get("guigit.blame.format") ?? "${author}, ${time}: ${summary}") as string,
      blameShowOnlyCurrentLine: (this.configuration.get("guigit.blame.showOnlyCurrentLine") ?? false) as boolean,
      fileViewMode: (this.configuration.get("guigit.fileViewMode") ?? "tree") as FileViewMode,
      language: (this.configuration.get("guigit.language") ?? "auto") as LanguagePreference,
      proxy: {
        enabled: (this.configuration.get("guigit.proxy.enabled") ?? false) as boolean,
        http: (this.configuration.get("guigit.proxy.http") ?? "") as string,
        https: (this.configuration.get("guigit.proxy.https") ?? "") as string,
        noProxy: (this.configuration.get("guigit.proxy.noProxy") ?? "") as string
      }
    };
  }

  public async updateSettings(settings: Partial<SettingsViewModel>): Promise<void> {
    if (settings.autoStashOnPull !== undefined) {
      await this.configuration.update("guigit.autoStashOnPull", settings.autoStashOnPull);
    }

    if (settings.fileViewMode !== undefined) {
      await this.configuration.update("guigit.fileViewMode", settings.fileViewMode);
    }
  }

  public async resetAutoStashPreference(): Promise<void> {
    await this.configuration.update("guigit.autoStashOnPull", "ask");
  }
}
