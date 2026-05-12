import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleCommitMessageProvider } from "../../src/backend/git/OpenAICompatibleCommitMessageProvider";

describe("OpenAICompatibleCommitMessageProvider", () => {
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
        baseUrl: "https://api.example.com/v1",
        model: "gpt-test",
        prompt: "Write one line"
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
});
