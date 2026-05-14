import { describe, expect, it } from "vitest";
import { SettingsService, type SettingsConfiguration, type SettingsConfigurationKey, type SettingsSecretStorage, type SettingsStateStorage } from "../../src/state/SettingsService";

const apiKeySecretKey = "guigit.ai.openAICompatible.apiKey";

describe("SettingsService", () => {
  it("reads GUI Git History settings from configuration", () => {
    const { configuration } = createConfiguration({
      "ai.commitMessagePrompt.customRules": "Use imperative mood.",
      "ai.commitMessagePrompt.mode": "custom",
      "ai.openAICompatible.baseUrl": "https://api.example.com/v1",
      "ai.openAICompatible.model": "gpt-test",
      "ai.openAICompatible.protocol": "chatCompletions",
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
        commitMessagePrompt: {
          customRules: "Use imperative mood.",
          mode: "custom"
        },
        openAICompatible: {
          baseUrl: "https://api.example.com/v1",
          configured: true,
          model: "gpt-test",
          protocol: "chatCompletions"
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
        commitMessagePrompt: {
          customRules: "",
          mode: "default"
        },
        openAICompatible: {
          baseUrl: "https://api.example.com/v1",
          configured: true,
          model: "gpt-test",
          protocol: "chatCompletions"
        }
      }
    });

    expect(updates).toEqual([
      { key: "ai.provider", value: "openAICompatible" },
      { key: "ai.commitMessagePrompt.mode", value: "default" },
      { key: "ai.commitMessagePrompt.customRules", value: "" },
      { key: "ai.openAICompatible.protocol", value: "chatCompletions" },
      { key: "ai.openAICompatible.baseUrl", value: "https://api.example.com/v1" },
      { key: "ai.openAICompatible.model", value: "gpt-test" }
    ]);
    expect(service.getSettings().ai.openAICompatible).toEqual({
      baseUrl: "https://api.example.com/v1",
      configured: true,
      model: "gpt-test",
      protocol: "chatCompletions"
    });
    expect(await service.getOpenAICompatibleApiKey()).toBe("sk-test");
  });

  it("stores a replacement AI provider API key when provided in settings updates", async () => {
    const { configuration, updates } = createConfiguration();
    const { secretStorage, stores } = createSecretStorage({ [apiKeySecretKey]: "sk-old" });
    const service = createService({ configuration, secretStorage });

    await service.updateSettings({
      ai: {
        provider: "openAICompatible",
        commitMessagePrompt: {
          customRules: "Use imperative mood.",
          mode: "custom"
        },
        openAICompatible: {
          apiKey: "sk-new",
          baseUrl: "https://api.openai.com",
          configured: true,
          model: "gpt-test",
          protocol: "responses"
        }
      }
    });

    expect(updates).toEqual([
      { key: "ai.provider", value: "openAICompatible" },
      { key: "ai.commitMessagePrompt.mode", value: "custom" },
      { key: "ai.commitMessagePrompt.customRules", value: "Use imperative mood." },
      { key: "ai.openAICompatible.protocol", value: "responses" },
      { key: "ai.openAICompatible.baseUrl", value: "https://api.openai.com" },
      { key: "ai.openAICompatible.model", value: "gpt-test" }
    ]);
    expect(stores).toEqual([{ key: apiKeySecretKey, value: "sk-new" }]);
    expect(await service.getOpenAICompatibleApiKey()).toBe("sk-new");
  });

  it("preserves the stored AI provider API key when no replacement key is provided", async () => {
    const { configuration } = createConfiguration();
    const { secretStorage, stores } = createSecretStorage({ [apiKeySecretKey]: "sk-existing" });
    const service = createService({ configuration, secretStorage });

    await service.updateSettings({
      ai: {
        provider: "openAICompatible",
        commitMessagePrompt: {
          customRules: "",
          mode: "default"
        },
        openAICompatible: {
          baseUrl: "https://api.openai.com",
          configured: true,
          model: "gpt-test",
          protocol: "chatCompletions"
        }
      }
    });

    expect(stores).toEqual([]);
    expect(await service.getOpenAICompatibleApiKey()).toBe("sk-existing");
  });

  it("stores AI provider settings in global extension state when state storage is available", async () => {
    const { configuration, updates } = createConfiguration({
      "ai.openAICompatible.baseUrl": "https://settings.example.com",
      "ai.openAICompatible.model": "settings-model",
      "ai.provider": "vscodeLanguageModel"
    });
    const { stateStorage, stateUpdates } = createStateStorage({
      "guigit.ai.openAICompatible.baseUrl": "https://state.example.com",
      "guigit.ai.openAICompatible.model": "state-model",
      "guigit.ai.provider": "openAICompatible"
    });
    const service = createService({ configuration, stateStorage });

    expect(service.getSettings().ai).toEqual({
      provider: "openAICompatible",
      commitMessagePrompt: {
        customRules: "",
        mode: "default"
      },
      openAICompatible: {
        baseUrl: "https://state.example.com",
        configured: true,
        model: "state-model",
        protocol: "chatCompletions"
      }
    });

    await service.updateSettings({
      ai: {
        provider: "openAICompatible",
        commitMessagePrompt: {
          customRules: "Use imperative mood.",
          mode: "custom"
        },
        openAICompatible: {
          baseUrl: "https://api.openai.com",
          configured: true,
          model: "gpt-test",
          protocol: "responses"
        }
      }
    });

    expect(updates).toEqual([]);
    expect(stateUpdates).toEqual([
      { key: "guigit.ai.provider", value: "openAICompatible" },
      { key: "guigit.ai.commitMessagePrompt.mode", value: "custom" },
      { key: "guigit.ai.commitMessagePrompt.customRules", value: "Use imperative mood." },
      { key: "guigit.ai.openAICompatible.protocol", value: "responses" },
      { key: "guigit.ai.openAICompatible.baseUrl", value: "https://api.openai.com" },
      { key: "guigit.ai.openAICompatible.model", value: "gpt-test" }
    ]);
  });

  it("keeps QuickPick AI configuration disabled for the Webview panel flow", async () => {
    const service = createService();

    await expect(service.configureAiProvider()).resolves.toEqual({
      message: "AI provider configuration is available in the Webview",
      status: "cancelled"
    });
  });
});

function createService(input: {
  configuration?: SettingsConfiguration;
  secretStorage?: SettingsSecretStorage;
  stateStorage?: SettingsStateStorage;
} = {}): SettingsService {
  const { configuration } = createConfiguration();
  const { secretStorage } = createSecretStorage();

  return new SettingsService({
    configuration: input.configuration ?? configuration,
    secretStorage: input.secretStorage ?? secretStorage,
    stateStorage: input.stateStorage
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

function createStateStorage(initial: Record<string, unknown> = {}): {
  stateStorage: SettingsStateStorage;
  stateUpdates: Array<{ key: string; value: unknown }>;
} {
  const values = new Map(Object.entries(initial));
  const stateUpdates: Array<{ key: string; value: unknown }> = [];

  return {
    stateStorage: {
      get: (key) => values.get(key),
      update: async (key, value) => {
        values.set(key, value);
        stateUpdates.push({ key, value });
      }
    },
    stateUpdates
  };
}
