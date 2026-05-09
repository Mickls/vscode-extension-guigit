import type {
  AutoStashPreference,
  FileViewMode,
  LanguagePreference,
  OperationResultViewModel,
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
  showQuickPick?: (
    items: readonly LanguageQuickPickItem[],
    options: { placeHolder: string }
  ) => Thenable<LanguageQuickPickItem | undefined>;
}

export class SettingsService {
  private readonly configuration: SettingsConfiguration;
  private readonly showQuickPick?: (
    items: readonly LanguageQuickPickItem[],
    options: { placeHolder: string }
  ) => Thenable<LanguageQuickPickItem | undefined>;

  public constructor(input: SettingsServiceInput) {
    this.configuration = input.configuration;
    this.showQuickPick = input.showQuickPick;
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

    if (settings.language !== undefined) {
      await this.configuration.update("guigit.language", settings.language);
    }

    if (settings.proxy !== undefined) {
      await this.configuration.update("guigit.proxy.enabled", settings.proxy.enabled);
      await this.configuration.update("guigit.proxy.http", settings.proxy.http);
      await this.configuration.update("guigit.proxy.https", settings.proxy.https);
      await this.configuration.update("guigit.proxy.noProxy", settings.proxy.noProxy);
    }
  }

  public async resetAutoStashPreference(): Promise<void> {
    await this.configuration.update("guigit.autoStashOnPull", "ask");
  }

  public async changeLanguagePreference(): Promise<OperationResultViewModel> {
    const choice = await this.showQuickPick?.(languageQuickPickItems, {
      placeHolder: "Select GUI Git History language"
    });
    if (!choice) {
      return {
        message: "Change language cancelled",
        status: "cancelled"
      };
    }

    await this.configuration.update("guigit.language", choice.preference);
    return {
      message: `Language changed to ${choice.label}`,
      status: "ok"
    };
  }
}

interface LanguageQuickPickItem {
  label: string;
  preference: LanguagePreference;
}

const languageQuickPickItems = [
  { label: "Auto", preference: "auto" },
  { label: "English", preference: "en" },
  { label: "Chinese (Simplified)", preference: "zh" },
  { label: "Spanish", preference: "es" },
  { label: "French", preference: "fr" },
  { label: "Deutsch", preference: "de" },
  { label: "Japanese", preference: "ja" },
  { label: "Russian", preference: "ru" }
] as const satisfies readonly LanguageQuickPickItem[];
