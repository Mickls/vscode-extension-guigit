export interface WebviewShellHtmlInput {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
}

export function createWebviewShellHtml(input: WebviewShellHtmlInput): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${input.cspSource} https://www.gravatar.com; style-src ${input.cspSource}; script-src 'nonce-${input.nonce}';">`,
    `<link rel="stylesheet" href="${input.styleUri}">`,
    "<title>GUI Git History</title>",
    "</head>",
    "<body>",
    '<div id="root"></div>',
    `<script nonce="${input.nonce}" type="module" src="${input.scriptUri}"></script>`,
    "</body>",
    "</html>"
  ].join("");
}
