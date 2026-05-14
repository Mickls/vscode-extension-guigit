import { ProxyAgent } from "undici";
import type { Dispatcher } from "undici";
import type { HttpAiProviderProtocol } from "../rpc/contract";
import type { ProxyConfig } from "./ProxyService";

export interface OpenAICompatibleCommitMessageProviderInput {
  fetch?: typeof fetch;
  getProxyConfig?: () => Promise<ProxyConfig>;
}

export interface OpenAICompatibleCommitMessageRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  protocol: HttpAiProviderProtocol;
}

interface OpenAICompatibleChatCompletionsResponse {
  choices?: readonly {
    message?: {
      content?: string | null;
    };
  }[];
}

interface OpenAIResponsesResponse {
  output_text?: string;
  output?: readonly {
    content?: readonly {
      text?: string;
      type?: string;
    }[];
  }[];
}

interface ClaudeMessagesResponse {
  content?: readonly {
    text?: string;
    type?: string;
  }[];
}

export class OpenAICompatibleCommitMessageProvider {
  private readonly fetch?: typeof fetch;
  private readonly getProxyConfig?: () => Promise<ProxyConfig>;

  public constructor(input: OpenAICompatibleCommitMessageProviderInput = {}) {
    this.fetch = input.fetch;
    this.getProxyConfig = input.getProxyConfig;
  }

  public async generate(input: OpenAICompatibleCommitMessageRequest): Promise<string> {
    const requestFetch = this.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!requestFetch) {
      throw new Error("OpenAI-compatible provider requires fetch support in this VS Code host");
    }

    const request = createRequest(input);
    const proxyConfig = await this.getProxyConfig?.();
    const dispatcher = proxyConfig ? createProxyDispatcher(request.url, proxyConfig) : undefined;
    const response = await requestFetch(request.url, {
      ...request.init,
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit & { dispatcher?: Dispatcher });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(formatStatusError(response.status, bodyText));
    }

    const payload = await response.json();
    const message = parseMessage(input.protocol, payload);
    if (!message) {
      throw new Error("OpenAI-compatible provider returned no commit message");
    }

    return firstLine(message);
  }
}

interface ProviderHttpRequest {
  init: RequestInit;
  url: string;
}

function createRequest(input: OpenAICompatibleCommitMessageRequest): ProviderHttpRequest {
  if (input.protocol === "responses") {
    return {
      init: {
        body: JSON.stringify({
          input: input.prompt,
          model: input.model
        }),
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      },
      url: createEndpointUrl(input.baseUrl, "responses")
    };
  }

  if (input.protocol === "claudeMessages") {
    return {
      init: {
        body: JSON.stringify({
          max_tokens: 64,
          messages: [
            {
              content: input.prompt,
              role: "user"
            }
          ],
          model: input.model
        }),
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": input.apiKey
        },
        method: "POST"
      },
      url: createEndpointUrl(input.baseUrl, "claudeMessages")
    };
  }

  return {
    init: {
      body: JSON.stringify({
        messages: [
          {
            content: input.prompt,
            role: "user"
          }
        ],
        model: input.model
      }),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    },
    url: createEndpointUrl(input.baseUrl, "chatCompletions")
  };
}

const endpointPaths = {
  chatCompletions: "/v1/chat/completions",
  claudeMessages: "/v1/messages",
  responses: "/v1/responses"
} as const satisfies Record<HttpAiProviderProtocol, string>;

function createEndpointUrl(baseUrl: string, protocol: HttpAiProviderProtocol): string {
  const url = new URL(baseUrl);
  const endpointPath = endpointPaths[protocol];
  const path = trimTrailingSlash(url.pathname);
  if (path === endpointPath || path.endsWith(endpointPath)) {
    return url.toString();
  }

  url.pathname = `${path === "/" ? "" : path}${endpointPath.startsWith("/v1/") && path.endsWith("/v1") ? endpointPath.slice(3) : endpointPath}`;
  return url.toString();
}

function createProxyDispatcher(url: string, config: ProxyConfig): Dispatcher | undefined {
  if (!config.enabled || isNoProxyHost(new URL(url).hostname, config.noProxy)) {
    return undefined;
  }

  const proxy = url.startsWith("https:") ? config.https ?? config.http : config.http ?? config.https;
  return proxy ? new ProxyAgent(normalizeProxyUrl(proxy)) : undefined;
}

function normalizeProxyUrl(proxy: string): string {
  return proxy.includes("://") ? proxy : `http://${proxy}`;
}

function isNoProxyHost(host: string, noProxy: string | undefined): boolean {
  if (!noProxy) {
    return false;
  }

  return noProxy
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .some((pattern) => pattern === "*" || host.toLowerCase() === pattern || host.toLowerCase().endsWith(`.${pattern.replace(/^\./, "")}`));
}

function parseMessage(protocol: HttpAiProviderProtocol, payload: unknown): string | undefined {
  if (protocol === "responses") {
    const response = payload as OpenAIResponsesResponse;
    return (
      response.output_text?.trim() ??
      response.output?.[0]?.content?.find((content) => content.type === "output_text" || content.text !== undefined)?.text?.trim()
    );
  }

  if (protocol === "claudeMessages") {
    const response = payload as ClaudeMessagesResponse;
    return response.content?.find((content) => content.type === "text")?.text?.trim();
  }

  const response = payload as OpenAICompatibleChatCompletionsResponse;
  return response.choices?.[0]?.message?.content?.trim();
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]!.trim();
}

function formatStatusError(statusCode: number, bodyText: string): string {
  const details = bodyText.trim();
  if (!details) {
    return `OpenAI-compatible request failed with status ${statusCode}`;
  }

  return `OpenAI-compatible request failed with status ${statusCode}: ${details.slice(0, 500)}`;
}
