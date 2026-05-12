import { describe, expect, it } from "vitest";
import { SettingsService } from "../../src/state/SettingsService";

describe("SettingsService", () => {
  it("reads GUI Git History settings from configuration", () => {
    const service = new SettingsService({
      configuration: {
        get: (key) =>
          ({
            autoStashOnPull: "always",
            "blame.enabled": false,
            "blame.format": "${author}: ${summary}",
            "blame.showOnlyCurrentLine": true,
            fileViewMode: "list",
            language: "zh",
            "proxy.enabled": true,
            "proxy.http": "http://127.0.0.1:7890",
            "proxy.https": "http://127.0.0.1:7891",
            "proxy.noProxy": "localhost"
          })[key],
        update: async () => undefined
      }
    });

    expect(service.getSettings()).toEqual({
      autoStashOnPull: "always",
      blameEnabled: false,
      blameFormat: "${author}: ${summary}",
      blameShowOnlyCurrentLine: true,
      fileViewMode: "list",
      language: "zh",
      proxy: {
        enabled: true,
        http: "http://127.0.0.1:7890",
        https: "http://127.0.0.1:7891",
        noProxy: "localhost"
      }
    });
  });

  it("updates file view mode through the guigit configuration section", async () => {
    const updates: Array<{ key: string; value: unknown }> = [];
    const service = new SettingsService({
      configuration: {
        get: (key) => (key === "fileViewMode" ? "tree" : undefined),
        update: async (key, value) => {
          updates.push({ key, value });
        }
      }
    });

    await service.updateSettings({ fileViewMode: "list" });

    expect(updates).toEqual([{ key: "fileViewMode", value: "list" }]);
  });

  it("updates language and proxy settings", async () => {
    const updates: Array<{ key: string; value: unknown }> = [];
    const service = new SettingsService({
      configuration: {
        get: () => undefined,
        update: async (key, value) => {
          updates.push({ key, value });
        }
      }
    });

    await service.updateSettings({
      language: "zh",
      proxy: {
        enabled: true,
        http: "http://127.0.0.1:7890",
        https: "http://127.0.0.1:7891",
        noProxy: "localhost"
      }
    });

    expect(updates).toEqual([
      { key: "language", value: "zh" },
      { key: "proxy.enabled", value: true },
      { key: "proxy.http", value: "http://127.0.0.1:7890" },
      { key: "proxy.https", value: "http://127.0.0.1:7891" },
      { key: "proxy.noProxy", value: "localhost" }
    ]);
  });

  it("updates and resets auto stash preference", async () => {
    const updates: Array<{ key: string; value: unknown }> = [];
    const service = new SettingsService({
      configuration: {
        get: () => undefined,
        update: async (key, value) => {
          updates.push({ key, value });
        }
      }
    });

    await service.updateSettings({ autoStashOnPull: "always" });
    await service.resetAutoStashPreference();

    expect(updates).toEqual([
      { key: "autoStashOnPull", value: "always" },
      { key: "autoStashOnPull", value: "ask" }
    ]);
  });
});
