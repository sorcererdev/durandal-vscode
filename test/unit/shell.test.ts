import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csp, MEASURE, nonce, shell } from '../../src/pause/shell';

test('csp: exactly the Global Constraints policy, scripts by nonce, styles and fonts from the webview only', () => {
  assert.equal(csp('https://abc.vscode-cdn.net', 'N0n+ce/='),
    "default-src 'none'; script-src 'nonce-N0n+ce/='; style-src https://abc.vscode-cdn.net; font-src https://abc.vscode-cdn.net");
});

test('nonce: 16 random bytes in base64, fresh each time', () => {
  const a = nonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(a, nonce());
});

test('shell: the CSP meta, the stylesheet, one nonced script, the root and the 100-cell measure; nothing inline', () => {
  const c = csp('vscode-webview://x', 'NONCE');
  const out = shell({ csp: c, script: 'https://x/dist/webview.js', style: 'https://x/dist/pause.css', nonce: 'NONCE' });
  assert.ok(out.startsWith('<!DOCTYPE html>'));
  assert.ok(out.includes(`<meta http-equiv="Content-Security-Policy" content="${c}">`));
  assert.ok(out.includes('<link rel="stylesheet" href="https://x/dist/pause.css">'));
  assert.ok(out.includes('<script nonce="NONCE" src="https://x/dist/webview.js"></script>'));
  assert.equal((out.match(/<script/g) ?? []).length, 1);
  assert.ok(out.includes('<div id="root"></div>'));
  assert.equal(MEASURE.length, 100);
  assert.ok(out.includes(`<span id="measure" aria-hidden="true">${MEASURE}</span>`));
  assert.ok(!/style=/i.test(out) && !/<style/i.test(out));
});

test('shell: attribute values are escaped', () => {
  const out = shell({ csp: 'a"b', script: 's&t', style: '<c>', nonce: 'n' });
  assert.ok(out.includes('content="a&quot;b"'));
  assert.ok(out.includes('src="s&amp;t"'));
  assert.ok(out.includes('href="&lt;c>"'));
});
