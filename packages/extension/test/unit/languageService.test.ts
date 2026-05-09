import { describe, expect, it, vi } from "vitest";
import { LanguageService } from "../../src/backend/i18n/LanguageService";
import type { SettingsViewModel } from "../../src/backend/rpc/contract";

describe("LanguageService", () => {
  it("loads migrated locale messages for the configured language", () => {
    const service = createService({
      language: "zh"
    });

    expect(service.getBundle()).toEqual(expect.objectContaining({
      locale: "zh",
      messages: expect.objectContaining({
        settingsMenu: expect.objectContaining({
          changeLanguage: "切换语言"
        })
      })
    }));
    expect(service.t("settingsMenu.changeLanguage")).toBe("切换语言");
  });

  it("resolves auto language from the VS Code UI language with English fallback", () => {
    expect(createService({ language: "auto", uiLanguage: "fr-FR" }).getBundle().locale).toBe("fr");
    expect(createService({ language: "auto", uiLanguage: "pt-BR" }).getBundle().locale).toBe("en");
  });

  it("changes language through the backend picker", async () => {
    const updates: unknown[] = [];
    const service = createService({
      language: "en",
      showQuickPick: vi.fn().mockImplementation(async (items) => items.find((item) => item.preference === "zh")),
      updates
    });

    await expect(service.changeLanguagePreference()).resolves.toEqual({
      message: "Language changed to Chinese (Simplified)",
      status: "ok"
    });
    expect(updates).toEqual([{ language: "zh" }]);
  });
});

function createService(input: {
  language: SettingsViewModel["language"];
  showQuickPick?: (items: readonly { label: string; preference: SettingsViewModel["language"] }[], options: { placeHolder: string }) => Thenable<{ label: string; preference: SettingsViewModel["language"] } | undefined>;
  uiLanguage?: string;
  updates?: unknown[];
}): LanguageService {
  return new LanguageService({
    settingsService: {
      getSettings: () => createSettings(input.language),
      updateSettings: async (settings) => {
        input.updates?.push(settings);
      }
    },
    showQuickPick: input.showQuickPick,
    uiLanguage: () => input.uiLanguage ?? "en"
  });
}

function createSettings(language: SettingsViewModel["language"]): SettingsViewModel {
  return {
    autoStashOnPull: "ask",
    blameEnabled: true,
    blameFormat: "${author}: ${summary}",
    blameShowOnlyCurrentLine: true,
    fileViewMode: "tree",
    language,
    proxy: {
      enabled: false,
      http: "",
      https: "",
      noProxy: ""
    }
  };
}
