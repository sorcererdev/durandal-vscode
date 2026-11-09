import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { View } from '../../src/pause/viewModel';
import { esc, html, lineHtml } from '../../webview/render';

// a hand-made view: two entries (the second selected, two lines long), a keyed row, a keyless
// unpressable row, a keep row; a diff with a `<` in it
const view = (o: Partial<View> = {}): View => ({
  state: 'paused',
  tab: 'conjure · cancel_booking',
  title: [{ text: 'conjure · cancel_booking', kind: 'title' }, { text: ' · ' }, { text: '● paused', kind: 'paused' }],
  short: [{ text: 'cancel_booking', kind: 'title' }],
  lines: [
    [{ text: 'red', kind: 'red' }, { text: ' after round 2' }],
    [],
    [{ text: '1 ' }, { text: 'round 1 · base', kind: 'dim' }],
    [{ text: '2 ' }, { text: 'round 2 · strong' }],
    [{ text: '  still failing' }],
  ],
  entryAt: [-1, -1, 0, 1, 1],
  entries: 2,
  selected: 1,
  rows: [
    { key: 'c', label: 'continue', detail: 'one more round', pressable: true, lines: [[{ text: 'c', kind: 'key' }, { text: '  continue        ' }, { text: 'one more round', kind: 'dim' }]] },
    { label: 'wire', detail: 'a third wire', pressable: false, lines: [[{ text: '   wire            ' }, { text: 'a third wire', kind: 'dim' }]] },
    { key: 'a', label: 'keep round 2', detail: '', pressable: true, lines: [[{ text: 'a', kind: 'key' }, { text: '  keep round 2' }]] },
  ],
  diff: {
    title: [{ text: 'round 2 · ' }, { text: 'a', kind: 'key' }, { text: ' keeps this' }],
    lines: [[{ text: '@@ -1 +1 @@', kind: 'dim' }], [{ text: '-  if n < 0:', kind: 'red' }], [{ text: '+  if n <= 0:', kind: 'green' }]],
  },
  legend: 'c continue · a keep · ? help',
  narrow: false,
  flipped: false,
  width: 60,
  ...o,
});

const buttons = (s: string) => s.match(/<button[^>]*>/g) ?? [];
const pane = (s: string, id: string) => {
  const m = new RegExp(`<(section|footer) id="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(s);
  assert.ok(m, `no #${id}`);
  return m[2];
};

test('esc: the five characters HTML gives meaning to', () => {
  assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  assert.equal(esc('plain · ✓ \u6f22'), 'plain · ✓ \u6f22');
});

test('lineHtml: a span with a kind gets the class k-<kind>; key spans are <kbd>; no kind is bare text', () => {
  assert.equal(lineHtml([{ text: 'red', kind: 'red' }, { text: ' after' }, { text: '' }, { text: 'c', kind: 'key' }]),
    '<span class="k-red">red</span> after<kbd class="k-key">c</kbd>');
  assert.equal(lineHtml([]), '');
});

test('a <button> per row, its key as a <kbd> badge, disabled when not pressable (spec §4.3)', () => {
  const out = html(view());
  assert.deepEqual(buttons(out), [
    '<button type="button" class="row" data-row="0" data-key="c">',
    '<button type="button" class="row" data-row="1" disabled>',
    '<button type="button" class="row" data-row="2" data-key="a">',
  ]);
  assert.match(out, /data-row="0" data-key="c"><span class="line"><kbd class="k-key">c<\/kbd>  continue        <span class="k-dim">one more round<\/span><\/span><\/button>/);
  assert.ok(!out.slice(out.indexOf('data-row="1"'), out.indexOf('data-row="2"')).includes('<kbd'), 'a keyless row has no badge');
});

test('entries: each line of an entry carries data-entry; the selected entry\'s lines carry the class', () => {
  const sit = pane(html(view()), 'sit');
  assert.equal((sit.match(/class="line entry selected" data-entry="1"/g) ?? []).length, 2);
  assert.equal((sit.match(/class="line entry" data-entry="0"/g) ?? []).length, 1);
  assert.equal((sit.match(/data-entry=/g) ?? []).length, 3);
  assert.equal(pane(html(view({ selected: -1 })), 'sit').includes('selected'), false);
});

test('the title leads the situation; an empty line keeps its height', () => {
  const sit = pane(html(view()), 'sit');
  assert.ok(sit.startsWith('<div class="line title"><span class="k-title">conjure · cancel_booking</span> · <span class="k-paused">● paused</span></div>'));
  assert.ok(sit.includes('<div class="line"> </div>'));
});

test('text is escaped: the < of a diff line never becomes markup', () => {
  const diff = pane(html(view()), 'diff');
  assert.ok(diff.includes('<span class="k-red">-  if n &lt; 0:</span>'));
  assert.ok(diff.includes('<span class="k-green">+  if n &lt;= 0:</span>'));
  assert.ok(!diff.includes('n < 0'));
  const evil = html(view({ legend: '<script>x</script>', rows: [{ key: '"', label: 'l', detail: '', pressable: true, lines: [[{ text: '<b>', kind: 'key' }]] }] }));
  assert.ok(!evil.includes('<script>') && !evil.includes('<b>'));
  assert.ok(evil.includes('data-key="&quot;"'));
});

test('help mode: the key table replaces the diff pane', () => {
  const diff = pane(html(view({ help: [[{ text: 'c', kind: 'key' }, { text: '  one more round' }]] })), 'diff');
  assert.ok(diff.includes('<kbd class="k-key">c</kbd>  one more round'));
  assert.ok(!diff.includes('@@') && !diff.includes('keeps this'));
  assert.match(html(view({ help: [] })), /<section id="diff" class="help">/);
});

test('narrow: main carries narrow (and flipped), the short title shows; wide main has neither', () => {
  assert.match(html(view()), /^<main data-state="paused">/);
  const narrow = html(view({ narrow: true }));
  assert.match(narrow, /^<main class="narrow" data-state="paused">/);
  assert.ok(pane(narrow, 'sit').startsWith('<div class="line title"><span class="k-title">cancel_booking</span></div>'));
  assert.match(html(view({ narrow: true, flipped: true })), /^<main class="narrow flipped" data-state="paused">/);
});

test('the footer: the legend, or a notice in its place', () => {
  assert.equal(pane(html(view()), 'foot'), 'c continue · a keep · ? help');
  const out = html(view(), 'p: nothing was refused');
  assert.equal(pane(out, 'foot'), 'p: nothing was refused');
  assert.match(out, /<footer id="foot" class="line notice">/);
  assert.match(html(view(), ''), /<footer id="foot" class="line">c continue/);
});

test('running: the status line replaces the rows and the reason', () => {
  const out = html(view({
    state: 'running',
    reason: [{ text: 'why it was proposed' }],
    status: [{ text: '⠋', kind: 'spinner' }, { text: ' continue · round 3 · 4 s', kind: 'running' }],
  }));
  const off = pane(out, 'off');
  assert.equal(buttons(off).length, 0);
  assert.ok(!off.includes('why it was proposed'));
  assert.equal(off, '<div class="line status"><span class="k-spinner">⠋</span><span class="k-running"> continue · round 3 · 4 s</span></div>');
  assert.match(out, /data-state="running"/);
});

test('a proposal\'s reason sits above the rows', () => {
  const off = pane(html(view({ state: 'proposal', reason: [{ text: 'the test was wrong', kind: 'proposal' }] })), 'off');
  assert.ok(off.startsWith('<div class="line reason"><span class="k-proposal">the test was wrong</span></div><button'));
});

test('no inline style anywhere (the CSP allows none)', () => {
  for (const v of [view(), view({ narrow: true, flipped: true }), view({ help: [[{ text: 'x' }]] }), view({ state: 'running', status: [{ text: '⠋', kind: 'spinner' }] })]) {
    const out = html(v, 'a notice');
    assert.ok(!/style=/i.test(out) && !/<style/i.test(out), out);
  }
});
