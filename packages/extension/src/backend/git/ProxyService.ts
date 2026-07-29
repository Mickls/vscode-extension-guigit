import { exec as childExec } from "child_process";
import { Socket } from "net";
import { platform as osPlatform } from "os";
import { delimiter } from "path";
import { promisify } from "util";
import { simpleGit } from "simple-git";
import type { OperationResultViewModel } from "../rpc/contract";
import type { SettingsService } from "../../state/SettingsService";

export type ProxySource = "custom" | "environment" | "git" | "local-app" | "none" | "system" | "vscode";

export interface ProxyConfig {
  enabled: boolean;
  http?: string;
  https?: string;
  noProxy?: string;
  source: ProxySource;
}

export interface ProxyServiceInput {
  env?: Record<string, string | undefined>;
  exec?: (command: string) => Promise<string>;
  isPortOpen?: (host: string, port: number) => Promise<boolean>;
  platform?: () => NodeJS.Platform;
  settingsService: Pick<SettingsService, "getSettings" | "updateSettings">;
  showInputBox?: (options: { placeHolder?: string; prompt: string; value?: string }) => Thenable<string | undefined>;
  showQuickPick?: (
    items: readonly ProxyQuickPickItem[],
    options: { placeHolder: string }
  ) => Thenable<ProxyQuickPickItem | undefined>;
  simpleGitFactory?: (repositoryRoot: string, options: { config: readonly string[] }) => {
    raw(args: readonly string[]): Promise<string>;
  };
  vscodeProxy?: () => string | undefined;
}

const execAsync = promisify(childExec);
const baseGitConfig = ["core.quotepath=false", "log.showSignature=false"];
const gitLfsMissingMessage = "This repository uses Git LFS, but git-lfs is not available to Git. Install Git LFS or make git-lfs available on VS Code's PATH, then retry. If this repository should no longer use Git LFS, remove the repository's Git LFS attributes/hook configuration instead of bypassing hooks.";
const gitToolPathCandidates = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
const noProxyConfig: ProxyConfig = {
  enabled: false,
  source: "none"
};

function isGitLfsMissingError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("git-lfs") && (
    message.includes("not found") ||
    message.includes("command not found") ||
    message.includes("is not a git command")
  );
}

export class ProxyService {
  private readonly env: Record<string, string | undefined>;
  private readonly exec: (command: string) => Promise<string>;
  private readonly isPortOpen: (host: string, port: number) => Promise<boolean>;
  private lastConfig: ProxyConfig = noProxyConfig;
  private readonly platform: () => NodeJS.Platform;
  private readonly settingsService: Pick<SettingsService, "getSettings" | "updateSettings">;
  private readonly showInputBox?: (options: { placeHolder?: string; prompt: string; value?: string }) => Thenable<string | undefined>;
  private readonly showQuickPick?: (
    items: readonly ProxyQuickPickItem[],
    options: { placeHolder: string }
  ) => Thenable<ProxyQuickPickItem | undefined>;
  private readonly simpleGitFactory: (repositoryRoot: string, options: { config: readonly string[] }) => {
    raw(args: readonly string[]): Promise<string>;
  };
  private readonly vscodeProxy: () => string | undefined;

  public constructor(input: ProxyServiceInput) {
    this.env = input.env ?? process.env;
    this.exec = input.exec ?? (async (command) => (await execAsync(command)).stdout);
    this.isPortOpen = input.isPortOpen ?? isLocalPortOpen;
    this.platform = input.platform ?? osPlatform;
    this.settingsService = input.settingsService;
    this.showInputBox = input.showInputBox;
    this.showQuickPick = input.showQuickPick;
    this.simpleGitFactory = input.simpleGitFactory ?? ((repositoryRoot, options) => {
      const git = simpleGit(repositoryRoot, {
        config: [...options.config]
      });
      return {
        raw: (args) => git.raw([...args])
      };
    });
    this.vscodeProxy = input.vscodeProxy ?? (() => undefined);
  }

  public async getProxyConfig(): Promise<ProxyConfig> {
    const config = await this.firstAvailableProxyConfig([
      () => Promise.resolve(this.getCustomProxyConfig()),
      () => this.getGitProxyConfig(),
      () => Promise.resolve(this.getVSCodeProxyConfig()),
      () => Promise.resolve(this.getEnvironmentProxyConfig()),
      () => this.getSystemProxyConfig(),
      () => this.getLocalProxyAppConfig()
    ]);
    this.lastConfig = config;
    return config;
  }

  public async getConfiguredProxyConfig(): Promise<ProxyConfig> {
    const config = await this.firstAvailableProxyConfig([
      () => Promise.resolve(this.getCustomProxyConfig()),
      () => this.getGitProxyConfig()
    ]);
    this.lastConfig = config;
    return config;
  }

  public getGitConfig(config = this.lastConfig): readonly string[] {
    if (!config.enabled) {
      return baseGitConfig;
    }

    const proxyConfig: string[] = [...baseGitConfig];
    if (config.http) {
      proxyConfig.push(`http.proxy=${config.http}`);
    }

    if (config.https) {
      proxyConfig.push(`https.proxy=${config.https}`);
    }

    return proxyConfig;
  }

  public getEnvironment(): Record<string, string | undefined> {
    return this.env;
  }

  public async runRaw(repositoryRoot: string, args: readonly string[]): Promise<string> {
    const config = await this.getProxyConfig();
    this.applyGitToolPathsToEnvironment();
    this.applyProxyToEnvironment(config);
    try {
      return await this.simpleGitFactory(repositoryRoot, { config: this.getGitConfig(config) }).raw(args);
    } catch (error) {
      if (isGitLfsMissingError(error)) {
        throw new Error(gitLfsMissingMessage);
      }

      throw error;
    }
  }

  private applyGitToolPathsToEnvironment(): void {
    const pathKey = this.getPathEnvironmentKey();
    const currentPath = this.env[pathKey] ?? "";
    const pathEntries = currentPath.split(delimiter).filter((entry) => entry.length > 0);
    const pathEntrySet = new Set(pathEntries);
    const missingEntries = gitToolPathCandidates.filter((entry) => !pathEntrySet.has(entry));
    if (missingEntries.length === 0) {
      return;
    }

    this.env[pathKey] = [...pathEntries, ...missingEntries].join(delimiter);
  }

  private getPathEnvironmentKey(): string {
    return Object.keys(this.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  }

  public async configureProxy(): Promise<OperationResultViewModel> {
    const choice = await this.showQuickPick?.(proxyConfigurationItems, {
      placeHolder: "Configure Git proxy"
    });
    if (!choice) {
      return {
        message: "Proxy configuration cancelled",
        status: "cancelled"
      };
    }

    if (choice.mode === "disable") {
      await this.settingsService.updateSettings({
        proxy: {
          enabled: false,
          http: "",
          https: "",
          noProxy: ""
        }
      });
      this.lastConfig = noProxyConfig;
      return {
        message: "Custom proxy disabled",
        status: "ok"
      };
    }

    const current = this.settingsService.getSettings().proxy;
    const http = await this.showInputBox?.({
      placeHolder: "http://127.0.0.1:7890",
      prompt: "HTTP proxy",
      value: current.http
    });
    if (http === undefined) {
      return {
        message: "Proxy configuration cancelled",
        status: "cancelled"
      };
    }

    const https = await this.showInputBox?.({
      placeHolder: "http://127.0.0.1:7890",
      prompt: "HTTPS proxy",
      value: current.https || http
    });
    if (https === undefined) {
      return {
        message: "Proxy configuration cancelled",
        status: "cancelled"
      };
    }

    const noProxy = await this.showInputBox?.({
      placeHolder: "localhost,127.0.0.1",
      prompt: "No proxy hosts",
      value: current.noProxy
    });
    if (noProxy === undefined) {
      return {
        message: "Proxy configuration cancelled",
        status: "cancelled"
      };
    }

    await this.settingsService.updateSettings({
      proxy: {
        enabled: true,
        http: http.trim(),
        https: https.trim(),
        noProxy: noProxy.trim()
      }
    });
    return {
      message: "Custom proxy configured",
      status: "ok"
    };
  }

  public async refreshProxy(): Promise<OperationResultViewModel> {
    const config = await this.getProxyConfig();
    return {
      message: `Proxy refreshed: ${describeProxyConfig(config)}`,
      status: "ok"
    };
  }

  private async firstAvailableProxyConfig(
    candidates: readonly (() => Promise<ProxyConfig | undefined>)[]
  ): Promise<ProxyConfig> {
    for (const candidate of candidates) {
      const config = await candidate();
      if (config && await this.isProxyReachable(config)) {
        return config;
      }
    }

    return noProxyConfig;
  }

  private async isProxyReachable(config: ProxyConfig): Promise<boolean> {
    const endpoints = [...new Set([config.http, config.https].filter((proxy): proxy is string => Boolean(proxy)))];
    for (const proxy of endpoints) {
      const endpoint = localProxyEndpoint(proxy);
      if (endpoint && !(await this.isPortOpen(endpoint.host, endpoint.port))) {
        return false;
      }
    }

    return true;
  }

  private applyProxyToEnvironment(config: ProxyConfig): void {
    if (!config.enabled) {
      return;
    }

    if (config.http) {
      this.env.HTTP_PROXY = config.http;
      this.env.http_proxy = config.http;
    }

    if (config.https) {
      this.env.HTTPS_PROXY = config.https;
      this.env.https_proxy = config.https;
    }

    if (config.noProxy) {
      this.env.NO_PROXY = config.noProxy;
      this.env.no_proxy = config.noProxy;
    }
  }

  private getCustomProxyConfig(): ProxyConfig | undefined {
    const proxy = this.settingsService.getSettings().proxy;
    if (!proxy.enabled || (!proxy.http && !proxy.https)) {
      return undefined;
    }

    return {
      enabled: true,
      http: proxy.http || undefined,
      https: proxy.https || proxy.http || undefined,
      noProxy: proxy.noProxy || undefined,
      source: "custom"
    };
  }

  private getVSCodeProxyConfig(): ProxyConfig | undefined {
    const proxy = this.vscodeProxy()?.trim();
    if (!proxy) {
      return undefined;
    }

    return {
      enabled: true,
      http: proxy,
      https: proxy,
      source: "vscode"
    };
  }

  private async getGitProxyConfig(): Promise<ProxyConfig | undefined> {
    const [http, https] = await Promise.all([
      this.getOptionalExecOutput("git config --global --get http.proxy"),
      this.getOptionalExecOutput("git config --global --get https.proxy")
    ]);
    if (!http && !https) {
      return undefined;
    }

    return {
      enabled: true,
      http,
      https: https ?? http,
      source: "git"
    };
  }

  private async getOptionalExecOutput(command: string): Promise<string | undefined> {
    try {
      const output = (await this.exec(command)).trim();
      return output || undefined;
    } catch {
      return undefined;
    }
  }

  private getEnvironmentProxyConfig(): ProxyConfig | undefined {
    const http = this.env.HTTP_PROXY ?? this.env.http_proxy;
    const https = this.env.HTTPS_PROXY ?? this.env.https_proxy;
    if (!http && !https) {
      return undefined;
    }

    return {
      enabled: true,
      http,
      https: https ?? http,
      noProxy: this.env.NO_PROXY ?? this.env.no_proxy,
      source: "environment"
    };
  }

  private async getSystemProxyConfig(): Promise<ProxyConfig | undefined> {
    const platform = this.platform();
    if (platform === "darwin") {
      return this.getMacOSProxyConfig();
    }

    if (platform === "win32") {
      return this.getWindowsProxyConfig();
    }

    if (platform === "linux") {
      return this.getLinuxProxyConfig();
    }

    return undefined;
  }

  private async getMacOSProxyConfig(): Promise<ProxyConfig | undefined> {
    const services = await this.exec("networksetup -listallnetworkservices");
    for (const service of services.split("\n").filter((line) => line && !line.startsWith("*") && !line.includes("An asterisk"))) {
      const http = await this.exec(`networksetup -getwebproxy "${service}"`);
      const https = await this.exec(`networksetup -getsecurewebproxy "${service}"`);
      const config = {
        enabled: true,
        http: parseNetworkSetupProxy(http),
        https: parseNetworkSetupProxy(https),
        source: "system"
      } satisfies ProxyConfig;
      if (config.http || config.https) {
        return config;
      }
    }

    return undefined;
  }

  private async getWindowsProxyConfig(): Promise<ProxyConfig | undefined> {
    const enabled = await this.exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable');
    if (!enabled.includes("0x1")) {
      return undefined;
    }

    const proxyServer = await this.exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer');
    const proxy = proxyServer.match(/ProxyServer\s+REG_SZ\s+(.+)/)![1]!.trim();
    return {
      enabled: true,
      http: `http://${proxy}`,
      https: `http://${proxy}`,
      source: "system"
    };
  }

  private async getLinuxProxyConfig(): Promise<ProxyConfig | undefined> {
    const mode = await this.exec("gsettings get org.gnome.system.proxy mode");
    if (!mode.includes("manual")) {
      return undefined;
    }

    const host = (await this.exec("gsettings get org.gnome.system.proxy.http host")).replace(/'/g, "").trim();
    const port = (await this.exec("gsettings get org.gnome.system.proxy.http port")).trim();
    const proxy = `http://${host}:${port}`;
    return {
      enabled: true,
      http: proxy,
      https: proxy,
      source: "system"
    };
  }

  private async getLocalProxyAppConfig(): Promise<ProxyConfig | undefined> {
    for (const port of [7890, 1080, 8080, 8888, 1087, 7891]) {
      if (await this.isPortOpen("127.0.0.1", port)) {
        const proxy = `http://127.0.0.1:${port}`;
        return {
          enabled: true,
          http: proxy,
          https: proxy,
          source: "local-app"
        };
      }
    }

    return undefined;
  }
}

interface ProxyQuickPickItem {
  label: string;
  mode: "disable" | "enable";
}

const proxyConfigurationItems = [
  { label: "Enable custom proxy", mode: "enable" },
  { label: "Disable custom proxy", mode: "disable" }
] as const satisfies readonly ProxyQuickPickItem[];

function describeProxyConfig(config: ProxyConfig): string {
  if (!config.enabled) {
    return "disabled";
  }

  return `${config.source} ${config.https ?? config.http}`;
}

function localProxyEndpoint(proxy: string): { host: string; port: number } | undefined {
  try {
    const url = new URL(proxy.includes("://") ? proxy : `http://${proxy}`);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host !== "localhost" && host !== "::1" && !host.startsWith("127.")) {
      return undefined;
    }

    const defaultPort = url.protocol === "https:" ? 443 : 80;
    return {
      host,
      port: Number(url.port || defaultPort)
    };
  } catch {
    return undefined;
  }
}

function parseNetworkSetupProxy(output: string): string | undefined {
  if (!output.includes("Enabled: Yes")) {
    return undefined;
  }

  const server = output.match(/Server: (.+)/)![1]!;
  const port = output.match(/Port: (\d+)/)![1]!;
  return `http://${server}:${port}`;
}

function isLocalPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
    socket.connect(port, host);
  });
}
