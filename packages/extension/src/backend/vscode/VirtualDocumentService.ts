import type { Disposable, TextDocumentContentProvider, Uri } from "vscode";
import { Uri as VscodeUri, workspace } from "vscode";

const defaultTtlMs = 300_000;

export interface VirtualDocumentServiceInput<TUri extends { toString(): string } = Uri> {
  createUri?: (value: string) => TUri;
  randomId?: () => string;
  registerTextDocumentContentProvider?: (scheme: string, provider: TextDocumentContentProvider) => Disposable;
  scheduleDispose?: (callback: () => void, ttlMs: number) => void;
  ttlMs?: number;
}

export class VirtualDocumentService<TUri extends { toString(): string } = Uri> {
  private readonly createUri: (value: string) => TUri;
  private readonly randomId: () => string;
  private readonly registerTextDocumentContentProvider: (scheme: string, provider: TextDocumentContentProvider) => Disposable;
  private readonly scheduleDispose: (callback: () => void, ttlMs: number) => void;
  private readonly ttlMs: number;

  public constructor(input: VirtualDocumentServiceInput<TUri> = {}) {
    this.createUri = input.createUri ?? ((value) => VscodeUri.parse(value) as unknown as TUri);
    this.randomId = input.randomId ?? (() => crypto.randomUUID());
    this.registerTextDocumentContentProvider =
      input.registerTextDocumentContentProvider ?? ((scheme, provider) => workspace.registerTextDocumentContentProvider(scheme, provider));
    this.scheduleDispose =
      input.scheduleDispose ??
      ((callback, ttlMs) => {
        setTimeout(callback, ttlMs);
      });
    this.ttlMs = input.ttlMs ?? defaultTtlMs;
  }

  public createDocument(content: string, fileName: string): TUri {
    const scheme = `guigit-${this.randomId()}`;
    const uri = this.createUri(`${scheme}:/${encodeVirtualPath(fileName)}`);
    const disposable = this.registerTextDocumentContentProvider(scheme, {
      provideTextDocumentContent: (requestUri) => (requestUri.toString() === uri.toString() ? content : undefined)
    });

    this.scheduleDispose(() => {
      disposable.dispose();
    }, this.ttlMs);

    return uri;
  }
}

function encodeVirtualPath(fileName: string): string {
  return fileName.split("/").map(encodeURIComponent).join("/");
}
