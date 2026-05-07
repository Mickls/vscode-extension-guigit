import type { Disposable, ExtensionContext } from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHistoryViewProvider } from "../../src/views/GitHistoryViewProvider";

const vscodeMocks = vi.hoisted(() => {
  const providerDisposable = { dispose: vi.fn() };

  return {
    providerDisposable,
    registerWebviewViewProvider: vi.fn(() => providerDisposable)
  };
});

vi.mock("vscode", () => ({
  Disposable: class {
    public constructor(public readonly dispose: () => void) {}
  },
  Uri: {
    joinPath: vi.fn((base: { path: string }, ...paths: readonly string[]) => ({
      path: [base.path, ...paths].join("/")
    }))
  },
  window: {
    registerWebviewViewProvider: vscodeMocks.registerWebviewViewProvider
  }
}));

describe("activate", () => {
  beforeEach(() => {
    vscodeMocks.registerWebviewViewProvider.mockClear();
  });

  it("registers the Git history webview provider", async () => {
    const { activate } = await import("../../src/extension/activate");
    const subscriptions: Disposable[] = [];
    const context = {
      extensionUri: { path: "/extension" },
      subscriptions
    } as ExtensionContext;

    activate(context);

    expect(vscodeMocks.registerWebviewViewProvider).toHaveBeenCalledWith(
      GitHistoryViewProvider.viewType,
      expect.any(GitHistoryViewProvider)
    );
    expect(subscriptions).toContain(vscodeMocks.providerDisposable);
  });
});
