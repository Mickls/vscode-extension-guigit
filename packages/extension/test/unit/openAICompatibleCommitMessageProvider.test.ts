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
          prompt: "Write one line"
        })
      ).rejects.toThrow("OpenAI-compatible provider requires fetch support in this VS Code host");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("posts the prompt to the chat completions endpoint with the configured model", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "feat: add ai commit messages"
            }
          }
        ]
      })
    }));
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
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: "fix: use responses api"
      })
    }));
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
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            text: "feat: use claude messages",
            type: "text"
          }
        ]
      })
    }));
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
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: " \n\t "
            }
          }
        ]
      })
    }));
    const provider = new OpenAICompatibleCommitMessageProvider({ fetch });

    await expect(
      provider.generate({
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1",
        model: "gpt-test",
        prompt: "Write one line"
      })
    ).rejects.toThrow("OpenAI-compatible provider returned no commit message");
  });
});
