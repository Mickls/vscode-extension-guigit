import { describe, expect, it, vi } from "vitest";
import { VirtualDocumentService } from "../../src/backend/vscode/VirtualDocumentService";

vi.mock("vscode", () => ({
  Uri: {
    parse: (value: string) => ({ value })
  },
  workspace: {
    registerTextDocumentContentProvider: vi.fn()
  }
}));

describe("VirtualDocumentService", () => {
  it("registers bounded read-only document providers and disposes them after the ttl", () => {
    const disposables = new Map<string, { dispose: ReturnType<typeof vi.fn> }>();
    const timers: Array<() => void> = [];
    const service = new VirtualDocumentService({
      createUri: (value) => ({ toString: () => value, value }),
      randomId: () => "doc-1",
      registerTextDocumentContentProvider: (scheme, provider) => {
        const disposable = { dispose: vi.fn() };
        disposables.set(scheme, disposable);
        expect(provider.provideTextDocumentContent({ toString: () => `${scheme}:/file.ts` })).toBe("content");
        expect(provider.provideTextDocumentContent({ toString: () => `${scheme}:/other.ts` })).toBeUndefined();
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
      registerTextDocumentContentProvider: () => ({ dispose: vi.fn() }),
      scheduleDispose: vi.fn()
    });

    const uri = service.createDocument("content", "src/components/App.tsx");

    expect(uri.value).toBe("guigit-doc-1:/src/components/App.tsx");
  });
});
