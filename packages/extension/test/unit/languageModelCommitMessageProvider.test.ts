import { describe, expect, it, vi } from "vitest";
import { LanguageModelCommitMessageProvider } from "../../src/backend/vscode/LanguageModelCommitMessageProvider";

describe("LanguageModelCommitMessageProvider", () => {
  it("rejects when no language models are available with a clear error", async () => {
    const provider = new LanguageModelCommitMessageProvider({
      selectChatModels: async () => []
    });

    await expect(provider.generate("Write one line")).rejects.toThrow(
      "No VS Code language model is available"
    );
  });

  it("rejects whitespace-only model responses with a clear error", async () => {
    const provider = new LanguageModelCommitMessageProvider({
      selectChatModels: async () => [
        {
          sendRequest: vi.fn(async () => " \n\t ")
        }
      ]
    });

    await expect(provider.generate("Write one line")).rejects.toThrow(
      "VS Code language model returned no commit message"
    );
  });
});
