import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import type { RemoteViewModel } from "../../app/rpcContract.generated";
import { IconTooltip } from "../IconTooltip/IconTooltip";

export interface RemoteManagerStatus {
  kind: "info" | "success" | "error";
  message: string;
}

export interface RemoteManagerProps {
  labels?: RemoteManagerLabels;
  onAddRemote?: (name: string, url: string) => void;
  onClose?: () => void;
  onDeleteRemote?: (name: string) => void;
  onUpdateRemote?: (name: string, url: string) => void;
  open: boolean;
  remotes?: readonly RemoteViewModel[];
  status?: RemoteManagerStatus;
}

export interface RemoteManagerLabels {
  actions: string;
  addButton: string;
  addNamePlaceholder: string;
  addUrlPlaceholder: string;
  close: string;
  description: string;
  empty: string;
  name: string;
  title: string;
  url: string;
  buttons: {
    delete: string;
    save: string;
  };
  messages: {
    invalidUrl: string;
  };
}

export function RemoteManager({
  labels = defaultRemoteManagerLabels,
  onAddRemote,
  onClose,
  onDeleteRemote,
  onUpdateRemote,
  open,
  remotes = [],
  status
}: RemoteManagerProps): ReactElement | null {
  const [newRemoteName, setNewRemoteName] = useState("");
  const [newRemoteUrl, setNewRemoteUrl] = useState("");
  const [validationStatus, setValidationStatus] = useState<RemoteManagerStatus | undefined>();
  const displayedStatus = validationStatus ?? status;

  if (!open) {
    return null;
  }

  const submitNewRemote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newRemoteName.trim();
    const url = newRemoteUrl.trim();
    if (!isValidRemoteUrl(url)) {
      setValidationStatus({
        kind: "error",
        message: labels.messages.invalidUrl
      });
      return;
    }

    setValidationStatus(undefined);
    onAddRemote?.(name, url);
    setNewRemoteName("");
    setNewRemoteUrl("");
  };

  return (
    <div
      aria-hidden="false"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/35 p-5"
    >
      <div
        aria-labelledby="remote-manager-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-[min(760px,95%)] flex-col rounded-lg border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editor-background)] shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
        role="dialog"
      >
        <div className="flex justify-between gap-4 border-b border-[var(--vscode-panel-border)] px-5 py-4">
          <div>
            <h3 className="m-0 text-base" id="remote-manager-title">
              {labels.title}
            </h3>
            <p className="m-0 mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
              {labels.description}
            </p>
          </div>
          <button
            aria-label={labels.close}
            className="guigit-icon-tooltip-host h-6 w-6 rounded bg-transparent text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={onClose}
            type="button"
          >
            x
            <IconTooltip label={labels.close} placement="bottom" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 pt-4">
          {displayedStatus ? (
            <div
              className={`rounded border px-2.5 py-2 text-xs ${statusClasses[displayedStatus.kind]}`}
              role="status"
            >
              {displayedStatus.message}
            </div>
          ) : null}
          <div
            aria-label="Git remotes"
            className="flex min-h-0 flex-1 flex-col gap-2"
            role="table"
          >
            <div
              className="grid grid-cols-[160px_1fr_160px] items-center gap-3 border-b border-[var(--vscode-panel-border)] pb-2 text-xs uppercase text-[var(--vscode-descriptionForeground)]"
              role="row"
            >
              <span role="columnheader">{labels.name}</span>
              <span role="columnheader">{labels.url}</span>
              <span role="columnheader">{labels.actions}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2">
              {remotes.length > 0 ? (
                remotes.map((remote) => (
                  <RemoteManagerRow
                    key={remote.name}
                    onClearStatus={() => setValidationStatus(undefined)}
                    onDeleteRemote={onDeleteRemote}
                    onInvalidUrl={() => setValidationStatus({ kind: "error", message: labels.messages.invalidUrl })}
                    onUpdateRemote={onUpdateRemote}
                    labels={labels}
                    remote={remote}
                  />
                ))
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--vscode-panel-border)] p-6 text-center text-[var(--vscode-descriptionForeground)]">
                  {labels.empty}
                </div>
              )}
            </div>
          </div>
        </div>
        <form
          className="grid grid-cols-[160px_1fr_150px] gap-3 border-t border-[var(--vscode-panel-border)] px-5 py-4"
          onSubmit={submitNewRemote}
        >
          <input
            className={inputClassName}
            onChange={(event) => setNewRemoteName(event.target.value)}
            placeholder={labels.addNamePlaceholder}
            type="text"
            value={newRemoteName}
          />
          <input
            className={inputClassName}
            onChange={(event) => setNewRemoteUrl(event.target.value)}
            placeholder={labels.addUrlPlaceholder}
            type="text"
            value={newRemoteUrl}
          />
          <button className={primaryButtonClassName} type="submit">
            {labels.addButton}
          </button>
        </form>
      </div>
    </div>
  );
}

interface RemoteManagerRowProps {
  onClearStatus?: () => void;
  onDeleteRemote?: (name: string) => void;
  onInvalidUrl?: (message: string) => void;
  onUpdateRemote?: (name: string, url: string) => void;
  labels: RemoteManagerLabels;
  remote: RemoteViewModel;
}

function RemoteManagerRow({ labels, onClearStatus, onDeleteRemote, onInvalidUrl, onUpdateRemote, remote }: RemoteManagerRowProps): ReactElement {
  const [url, setUrl] = useState(remote.fetchUrl);
  const saveRemote = () => {
    const trimmedUrl = url.trim();
    if (!isValidRemoteUrl(trimmedUrl)) {
      onInvalidUrl?.(labels.messages.invalidUrl);
      return;
    }

    onClearStatus?.();
    onUpdateRemote?.(remote.name, trimmedUrl);
  };

  return (
    <div
      className="grid grid-cols-[160px_1fr_160px] items-center gap-3 rounded-md border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2.5"
      role="row"
    >
      <div className="truncate font-semibold" role="cell" title={remote.name}>
        {remote.name}
      </div>
      <div role="cell">
        <input
          aria-label={`${remote.name} URL`}
          className={inputClassName}
          onChange={(event) => setUrl(event.target.value)}
          title={remote.pushUrl === remote.fetchUrl ? remote.fetchUrl : `fetch: ${remote.fetchUrl}\npush: ${remote.pushUrl}`}
          type="text"
          value={url}
        />
      </div>
      <div className="flex justify-end gap-2" role="cell">
        <button
          aria-label={`${labels.buttons.save} ${remote.name}`}
          className={secondaryButtonClassName}
          onClick={saveRemote}
          type="button"
        >
          {labels.buttons.save}
        </button>
        <button
          aria-label={`${labels.buttons.delete} ${remote.name}`}
          className={dangerButtonClassName}
          onClick={() => onDeleteRemote?.(remote.name)}
          type="button"
        >
          {labels.buttons.delete}
        </button>
      </div>
    </div>
  );
}

const inputClassName =
  "w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1.5 text-xs text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]";

const primaryButtonClassName =
  "rounded border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] px-3 py-1.5 text-xs text-[var(--vscode-button-foreground)]";

const secondaryButtonClassName =
  "rounded bg-[var(--vscode-button-secondaryBackground,var(--vscode-button-background))] px-3 py-1.5 text-xs text-[var(--vscode-button-secondaryForeground,var(--vscode-button-foreground))]";

const dangerButtonClassName =
  "rounded border border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] px-3 py-1.5 text-xs text-[var(--vscode-inputValidation-errorForeground)]";

const statusClasses = {
  error:
    "border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-inputValidation-errorForeground)]",
  info: "border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)]",
  success:
    "border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] text-[var(--vscode-foreground)]"
} as const;

const defaultRemoteManagerLabels: RemoteManagerLabels = {
  actions: "Actions",
  addButton: "Add Remote",
  addNamePlaceholder: "Remote name",
  addUrlPlaceholder: "Remote URL (https://... or git@...)",
  buttons: {
    delete: "Delete",
    save: "Save"
  },
  close: "Close Remote Manager",
  description: "Add, update, or remove Git remotes for the current repository.",
  empty: "No remotes configured",
  messages: {
    invalidUrl: "Remote URL must start with git@ or https://"
  },
  name: "Name",
  title: "Remote Manager",
  url: "URL"
};

function isValidRemoteUrl(url: string): boolean {
  return url.startsWith("git@") || url.startsWith("https://");
}
