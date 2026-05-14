/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderPanel } from "./AiProviderPanel";

describe("AiProviderPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders HTTP protocol options without exposing the VS Code language model provider", () => {
    render(<AiProviderPanel open settings={settings} />);

    expect(screen.getByRole("dialog", { name: "Configure AI Provider" })).toBeInTheDocument();
    expect(screen.queryByText("VS Code Language Model")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "API protocol" })).toHaveDisplayValue("OpenAI Responses API");
    expect(screen.getByDisplayValue("https://api.openai.com")).toBeInTheDocument();
    expect(screen.getByText("POST https://api.openai.com/v1/responses")).toBeInTheDocument();
  });

  it("keeps the panel body scrollable so footer actions remain reachable", () => {
    render(<AiProviderPanel open settings={settings} />);

    expect(screen.getByLabelText("API protocol").closest("div")).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("button", { name: "Save" }).closest("div")).toHaveClass("shrink-0");
  });

  it("sends save, test, and close intents", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onTest = vi.fn();

    render(
      <AiProviderPanel
        onClose={onClose}
        onSave={onSave}
        onTest={onTest}
        open
        settings={settings}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "API protocol" }), "claudeMessages");
    await user.clear(screen.getByLabelText("API host"));
    await user.type(screen.getByLabelText("API host"), "https://api.anthropic.com");
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "claude-test");
    await user.type(screen.getByLabelText("API key"), "sk-ant-test");
    await user.selectOptions(screen.getByRole("combobox", { name: "Commit message prompt" }), "custom");
    await user.type(screen.getByLabelText("Custom prompt rules"), "Use imperative mood.");
    await user.click(screen.getByRole("button", { name: "Test" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Close Configure AI Provider" }));

    expect(onTest).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({
      provider: "openAICompatible",
      commitMessagePrompt: {
        customRules: "Use imperative mood.",
        mode: "custom"
      },
      openAICompatible: {
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        configured: true,
        model: "claude-test",
        protocol: "claudeMessages"
      }
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows busy feedback while testing the provider", async () => {
    const user = userEvent.setup();
    const onTest = vi.fn();

    const { rerender } = render(
      <AiProviderPanel
        onTest={onTest}
        open
        settings={settings}
        testing
      />
    );

    expect(screen.getByRole("button", { name: "Testing..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close Configure AI Provider" })).toBeEnabled();

    rerender(
      <AiProviderPanel
        onTest={onTest}
        open
        settings={settings}
      />
    );
    await user.click(screen.getByRole("button", { name: "Test" }));

    expect(onTest).toHaveBeenCalledOnce();
  });
});

const settings = {
  provider: "openAICompatible",
  commitMessagePrompt: {
    customRules: "",
    mode: "default"
  },
  openAICompatible: {
    baseUrl: "https://api.openai.com",
    configured: true,
    model: "gpt-test",
    protocol: "responses"
  }
} as const;
