import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import type { AiProviderSettingsViewModel, HttpAiProviderProtocol } from "../../app/rpcContract.generated";
import { IconTooltip } from "../IconTooltip/IconTooltip";

export interface AiProviderPanelProps {
  labels?: Partial<AiProviderPanelLabels>;
  onClose?: () => void;
  onSave?: (settings: AiProviderSettingsViewModel) => void;
  onTest?: () => void;
  open: boolean;
  saving?: boolean;
  settings: AiProviderSettingsViewModel;
  testing?: boolean;
}

export interface AiProviderPanelLabels {
  apiKey: string;
  apiKeyPlaceholder: string;
  apiHost: string;
  cancel: string;
  close: string;
  description: string;
  model: string;
  protocol: string;
  requestPreview: string;
  save: string;
  saving: string;
  test: string;
  testing: string;
  title: string;
}

const protocolLabels = {
  chatCompletions: "OpenAI Chat Completions compatible",
  claudeMessages: "Anthropic Claude Messages API",
  responses: "OpenAI Responses API"
} as const satisfies Record<HttpAiProviderProtocol, string>;

export function AiProviderPanel({
  labels,
  onClose,
  onSave,
  onTest,
  open,
  saving = false,
  settings,
  testing = false
}: AiProviderPanelProps): ReactElement | null {
  const text = { ...defaultLabels, ...labels };
  const [protocol, setProtocol] = useState<HttpAiProviderProtocol>(settings.openAICompatible.protocol);
  const [baseUrl, setBaseUrl] = useState(settings.openAICompatible.baseUrl);
  const [model, setModel] = useState(settings.openAICompatible.model);
  const [apiKey, setApiKey] = useState("");
  const busy = saving || testing;

  useEffect(() => {
    if (!open) {
      return;
    }

    setProtocol(settings.openAICompatible.protocol);
    setBaseUrl(settings.openAICompatible.baseUrl);
    setModel(settings.openAICompatible.model);
    setApiKey("");
  }, [open, settings]);

  if (!open) {
    return null;
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedApiKey = apiKey.trim();
    onSave?.({
      provider: "openAICompatible",
      openAICompatible: {
        ...(trimmedApiKey.length > 0 ? { apiKey: trimmedApiKey } : {}),
        baseUrl: baseUrl.trim(),
        configured: baseUrl.trim().length > 0 && model.trim().length > 0,
        model: model.trim(),
        protocol
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/35 p-5">
      <form
        aria-labelledby="ai-provider-panel-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-[min(760px,95%)] flex-col rounded-lg border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editor-background)] shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
        onSubmit={save}
        role="dialog"
      >
        <div className="flex justify-between gap-4 border-b border-[var(--vscode-panel-border)] px-5 py-4">
          <div>
            <h3 className="m-0 text-base" id="ai-provider-panel-title">
              {text.title}
            </h3>
            <p className="m-0 mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
              {text.description}
            </p>
          </div>
          <button
            aria-label={text.close}
            className="guigit-icon-tooltip-host h-6 w-6 rounded bg-transparent text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            x
            <IconTooltip label={text.close} placement="bottom" />
          </button>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <label className={labelClassName}>
            <span>{text.protocol}</span>
            <select
              aria-label={text.protocol}
              className={inputClassName}
              onChange={(event) => setProtocol(event.target.value as HttpAiProviderProtocol)}
              value={protocol}
            >
              {Object.entries(protocolLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClassName}>
              <span>{text.apiHost}</span>
              <input
                aria-label={text.apiHost}
                className={inputClassName}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.openai.com"
                type="url"
                value={baseUrl}
              />
            </label>
            <label className={labelClassName}>
              <span>{text.model}</span>
              <input
                aria-label={text.model}
                className={inputClassName}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gpt-4.1-mini"
                type="text"
                value={model}
              />
            </label>
          </div>
          <label className={labelClassName}>
            <span>{text.apiKey}</span>
            <input
              aria-label={text.apiKey}
              className={inputClassName}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={text.apiKeyPlaceholder}
              type="password"
              value={apiKey}
            />
          </label>
          <div className="rounded border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2 text-xs">
            <div className="font-semibold">{text.requestPreview}</div>
            <div className="mt-1 text-[var(--vscode-descriptionForeground)]">
              POST {requestPreviewUrl(baseUrl, protocol)}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--vscode-panel-border)] px-5 py-4">
          <button className={secondaryButtonClassName} disabled={busy} onClick={onClose} type="button">
            {text.cancel}
          </button>
          <button className={secondaryButtonClassName} disabled={busy} onClick={onTest} type="button">
            {testing ? text.testing : text.test}
          </button>
          <button className={primaryButtonClassName} disabled={busy} type="submit">
            {saving ? text.saving : text.save}
          </button>
        </div>
      </form>
    </div>
  );
}

function requestPreviewUrl(baseUrl: string, protocol: HttpAiProviderProtocol): string {
  const host = trimTrailingSlash(baseUrl.trim() || "https://api.openai.com");
  if (protocol === "responses") {
    return `${host}/v1/responses`;
  }

  if (protocol === "claudeMessages") {
    return `${host}/v1/messages`;
  }

  return `${host}/v1/chat/completions`;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const labelClassName = "flex flex-col gap-1.5 text-xs text-[var(--vscode-foreground)]";

const inputClassName =
  "w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1.5 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]";

const primaryButtonClassName =
  "rounded border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] px-3 py-1.5 text-xs text-[var(--vscode-button-foreground)]";

const secondaryButtonClassName =
  "rounded bg-[var(--vscode-button-secondaryBackground,var(--vscode-button-background))] px-3 py-1.5 text-xs text-[var(--vscode-button-secondaryForeground,var(--vscode-button-foreground))]";

const defaultLabels: AiProviderPanelLabels = {
  apiHost: "API host",
  apiKey: "API key",
  apiKeyPlaceholder: "Leave unchanged unless replacing the stored key",
  cancel: "Cancel",
  close: "Close Configure AI Provider",
  description: "Choose the HTTP AI API used to generate commit messages.",
  model: "Model",
  protocol: "API protocol",
  requestPreview: "Request preview",
  save: "Save",
  saving: "Saving...",
  test: "Test",
  testing: "Testing...",
  title: "Configure AI Provider"
};
