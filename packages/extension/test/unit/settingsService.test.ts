import { describe, expect, it } from "vitest";
import { SettingsService } from "../../src/state/SettingsService";

describe("SettingsService", () => {
  it("reads GUI Git History settings from configuration", () => {
    const service = new SettingsService({
      configuration: {
        get: (key) =>
          ({
            "guigit.autoStashOnPull": "always",
            "guigit.blame.enabled": false,
            "guigit.blame.format": "${author}: ${summary}",
            "guigit.blame.showOnlyCurrentLine": true,
            "guigit.fileViewMode": "list",
            "guigit.language": "zh",
            "guigit.proxy.enabled": true,
            "guigit.proxy.http": "http://127.0.0.1:7890",
            "guigit.proxy.https": "http://127.0.0.1:7891",
            "guigit.proxy.noProxy": "localhost"
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

  it("updates file view mode through guigit.fileViewMode", async () => {
    const updates: Array<{ key: string; value: unknown }> = [];
    const service = new SettingsService({
      configuration: {
        get: (key) => (key === "guigit.fileViewMode" ? "tree" : undefined),
        update: async (key, value) => {
          updates.push({ key, value });
        }
      }
    });

    await service.updateSettings({ fileViewMode: "list" });

    expect(updates).toEqual([{ key: "guigit.fileViewMode", value: "list" }]);
  });
});
