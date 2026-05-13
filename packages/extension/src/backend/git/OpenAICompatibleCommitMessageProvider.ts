import type { HttpAiProviderProtocol } from "../rpc/contract";

export interface OpenAICompatibleCommitMessageProviderInput {
  fetch?: typeof fetch;
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

  public constructor(input: OpenAICompatibleCommitMessageProviderInput = {}) {
    this.fetch = input.fetch;
  }

  public async generate(input: OpenAICompatibleCommitMessageRequest): Promise<string> {
    const requestFetch = this.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!requestFetch) {
      throw new Error("OpenAI-compatible provider requires fetch support in this VS Code host");
    }

    const request = createRequest(input);
    const response = await requestFetch(request.url, request.init);

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with status ${response.status}`);
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
      url: `${trimTrailingSlash(input.baseUrl)}/v1/responses`
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
      url: `${trimTrailingSlash(input.baseUrl)}/v1/messages`
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
    url: `${trimTrailingSlash(input.baseUrl)}/v1/chat/completions`
  };
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
