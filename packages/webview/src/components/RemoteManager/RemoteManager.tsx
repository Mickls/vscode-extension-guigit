import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import type { RemoteViewModel } from "../../app/rpcContract.generated";

export interface RemoteManagerStatus {
  kind: "info" | "success" | "error";
  message: string;
}

export interface RemoteManagerProps {
  onAddRemote?: (name: string, url: string) => void;
  onClose?: () => void;
  onDeleteRemote?: (name: string) => void;
  onUpdateRemote?: (name: string, url: string) => void;
  open: boolean;
  remotes?: readonly RemoteViewModel[];
  status?: RemoteManagerStatus;
}

export function RemoteManager({
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
        message: invalidRemoteUrlMessage
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
              Remote Manager
            </h3>
            <p className="m-0 mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
              Add, update, or remove Git remotes for the current repository.
            </p>
          </div>
          <button
            aria-label="Close Remote Manager"
            className="h-6 w-6 rounded bg-transparent text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={onClose}
            type="button"
          >
            x
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
              <span role="columnheader">Name</span>
              <span role="columnheader">URL</span>
              <span role="columnheader">Actions</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2">
              {remotes.length > 0 ? (
                remotes.map((remote) => (
                  <RemoteManagerRow
                    key={remote.name}
                    onClearStatus={() => setValidationStatus(undefined)}
                    onDeleteRemote={onDeleteRemote}
                    onInvalidUrl={(message) => setValidationStatus({ kind: "error", message })}
                    onUpdateRemote={onUpdateRemote}
                    remote={remote}
                  />
                ))
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--vscode-panel-border)] p-6 text-center text-[var(--vscode-descriptionForeground)]">
                  No remotes configured
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
            placeholder="Remote name"
            type="text"
            value={newRemoteName}
          />
          <input
            className={inputClassName}
            onChange={(event) => setNewRemoteUrl(event.target.value)}
            placeholder="Remote URL (https://... or git@...)"
            type="text"
            value={newRemoteUrl}
          />
          <button className={primaryButtonClassName} type="submit">
            Add Remote
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
  remote: RemoteViewModel;
}

function RemoteManagerRow({ onClearStatus, onDeleteRemote, onInvalidUrl, onUpdateRemote, remote }: RemoteManagerRowProps): ReactElement {
  const [url, setUrl] = useState(remote.fetchUrl);
  const saveRemote = () => {
    const trimmedUrl = url.trim();
    if (!isValidRemoteUrl(trimmedUrl)) {
      onInvalidUrl?.(invalidRemoteUrlMessage);
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
          aria-label={`Save ${remote.name}`}
          className={secondaryButtonClassName}
          onClick={saveRemote}
          type="button"
        >
          Save
        </button>
        <button
          aria-label={`Delete ${remote.name}`}
          className={dangerButtonClassName}
          onClick={() => onDeleteRemote?.(remote.name)}
          type="button"
        >
          Delete
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

const invalidRemoteUrlMessage = "Remote URL must start with git@ or https://";

function isValidRemoteUrl(url: string): boolean {
  return url.startsWith("git@") || url.startsWith("https://");
}
