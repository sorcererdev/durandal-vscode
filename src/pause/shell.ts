import { randomBytes } from 'node:crypto';

// shell: the pause panel's HTML document (spec §4.1), pure so the CSP is unit-tested. Scripts
// run only with the nonce; styles and fonts load only from the webview's own origin; nothing is
// inline (colours come from the --vscode-* variables VS Code injects). The page script renders
// into #root; #measure is the 100 cells it measures to tell the extension its width in cells
// (plan decision 5).

export const csp = (cspSource: string, nonce: string): string =>
  `default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource}; font-src ${cspSource}`;

export const nonce = (): string => randomBytes(16).toString('base64');

export const MEASURE = '0'.repeat(100);

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function shell(o: { csp: string; script: string; style: string; nonce: string }): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${attr(o.csp)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<link rel="stylesheet" href="${attr(o.style)}">`,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<span id="measure" aria-hidden="true">${MEASURE}</span>`,
    `<script nonce="${attr(o.nonce)}" src="${attr(o.script)}"></script>`,
    '</body>',
    '</html>',
  ].join('\n');
}
