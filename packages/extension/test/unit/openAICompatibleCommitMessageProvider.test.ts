import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleCommitMessageProvider } from "../../src/backend/git/OpenAICompatibleCommitMessageProvider";

describe("OpenAICompatibleCommitMessageProvider", () => {
  it("reports a clear error at generation time when fetch is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    try {
      Reflect.deleteProperty(globalThis, "fetch");
      const provider = new OpenAICompatibleCommitMessageProvider();

      await expect(
        provider.generate({
          apiKey: "sk-test",
          baseUrl: "https://api.example.com/v1",
          model: "gpt-test",
          prompt: "Write one line",
          protocol: "chatCompletions"
        })
      ).rejects.toThrow("OpenAI-compatible provider requires fetch support in this VS Code host");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("accepts legacy base URLs that already include /v1 or the full endpoint path", async () => {
    const fetch = vi.fn(async () =>
      createResponse({
        choices: [
          {
            message: {
              content: "fix: keep legacy urls"
            }
          }
        ]
      })
    );
    const provider = new OpenAICompatibleCommitMessageProvider({ fetch });

    await provider.generate({
      apiKey: "sk-test",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-test",
      prompt: "Write one line",
      protocol: "chatCompletions"
    });
    await provider.generate({
      apiKey: "sk-test",
      baseUrl: "https://api.example.com/v1/chat/completions",
      model: "gpt-test",
      prompt: "Write one line",
      protocol: "chatCompletions"
    });

    expect(fetch.mock.calls[0]![0]).toBe("https://api.example.com/v1/chat/completions");
    expect(fetch.mock.calls[1]![0]).toBe("https://api.example.com/v1/chat/completions");
  });

  it("uses the resolved proxy configuration for provider requests", async () => {
    const fetch = vi.fn(async () =>
      createResponse({
        choices: [
          {
            message: {
              content: "fix: use proxy"
            }
          }
        ]
      })
    );
    const provider = new OpenAICompatibleCommitMessageProvider({
      fetch,
      getProxyConfig: async () => ({
        enabled: true,
        http: "http://127.0.0.1:7890",
        https: "http://127.0.0.1:7890",
        source: "git"
      })
    });

    await provider.generate({
      apiKey: "sk-test",
      baseUrl: "https://api.example.com",
      model: "gpt-test",
      prompt: "Write one line",
      protocol: "chatCompletions"
    });

    expect(fetch.mock.calls[0]![1]).toEqual(expect.objectContaining({
      dispatcher: expect.any(Object)
    }));
  });

  it("skips the resolved proxy when the host matches no_proxy", async () => {
    const fetch = vi.fn(async () =>
      createResponse({
        choices: [
          {
            message: {
              content: "fix: respect no proxy"
            }
          }
        ]
      })
    );
    const provider = new OpenAICompatibleCommitMessageProvider({
      fetch,
      getProxyConfig: async () => ({
        enabled: true,
        http: "http://127.0.0.1:7890",
        https: "http://127.0.0.1:7890",
        noProxy: "api.example.com",
        source: "git"
      })
    });

    await provider.generate({
      apiKey: "sk-test",
      baseUrl: "https://api.example.com",
      model: "gpt-test",
      prompt: "Write one line",
      protocol: "chatCompletions"
    });

    expect(fetch.mock.calls[0]![1]).not.toHaveProperty("dispatcher");
  });

  it("posts the prompt to the chat completions endpoint with the configured model", async () => {
    const fetch = vi.fn(async () =>
      createResponse({
        choices: [
          {
            message: {
              content: "feat: add ai commit messages"
            }
          }
        ]
      })
    );
    const provider = new OpenAICompatibleCommitMessageProvider({ fetch });

    await expect(
      provider.generate({
        apiKey: "sk-test",
        baseUrl: "https://api.example.com",
        model: "gpt-test",
        prompt: "Write one line",
        protocol: "chatCompletions"
      })
    ).resolves.toBe("feat: add ai commit messages");

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(init).toMatchObject({
      headers: {
        Authorization: "Bearer sk-test",
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [
        {
          content: "Write one line",
          role: "user"
        }
      ],
      model: "gpt-test"
    });
  });

  it("posts the prompt to the responses endpoint when selected", async () => {
    const fetch = vi.fn(async () =>
      createResponse({
        output_text: "fix: use responses api"
      })
    );
    const provider = new OpenAICompatibleCommitMessageProvider({ fetch });

    await expect(
      provider.generate({
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com",
        model: "gpt-test",
        prompt: "Write one line",
        protocol: "responses"
      })
    ).resolves.toBe("fix: use responses api");

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init).toMatchObject({
      headers: {
        Authorization: "Bearer sk-test",
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    expect(JSON.parse(init.body as string)).toEqual({
      input: "Write one line",
      model: "gpt-test"
    });
  });

  it("posts the prompt to the Claude messages endpoint when selected", async () => {
    const fetch = vi.fn(async () =>
      createResponse({
        content: [
          {
            text: "feat: use claude messages",
            type: "text"
          }
        ]
      })
    );
    const provider = new OpenAICompatibleCommitMessageProvider({ fetch });

    await expect(
      provider.generate({
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        model: "claude-test",
        prompt: "Write one line",
        protocol: "claudeMessages"
      })
    ).resolves.toBe("feat: use claude messages");

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init).toMatchObject({
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": "sk-ant-test"
      },
      method: "POST"
    });
    expect(JSON.parse(init.body as string)).toEqual({
      max_tokens: 64,
      messages: [
        {
          content: "Write one line",
          role: "user"
        }
      ],
      model: "claude-test"
    });
  });

  it("rejects whitespace-only provider responses with a clear error", async () => {
    const fetch = vi.fn(async () =>
      createResponse({
        choices: [
          {
            message: {
              content: " \n\t "
            }
          }
        ]
      })
    );
    const provider = new OpenAICompatibleCommitMessageProvider({ fetch });

    await expect(
      provider.generate({
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1",
        model: "gpt-test",
        prompt: "Write one line",
        protocol: "chatCompletions"
      })
    ).rejects.toThrow("OpenAI-compatible provider returned no commit message");
  });

  it("includes response body details for non-2xx provider responses", async () => {
    const fetch = vi.fn(async () => createResponse({ error: { message: "Unsupported model" } }, 400));
    const provider = new OpenAICompatibleCommitMessageProvider({ fetch });

    await expect(
      provider.generate({
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com",
        model: "bad-model",
        prompt: "Write one line",
        protocol: "responses"
      })
    ).rejects.toThrow('OpenAI-compatible request failed with status 400: {"error":{"message":"Unsupported model"}}');
  });
});

function createResponse(payload: unknown, status = 200): Response {
  return {
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  } as Response;
}
