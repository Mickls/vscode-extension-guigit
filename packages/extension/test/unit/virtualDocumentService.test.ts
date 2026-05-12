import { describe, expect, it, vi } from "vitest";
import { VirtualDocumentService } from "../../src/backend/vscode/VirtualDocumentService";

vi.mock("vscode", () => ({
  EventEmitter: class {
    event = vi.fn();
    dispose = vi.fn();
  },
  FilePermission: {
    Readonly: 1
  },
  FileSystemError: {
    FileNotFound: (uri: unknown) => new Error(`File not found: ${String(uri)}`),
    NoPermissions: (message: string) => new Error(message)
  },
  FileType: {
    Directory: 2,
    File: 1
  },
  Uri: {
    parse: (value: string) => ({ value })
  },
  workspace: {
    registerFileSystemProvider: vi.fn()
  }
}));

describe("VirtualDocumentService", () => {
  it("registers bounded read-only file system providers and disposes them after the ttl", async () => {
    const disposables = new Map<string, { dispose: ReturnType<typeof vi.fn> }>();
    const timers: Array<() => void> = [];
    const service = new VirtualDocumentService({
      createUri: (value) => ({ toString: () => value, value }),
      randomId: () => "doc-1",
      registerFileSystemProvider: (scheme, provider, options) => {
        const disposable = { dispose: vi.fn() };
        disposables.set(scheme, disposable);
        expect(options).toEqual({ isReadonly: true });
        expect(provider.stat({ toString: () => `${scheme}:/file.ts` })).toEqual({
          ctime: 0,
          mtime: 0,
          permissions: 1,
          size: 7,
          type: 1
        });
        expect(Buffer.from(provider.readFile({ toString: () => `${scheme}:/file.ts` }) as Uint8Array).toString("utf8")).toBe("content");
        expect(() => provider.writeFile({ toString: () => `${scheme}:/file.ts` }, new Uint8Array(), {
          create: false,
          overwrite: true
        })).toThrow("readonly");
        return disposable;
      },
      scheduleDispose: (callback) => {
        timers.push(callback);
      },
      ttlMs: 50
    });

    const uri = service.createDocument("content", "file.ts");

    expect(uri.value).toBe("guigit-doc-1:/file.ts");
    expect(disposables.get("guigit-doc-1")?.dispose).not.toHaveBeenCalled();

    timers[0]!();

    expect(disposables.get("guigit-doc-1")?.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the original extension at the end of the virtual document path", () => {
    const service = new VirtualDocumentService({
      createUri: (value) => ({ toString: () => value, value }),
      randomId: () => "doc-1",
      registerFileSystemProvider: () => ({ dispose: vi.fn() }),
      scheduleDispose: vi.fn()
    });

    const uri = service.createDocument("content", "src/components/App.tsx");

    expect(uri.value).toBe("guigit-doc-1:/src/components/App.tsx");
  });
});
