import { describe, expect, it } from "vitest";
import { createWebviewShellHtml } from "../../src/views/webviewShellHtml";

describe("webview shell html", () => {
  it("bootstraps assets without rendering UI content in the extension host", () => {
    const html = createWebviewShellHtml({
      cspSource: "vscode-webview:",
      nonce: "nonce-1",
      scriptUri: "vscode-webview://script.js",
      styleUri: "vscode-webview://style.css"
    });

    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="vscode-webview://script.js"');
    expect(html).toContain('href="vscode-webview://style.css"');
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("script-src 'nonce-nonce-1'");
    expect(html).not.toContain(">GUI Git History</div>");
  });
});
