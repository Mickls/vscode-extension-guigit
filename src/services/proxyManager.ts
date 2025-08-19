import * as os from "os";
import * as vscode from "vscode";

export interface ProxyConfig {
  http?: string;
  https?: string;
  noProxy?: string;
  enabled: boolean;
}

/**
 * 代理管理器 - 自动检测和应用用户的代理设置
 */
export class ProxyManager {
  private static instance: ProxyManager;
  private cachedConfig: ProxyConfig | null = null;
  private lastCheckTime: number = 0;
  private readonly CACHE_TTL = 30000; // 30秒缓存

  private constructor() {}

  public static getInstance(): ProxyManager {
    if (!ProxyManager.instance) {
      ProxyManager.instance = new ProxyManager();
    }
    return ProxyManager.instance;
  }

  /**
   * 获取当前的代理配置
   */
  public async getProxyConfig(): Promise<ProxyConfig> {
    const now = Date.now();

    // 检查缓存是否有效
    if (this.cachedConfig && now - this.lastCheckTime < this.CACHE_TTL) {
      return this.cachedConfig;
    }

    const config = await this.detectProxyConfig();
    this.cachedConfig = config;
    this.lastCheckTime = now;

    return config;
  }

  /**
   * 检测代理配置
   */
  private async detectProxyConfig(): Promise<ProxyConfig> {
    const config: ProxyConfig = { enabled: false };

    try {
      // 1. 首先检查 VSCode 的代理设置
      const vscodeProxy = this.getVSCodeProxyConfig();
      if (vscodeProxy.enabled) {
        return vscodeProxy;
      }

      // 2. 检查环境变量
      const envProxy = this.getEnvironmentProxyConfig();
      if (envProxy.enabled) {
        return envProxy;
      }

      // 3. 检查系统代理设置
      const systemProxy = await this.getSystemProxyConfig();
      if (systemProxy.enabled) {
        return systemProxy;
      }

      // 4. 检查常见代理软件的配置
      const appProxy = await this.getProxyAppConfig();
      if (appProxy.enabled) {
        return appProxy;
      }
    } catch (error) {
      console.warn("检测代理配置时出错:", error);
    }

    return config;
  }

  /**
   * 获取 VSCode 的代理设置
   */
  private getVSCodeProxyConfig(): ProxyConfig {
    const config: ProxyConfig = { enabled: false };

    try {
      const vscodeConfig = vscode.workspace.getConfiguration("http");
      const proxy = vscodeConfig.get<string>("proxy");
      const proxyStrictSSL = vscodeConfig.get<boolean>("proxyStrictSSL", true);

      if (proxy && proxy.trim()) {
        config.http = proxy;
        config.https = proxy;
        config.enabled = true;

        console.log("检测到 VSCode 代理配置:", proxy);
      }
    } catch (error) {
      console.warn("读取 VSCode 代理配置失败:", error);
    }

    return config;
  }

  /**
   * 获取环境变量中的代理设置
   */
  private getEnvironmentProxyConfig(): ProxyConfig {
    const config: ProxyConfig = { enabled: false };

    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const noProxy = process.env.NO_PROXY || process.env.no_proxy;

    if (httpProxy || httpsProxy) {
      config.http = httpProxy;
      config.https = httpsProxy || httpProxy;
      config.noProxy = noProxy;
      config.enabled = true;

      console.log("检测到环境变量代理配置:", {
        http: httpProxy,
        https: httpsProxy,
      });
    }

    return config;
  }

  /**
   * 获取系统代理设置
   */
  private async getSystemProxyConfig(): Promise<ProxyConfig> {
    const config: ProxyConfig = { enabled: false };

    try {
      const platform = os.platform();

      if (platform === "darwin") {
        // macOS 系统代理
        return await this.getMacOSProxyConfig();
      } else if (platform === "win32") {
        // Windows 系统代理
        return await this.getWindowsProxyConfig();
      } else if (platform === "linux") {
        // Linux 系统代理
        return await this.getLinuxProxyConfig();
      }
    } catch (error) {
      console.warn("读取系统代理配置失败:", error);
    }

    return config;
  }

  /**
   * 获取 macOS 系统代理配置
   */
  private async getMacOSProxyConfig(): Promise<ProxyConfig> {
    const config: ProxyConfig = { enabled: false };

    try {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      // 获取网络服务列表
      const { stdout: services } = await execAsync(
        "networksetup -listallnetworkservices"
      );
      const serviceLines = services
        .split("\n")
        .filter(
          (line: string) =>
            line && !line.startsWith("*") && !line.includes("An asterisk")
        );

      for (const service of serviceLines) {
        try {
          // 检查 HTTP 代理
          const { stdout: httpResult } = await execAsync(
            `networksetup -getwebproxy "${service}"`
          );
          if (httpResult.includes("Enabled: Yes")) {
            const serverMatch = httpResult.match(/Server: (.+)/);
            const portMatch = httpResult.match(/Port: (\d+)/);

            if (serverMatch && portMatch) {
              const proxyUrl = `http://${serverMatch[1]}:${portMatch[1]}`;
              config.http = proxyUrl;
              config.enabled = true;
            }
          }

          // 检查 HTTPS 代理
          const { stdout: httpsResult } = await execAsync(
            `networksetup -getsecurewebproxy "${service}"`
          );
          if (httpsResult.includes("Enabled: Yes")) {
            const serverMatch = httpsResult.match(/Server: (.+)/);
            const portMatch = httpsResult.match(/Port: (\d+)/);

            if (serverMatch && portMatch) {
              const proxyUrl = `http://${serverMatch[1]}:${portMatch[1]}`;
              config.https = proxyUrl;
              config.enabled = true;
            }
          }

          if (config.enabled) {
            console.log("检测到 macOS 系统代理配置:", config);
            break;
          }
        } catch (serviceError) {
          // 忽略单个服务的错误，继续检查其他服务
          continue;
        }
      }
    } catch (error) {
      console.warn("读取 macOS 代理配置失败:", error);
    }

    return config;
  }

  /**
   * 获取 Windows 系统代理配置
   */
  private async getWindowsProxyConfig(): Promise<ProxyConfig> {
    const config: ProxyConfig = { enabled: false };

    try {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      // 读取注册表中的代理设置
      const { stdout } = await execAsync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable'
      );

      if (stdout.includes("0x1")) {
        // 代理已启用，获取代理服务器
        const { stdout: proxyServer } = await execAsync(
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer'
        );
        const match = proxyServer.match(/ProxyServer\s+REG_SZ\s+(.+)/);

        if (match) {
          const proxy = match[1].trim();
          config.http = `http://${proxy}`;
          config.https = `http://${proxy}`;
          config.enabled = true;

          console.log("检测到 Windows 系统代理配置:", proxy);
        }
      }
    } catch (error) {
      console.warn("读取 Windows 代理配置失败:", error);
    }

    return config;
  }

  /**
   * 获取 Linux 系统代理配置
   */
  private async getLinuxProxyConfig(): Promise<ProxyConfig> {
    const config: ProxyConfig = { enabled: false };

    try {
      // 检查 GNOME 代理设置
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync(
          "gsettings get org.gnome.system.proxy mode"
        );
        if (stdout.includes("manual")) {
          const { stdout: httpHost } = await execAsync(
            "gsettings get org.gnome.system.proxy.http host"
          );
          const { stdout: httpPort } = await execAsync(
            "gsettings get org.gnome.system.proxy.http port"
          );

          const host = httpHost.replace(/'/g, "").trim();
          const port = httpPort.trim();

          if (host && port && host !== "''" && port !== "0") {
            const proxyUrl = `http://${host}:${port}`;
            config.http = proxyUrl;
            config.https = proxyUrl;
            config.enabled = true;

            console.log("检测到 Linux GNOME 代理配置:", proxyUrl);
          }
        }
      } catch (gnomeError) {
        // GNOME 设置不可用，忽略
      }
    } catch (error) {
      console.warn("读取 Linux 代理配置失败:", error);
    }

    return config;
  }

  /**
   * 检查常见代理软件的配置
   */
  private async getProxyAppConfig(): Promise<ProxyConfig> {
    const config: ProxyConfig = { enabled: false };

    try {
      // 检查常见的代理端口
      const commonPorts = [
        { port: 7890, name: "Clash" },
        { port: 1080, name: "SOCKS" },
        { port: 8080, name: "HTTP Proxy" },
        { port: 8888, name: "Shadowsocks" },
        { port: 1087, name: "Shadowsocks" },
        { port: 7891, name: "Clash" },
      ];

      for (const proxy of commonPorts) {
        if (await this.isPortOpen("127.0.0.1", proxy.port)) {
          const proxyUrl = `http://127.0.0.1:${proxy.port}`;
          config.http = proxyUrl;
          config.https = proxyUrl;
          config.enabled = true;

          console.log(`检测到 ${proxy.name} 代理配置:`, proxyUrl);
          break;
        }
      }
    } catch (error) {
      console.warn("检查代理软件配置失败:", error);
    }

    return config;
  }

  /**
   * 检查端口是否开放
   */
  private async isPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require("net");
      const socket = new net.Socket();

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

  /**
   * 应用代理配置到环境变量
   */
  public applyProxyToEnvironment(config: ProxyConfig): void {
    if (!config.enabled) {
      return;
    }

    if (config.http) {
      process.env.HTTP_PROXY = config.http;
      process.env.http_proxy = config.http;
    }

    if (config.https) {
      process.env.HTTPS_PROXY = config.https;
      process.env.https_proxy = config.https;
    }

    if (config.noProxy) {
      process.env.NO_PROXY = config.noProxy;
      process.env.no_proxy = config.noProxy;
    }

    console.log("已应用代理配置到环境变量:", config);
  }

  /**
   * 清除缓存，强制重新检测
   */
  public clearCache(): void {
    this.cachedConfig = null;
    this.lastCheckTime = 0;
  }

  /**
   * 获取 Git 代理配置参数
   */
  public getGitProxyConfig(config: ProxyConfig): string[] {
    const gitConfig: string[] = [];

    if (!config.enabled) {
      return gitConfig;
    }

    if (config.http) {
      gitConfig.push(`http.proxy=${config.http}`);
    }

    if (config.https) {
      gitConfig.push(`https.proxy=${config.https || config.http}`);
    }

    return gitConfig;
  }
}
