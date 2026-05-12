import { describe, expect, it, vi } from "vitest";
import { SettingsService, type SettingsConfiguration, type SettingsConfigurationKey, type SettingsSecretStorage } from "../../src/state/SettingsService";

const apiKeySecretKey = "guigit.ai.openAICompatible.apiKey";

describe("SettingsService", () => {
  it("reads GUI Git History settings from configuration", () => {
    const { configuration } = createConfiguration({
      "ai.openAICompatible.baseUrl": "https://api.example.com/v1",
      "ai.openAICompatible.model": "gpt-test",
      "ai.provider": "openAICompatible",
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
    });
    const service = createService({ configuration });

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
      },
      ai: {
        provider: "openAICompatible",
        openAICompatible: {
          baseUrl: "https://api.example.com/v1",
          configured: true,
          model: "gpt-test"
        }
      }
    });
  });

  it("updates file view mode through the guigit configuration section", async () => {
    const { configuration, updates } = createConfiguration({
      fileViewMode: "tree"
    });
    const service = createService({ configuration });

    await service.updateSettings({ fileViewMode: "list" });

    expect(updates).toEqual([{ key: "fileViewMode", value: "list" }]);
  });

  it("updates language and proxy settings", async () => {
    const { configuration, updates } = createConfiguration();
    const service = createService({ configuration });

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
    const { configuration, updates } = createConfiguration();
    const service = createService({ configuration });

    await service.updateSettings({ autoStashOnPull: "always" });
    await service.resetAutoStashPreference();

    expect(updates).toEqual([
      { key: "autoStashOnPull", value: "always" },
      { key: "autoStashOnPull", value: "ask" }
    ]);
  });

  it("writes AI provider settings without exposing the API key", async () => {
    const { configuration, updates } = createConfiguration({
      "ai.openAICompatible.baseUrl": "",
      "ai.openAICompatible.model": "",
      "ai.provider": "vscodeLanguageModel"
    });
    const { secretStorage } = createSecretStorage({ [apiKeySecretKey]: "sk-test" });
    const service = createService({ configuration, secretStorage });

    await service.updateSettings({
      ai: {
        provider: "openAICompatible",
        openAICompatible: {
          baseUrl: "https://api.example.com/v1",
          configured: true,
          model: "gpt-test"
        }
      }
    });

    expect(updates).toEqual([
      { key: "ai.provider", value: "openAICompatible" },
      { key: "ai.openAICompatible.baseUrl", value: "https://api.example.com/v1" },
      { key: "ai.openAICompatible.model", value: "gpt-test" }
    ]);
    expect(service.getSettings().ai.openAICompatible).toEqual({
      baseUrl: "https://api.example.com/v1",
      configured: true,
      model: "gpt-test"
    });
    expect(await service.getOpenAICompatibleApiKey()).toBe("sk-test");
  });

  it("configures the OpenAI-compatible provider with secret storage", async () => {
    const { configuration, updates } = createConfiguration();
    const { secretStorage, stores } = createSecretStorage();
    const service = createService({
      configuration,
      secretStorage,
      showInputBox: vi.fn()
        .mockResolvedValueOnce("https://api.example.com/v1")
        .mockResolvedValueOnce("gpt-test")
        .mockResolvedValueOnce("sk-test"),
      showQuickPick: vi.fn().mockImplementation(async (items) => items.find((item) => item.value === "openAICompatible"))
    });

    await expect(service.configureAiProvider()).resolves.toEqual({
      message: "AI provider configured",
      status: "ok"
    });

    expect(updates).toEqual([
      { key: "ai.provider", value: "openAICompatible" },
      { key: "ai.openAICompatible.baseUrl", value: "https://api.example.com/v1" },
      { key: "ai.openAICompatible.model", value: "gpt-test" }
    ]);
    expect(stores).toEqual([
      { key: apiKeySecretKey, value: "sk-test" }
    ]);
    expect(service.getSettings().ai.openAICompatible).toEqual({
      baseUrl: "https://api.example.com/v1",
      configured: true,
      model: "gpt-test"
    });
  });
});

function createService(input: {
  configuration?: SettingsConfiguration;
  secretStorage?: SettingsSecretStorage;
  showInputBox?: (options: Parameters<ConstructorParameters<typeof SettingsService>[0]["showInputBox"]>[0]) => Thenable<string | undefined>;
  showQuickPick?: ConstructorParameters<typeof SettingsService>[0]["showQuickPick"];
} = {}): SettingsService {
  const { configuration } = createConfiguration();
  const { secretStorage } = createSecretStorage();

  return new SettingsService({
    configuration: input.configuration ?? configuration,
    secretStorage: input.secretStorage ?? secretStorage,
    showInputBox: input.showInputBox ?? (async () => undefined),
    showQuickPick: input.showQuickPick ?? (async () => undefined)
  });
}

function createConfiguration(initial: Partial<Record<SettingsConfigurationKey, unknown>> = {}): {
  configuration: SettingsConfiguration;
  updates: Array<{ key: SettingsConfigurationKey; value: unknown }>;
} {
  const values: Partial<Record<SettingsConfigurationKey, unknown>> = { ...initial };
  const updates: Array<{ key: SettingsConfigurationKey; value: unknown }> = [];

  return {
    configuration: {
      get: (key) => values[key],
      update: async (key, value) => {
        updates.push({ key, value });
        values[key] = value;
      }
    },
    updates
  };
}

function createSecretStorage(initial: Record<string, string> = {}): {
  secretStorage: SettingsSecretStorage;
  stores: Array<{ key: string; value: string }>;
} {
  const secrets = new Map(Object.entries(initial));
  const stores: Array<{ key: string; value: string }> = [];

  return {
    secretStorage: {
      delete: async (key) => {
        secrets.delete(key);
      },
      get: async (key) => secrets.get(key),
      store: async (key, value) => {
        secrets.set(key, value);
        stores.push({ key, value });
      }
    },
    stores
  };
}
