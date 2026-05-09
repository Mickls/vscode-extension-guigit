import { describe, expect, it, vi } from "vitest";
import { ProxyService } from "../../src/backend/git/ProxyService";

describe("ProxyService", () => {
  it("prefers custom proxy settings", async () => {
    const service = createService({
      settings: {
        proxy: {
          enabled: true,
          http: "http://127.0.0.1:7890",
          https: "http://127.0.0.1:7891",
          noProxy: "localhost"
        }
      }
    });

    await expect(service.getProxyConfig()).resolves.toEqual({
      enabled: true,
      http: "http://127.0.0.1:7890",
      https: "http://127.0.0.1:7891",
      noProxy: "localhost",
      source: "custom"
    });
  });

  it("uses VS Code proxy settings after custom settings", async () => {
    const service = createService({
      vscodeProxy: "http://proxy.example:8080"
    });

    await expect(service.getProxyConfig()).resolves.toEqual({
      enabled: true,
      http: "http://proxy.example:8080",
      https: "http://proxy.example:8080",
      source: "vscode"
    });
  });

  it("uses environment proxy variables after VS Code settings", async () => {
    const service = createService({
      env: {
        HTTP_PROXY: "http://env-http:8080",
        HTTPS_PROXY: "http://env-https:8080",
        NO_PROXY: "localhost,127.0.0.1"
      }
    });

    await expect(service.getProxyConfig()).resolves.toEqual({
      enabled: true,
      http: "http://env-http:8080",
      https: "http://env-https:8080",
      noProxy: "localhost,127.0.0.1",
      source: "environment"
    });
  });

  it("detects macOS, Windows, and Linux system proxy settings", async () => {
    await expect(createService({
      exec: async (command) => {
        if (command === "networksetup -listallnetworkservices") {
          return "Wi-Fi\n";
        }

        if (command === "networksetup -getwebproxy \"Wi-Fi\"") {
          return "Enabled: Yes\nServer: 127.0.0.1\nPort: 7890\n";
        }

        return "Enabled: No\n";
      },
      platform: "darwin"
    }).getProxyConfig()).resolves.toEqual({
      enabled: true,
      http: "http://127.0.0.1:7890",
      https: undefined,
      source: "system"
    });

    await expect(createService({
      exec: async (command) => {
        if (command.includes("ProxyEnable")) {
          return "ProxyEnable    REG_DWORD    0x1";
        }

        return "ProxyServer    REG_SZ    127.0.0.1:7890";
      },
      platform: "win32"
    }).getProxyConfig()).resolves.toEqual({
      enabled: true,
      http: "http://127.0.0.1:7890",
      https: "http://127.0.0.1:7890",
      source: "system"
    });

    await expect(createService({
      exec: async (command) => {
        if (command === "gsettings get org.gnome.system.proxy mode") {
          return "'manual'";
        }

        if (command === "gsettings get org.gnome.system.proxy.http host") {
          return "'127.0.0.1'";
        }

        return "7890";
      },
      platform: "linux"
    }).getProxyConfig()).resolves.toEqual({
      enabled: true,
      http: "http://127.0.0.1:7890",
      https: "http://127.0.0.1:7890",
      source: "system"
    });
  });

  it("detects common local proxy app ports", async () => {
    const service = createService({
      isPortOpen: async (_host, port) => port === 7890
    });

    await expect(service.getProxyConfig()).resolves.toEqual({
      enabled: true,
      http: "http://127.0.0.1:7890",
      https: "http://127.0.0.1:7890",
      source: "local-app"
    });
  });

  it("applies proxy to simple-git config and environment", async () => {
    const raw = vi.fn().mockResolvedValue("ok");
    const service = createService({
      env: {},
      settings: {
        proxy: {
          enabled: true,
          http: "http://127.0.0.1:7890",
          https: "http://127.0.0.1:7891",
          noProxy: "localhost"
        }
      },
      simpleGitFactory: vi.fn().mockReturnValue({ raw })
    });

    await expect(service.runRaw("/repo", ["fetch", "origin"])).resolves.toBe("ok");

    expect(service.getEnvironment()).toEqual({
      HTTP_PROXY: "http://127.0.0.1:7890",
      HTTPS_PROXY: "http://127.0.0.1:7891",
      NO_PROXY: "localhost",
      http_proxy: "http://127.0.0.1:7890",
      https_proxy: "http://127.0.0.1:7891",
      no_proxy: "localhost"
    });
    expect(service.getGitConfig()).toEqual([
      "core.quotepath=false",
      "log.showSignature=false",
      "http.proxy=http://127.0.0.1:7890",
      "https.proxy=http://127.0.0.1:7891"
    ]);
    expect(raw).toHaveBeenCalledWith(["fetch", "origin"]);
  });
});

function createService(input: {
  env?: Record<string, string | undefined>;
  exec?: (command: string) => Promise<string>;
  isPortOpen?: (host: string, port: number) => Promise<boolean>;
  platform?: NodeJS.Platform;
  settings?: {
    proxy: {
      enabled: boolean;
      http: string;
      https: string;
      noProxy: string;
    };
  };
  simpleGitFactory?: (repositoryRoot: string, options: { config: readonly string[] }) => { raw(args: readonly string[]): Promise<string> };
  vscodeProxy?: string;
}): ProxyService {
  return new ProxyService({
    env: input.env ?? {},
    exec: input.exec ?? (async () => ""),
    isPortOpen: input.isPortOpen ?? (async () => false),
    platform: () => input.platform ?? "linux",
    settingsService: {
      getSettings: () => ({
        autoStashOnPull: "ask",
        blameEnabled: true,
        blameFormat: "${author}, ${time}: ${summary}",
        blameShowOnlyCurrentLine: false,
        fileViewMode: "tree",
        language: "auto",
        proxy: input.settings?.proxy ?? {
          enabled: false,
          http: "",
          https: "",
          noProxy: ""
        }
      })
    },
    simpleGitFactory: input.simpleGitFactory,
    vscodeProxy: () => input.vscodeProxy
  });
}
