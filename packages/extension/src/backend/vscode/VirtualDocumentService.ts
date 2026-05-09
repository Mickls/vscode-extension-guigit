import type { Disposable, FileChangeEvent, FileSystemProvider, Uri } from "vscode";
import { EventEmitter, FilePermission, FileSystemError, FileType, Uri as VscodeUri, workspace } from "vscode";

const defaultTtlMs = 300_000;

export interface VirtualDocumentServiceInput<TUri extends { toString(): string } = Uri> {
  createUri?: (value: string) => TUri;
  randomId?: () => string;
  registerFileSystemProvider?: (
    scheme: string,
    provider: FileSystemProvider,
    options: { readonly isReadonly?: boolean }
  ) => Disposable;
  scheduleDispose?: (callback: () => void, ttlMs: number) => void;
  ttlMs?: number;
}

export class VirtualDocumentService<TUri extends { toString(): string } = Uri> {
  private readonly createUri: (value: string) => TUri;
  private readonly randomId: () => string;
  private readonly registerFileSystemProvider: (
    scheme: string,
    provider: FileSystemProvider,
    options: { readonly isReadonly?: boolean }
  ) => Disposable;
  private readonly scheduleDispose: (callback: () => void, ttlMs: number) => void;
  private readonly ttlMs: number;

  public constructor(input: VirtualDocumentServiceInput<TUri> = {}) {
    this.createUri = input.createUri ?? ((value) => VscodeUri.parse(value) as unknown as TUri);
    this.randomId = input.randomId ?? (() => crypto.randomUUID());
    this.registerFileSystemProvider =
      input.registerFileSystemProvider ?? ((scheme, provider, options) => workspace.registerFileSystemProvider(scheme, provider, options));
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
    const bytes = Buffer.from(content, "utf8");
    const changedFiles = new EventEmitter<FileChangeEvent[]>();
    const disposable = this.registerFileSystemProvider(
      scheme,
      {
        onDidChangeFile: changedFiles.event,
        watch: () => ({ dispose: () => undefined }),
        stat: (requestUri) => {
          if (requestUri.toString() !== uri.toString()) {
            throw FileSystemError.FileNotFound(requestUri);
          }

          return {
            ctime: 0,
            mtime: 0,
            permissions: FilePermission.Readonly,
            size: bytes.byteLength,
            type: FileType.File
          };
        },
        readDirectory: () => [],
        createDirectory: () => {
          throw FileSystemError.NoPermissions("GUI Git History snapshots are readonly");
        },
        readFile: (requestUri) => {
          if (requestUri.toString() !== uri.toString()) {
            throw FileSystemError.FileNotFound(requestUri);
          }

          return bytes;
        },
        writeFile: () => {
          throw FileSystemError.NoPermissions("GUI Git History snapshots are readonly");
        },
        delete: () => {
          throw FileSystemError.NoPermissions("GUI Git History snapshots are readonly");
        },
        rename: () => {
          throw FileSystemError.NoPermissions("GUI Git History snapshots are readonly");
        }
      },
      { isReadonly: true }
    );

    this.scheduleDispose(() => {
      disposable.dispose();
      changedFiles.dispose();
    }, this.ttlMs);

    return uri;
  }
}

function encodeVirtualPath(fileName: string): string {
  return fileName.split("/").map(encodeURIComponent).join("/");
}
