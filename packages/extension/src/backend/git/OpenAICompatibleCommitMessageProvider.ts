export interface OpenAICompatibleCommitMessageProviderInput {
  fetch?: typeof fetch;
}

export interface OpenAICompatibleCommitMessageRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
}

interface OpenAICompatibleChatCompletionsResponse {
  choices?: readonly {
    message?: {
      content?: string | null;
    };
  }[];
}

export class OpenAICompatibleCommitMessageProvider {
  private readonly fetch: typeof fetch;

  public constructor(input: OpenAICompatibleCommitMessageProviderInput = {}) {
    this.fetch = input.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public async generate(input: OpenAICompatibleCommitMessageRequest): Promise<string> {
    const response = await this.fetch(`${trimTrailingSlash(input.baseUrl)}/chat/completions`, {
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
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenAICompatibleChatCompletionsResponse;
    const message = payload.choices?.[0]?.message?.content?.trim();
    if (!message) {
      throw new Error("OpenAI-compatible provider returned no commit message");
    }

    return firstLine(message);
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]!.trim();
}
