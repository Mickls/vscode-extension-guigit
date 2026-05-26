import { ProxyAgent } from "undici";
import type { Dispatcher } from "undici";
import type { HttpAiProviderProtocol } from "../rpc/contract";
import type { ProxyConfig } from "./ProxyService";

export interface OpenAICompatibleCommitMessageProviderInput {
  fetch?: typeof fetch;
  getProxyConfig?: () => Promise<ProxyConfig>;
  retryDelay?: (milliseconds: number) => Promise<void>;
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

interface OpenAIResponsesStreamEvent {
  delta?: string;
  error?: {
    message?: string;
    type?: string;
  };
  response?: OpenAIResponsesResponse & {
    error?: {
      message?: string;
      type?: string;
    };
  };
  text?: string;
  type?: string;
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
  private readonly retryDelay: (milliseconds: number) => Promise<void>;

  public constructor(input: OpenAICompatibleCommitMessageProviderInput = {}) {
    this.fetch = input.fetch;
    this.getProxyConfig = input.getProxyConfig;
    this.retryDelay = input.retryDelay ?? delay;
  }

  public async generate(input: OpenAICompatibleCommitMessageRequest): Promise<string> {
    const requestFetch = this.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!requestFetch) {
      throw new Error("OpenAI-compatible provider requires fetch support in this VS Code host");
    }

    const request = createRequest(input);
    const proxyConfig = await this.getProxyConfig?.();
    const dispatcher = proxyConfig ? createProxyDispatcher(request.url, proxyConfig) : undefined;
    const response = await this.fetchWithRetry(requestFetch, request, dispatcher);

    const message = await parseResponseMessage(input.protocol, response);
    if (!message) {
      throw new Error("OpenAI-compatible provider returned no commit message");
    }

    return firstLine(message);
  }

  private async fetchWithRetry(requestFetch: typeof fetch, request: ProviderHttpRequest, dispatcher: Dispatcher | undefined): Promise<Response> {
    const init = {
      ...request.init,
      ...(dispatcher ? { dispatcher } : {})
    } as RequestInit & { dispatcher?: Dispatcher };

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      let response: Response;
      try {
        response = await requestFetch(request.url, init);
      } catch (error) {
        if (attempt === retryDelaysMs.length) {
          throw error;
        }

        await this.retryDelay(retryDelaysMs[attempt]!);
        continue;
      }

      if (response.ok) {
        return response;
      }

      const bodyText = await response.text();
      if (!isRetryableStatus(response.status) || attempt === retryDelaysMs.length) {
        throw new Error(formatStatusError(response.status, bodyText));
      }

      await this.retryDelay(retryDelaysMs[attempt]!);
    }

    throw new Error("OpenAI-compatible request retry attempts were exhausted");
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
          model: input.model,
          stream: true
        }),
        headers: {
          Accept: "text/event-stream",
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

const retryDelaysMs = [500, 1500] as const;

const retryableStatusCodes = new Set([429, 500, 502, 503, 504]);

function isRetryableStatus(statusCode: number): boolean {
  return retryableStatusCodes.has(statusCode);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

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

async function parseResponseMessage(protocol: HttpAiProviderProtocol, response: Response): Promise<string | undefined> {
  if (protocol === "responses") {
    if (isEventStreamResponse(response) && response.body) {
      return parseResponsesEventStream(response.body);
    }

    return parseResponsesStream(await response.text());
  }

  return parseMessage(protocol, await response.json());
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

function parseResponsesStream(bodyText: string): string | undefined {
  if (!bodyText.includes("data:")) {
    return parseMessage("responses", JSON.parse(bodyText));
  }

  const state: ResponsesStreamState = {
    deltaText: ""
  };
  for (const dataText of extractServerSentEventData(bodyText)) {
    applyResponsesStreamEvent(dataText, state);
  }

  return streamStateMessage(state);
}

async function parseResponsesEventStream(body: ReadableStream<Uint8Array>): Promise<string | undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: ResponsesStreamState = {
    deltaText: ""
  };
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      applyResponsesStreamBlock(block, state);
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  applyResponsesStreamBlock(buffer, state);
  return streamStateMessage(state);
}

interface ResponsesStreamState {
  completedText?: string;
  deltaText: string;
}

function isEventStreamResponse(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().includes("text/event-stream") ?? false;
}

function applyResponsesStreamBlock(block: string, state: ResponsesStreamState): void {
  for (const dataText of extractServerSentEventData(`${block.trim()}\n\n`)) {
    applyResponsesStreamEvent(dataText, state);
  }
}

function applyResponsesStreamEvent(dataText: string, state: ResponsesStreamState): void {
  if (dataText === "[DONE]") {
    return;
  }

  const event = JSON.parse(dataText) as OpenAIResponsesStreamEvent;
  if (event.type === "response.output_text.delta" && event.delta !== undefined) {
    state.deltaText += event.delta;
  }
  if (event.type === "response.output_text.done" && event.text !== undefined) {
    state.completedText = event.text.trim();
  }
  if (event.type === "response.completed" && event.response) {
    state.completedText = parseMessage("responses", event.response) ?? state.completedText;
  }
  if (event.type === "response.failed" && event.response?.error) {
    throw new Error(formatStreamEventError(event.response.error));
  }
  if (event.type === "error" && event.error) {
    throw new Error(formatStreamEventError(event.error));
  }
}

function streamStateMessage(state: ResponsesStreamState): string | undefined {
  return state.completedText ?? state.deltaText.trim();
}

function extractServerSentEventData(bodyText: string): string[] {
  return bodyText
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n")
        .trim()
    )
    .filter(Boolean);
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

function formatStreamEventError(error: { message?: string; type?: string }): string {
  return `OpenAI-compatible streaming response failed: ${error.message ?? error.type ?? "unknown error"}`;
}
