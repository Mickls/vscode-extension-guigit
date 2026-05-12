export interface LanguageModelCommitMessageModel {
  sendRequest(messages: readonly string[]): Promise<string>;
}

export interface LanguageModelCommitMessageProviderInput {
  selectChatModels: () => Promise<readonly LanguageModelCommitMessageModel[]>;
}

export class LanguageModelCommitMessageProvider {
  private readonly selectChatModels: () => Promise<readonly LanguageModelCommitMessageModel[]>;

  public constructor(input: LanguageModelCommitMessageProviderInput) {
    this.selectChatModels = input.selectChatModels;
  }

  public async generate(prompt: string): Promise<string> {
    const [model] = await this.selectChatModels();
    if (!model) {
      throw new Error("No VS Code language model is available");
    }

    const message = firstLine((await model.sendRequest([prompt])).trim());
    if (!message) {
      throw new Error("VS Code language model returned no commit message");
    }

    return message;
  }
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]!.trim();
}
