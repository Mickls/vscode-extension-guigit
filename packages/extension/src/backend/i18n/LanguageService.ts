import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ja from "./locales/ja.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";
import type {
  I18nBundleViewModel,
  I18nMessages,
  LanguagePreference,
  OperationResultViewModel
} from "../rpc/contract";
import type { SettingsService } from "../../state/SettingsService";

type ResolvedLocale = Exclude<LanguagePreference, "auto">;

interface LocaleFile {
  messages: I18nMessages;
}

interface LanguageQuickPickItem {
  label: string;
  preference: LanguagePreference;
}

export interface LanguageServiceInput {
  settingsService: Pick<SettingsService, "getSettings" | "updateSettings">;
  showQuickPick?: (
    items: readonly LanguageQuickPickItem[],
    options: { placeHolder: string }
  ) => Thenable<LanguageQuickPickItem | undefined>;
  uiLanguage: () => string;
}

const locales = {
  de,
  en,
  es,
  fr,
  ja,
  ru,
  zh
} as const satisfies Record<ResolvedLocale, LocaleFile>;

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

export class LanguageService {
  private readonly settingsService: Pick<SettingsService, "getSettings" | "updateSettings">;
  private readonly showQuickPick?: LanguageServiceInput["showQuickPick"];
  private readonly uiLanguage: () => string;

  public constructor(input: LanguageServiceInput) {
    this.settingsService = input.settingsService;
    this.showQuickPick = input.showQuickPick;
    this.uiLanguage = input.uiLanguage;
  }

  public getBundle(): I18nBundleViewModel {
    const locale = this.resolveLocale(this.settingsService.getSettings().language);
    return {
      locale,
      messages: locales[locale].messages
    };
  }

  public t(key: string, ...args: readonly unknown[]): string {
    const message = this.getMessage(key, this.getBundle().messages);
    return args.length > 0 ? formatMessage(message, args) : message;
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

    await this.settingsService.updateSettings({ language: choice.preference });
    return {
      message: `Language changed to ${choice.label}`,
      status: "ok"
    };
  }

  private resolveLocale(preference: LanguagePreference): ResolvedLocale {
    if (preference !== "auto") {
      return preference;
    }

    const locale = this.uiLanguage().toLowerCase().split("-")[0] as ResolvedLocale;
    return locale in locales ? locale : "en";
  }

  private getMessage(key: string, messages: I18nMessages): string {
    let value: I18nMessages | string = messages;
    for (const segment of key.split(".")) {
      if (typeof value === "string") {
        return key;
      }

      const nextValue: I18nMessages | string | undefined = value[segment];
      if (nextValue === undefined) {
        return key;
      }

      value = nextValue;
    }

    return typeof value === "string" ? value : key;
  }
}

function formatMessage(message: string, args: readonly unknown[]): string {
  return message.replace(/\{(\d+)}/g, (match: string, index: string) => {
    const value = args[Number.parseInt(index, 10)];
    return value === undefined ? match : formatArgument(value);
  });
}

function formatArgument(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }

  return JSON.stringify(value);
}
