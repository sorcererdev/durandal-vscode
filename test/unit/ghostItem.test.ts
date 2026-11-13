import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghostItem, MAX_ITEM, Served, ServedLog, SERVED_KEEP, suggestionText } from '../../src/suggest/ghostItem';

test('ghostItem: the whole line replaced by the new text; the command carries its one argument', () => {
  assert.deepEqual(ghostItem(5, '- e target line', '- e target line\n  - ok', 'durandal.plan.ghostAccepted', { uri: 'u', gen: 1, keys: [3] }), {
    line: 5, end: 15, insertText: '- e target line\n  - ok',
    command: { title: 'Ghost', command: 'durandal.plan.ghostAccepted', arguments: [{ uri: 'u', gen: 1, keys: [3] }] },
  });
});

// M7 plan checks §1: VS Code draws only text added after what the line holds
test('an extension of the line is an item: a do\'s step with words added', () => {
  assert.equal(ghostItem(8, '- [ ] s', '- [ ] s (step 3)\n  - did', 'c', 0)?.insertText, '- [ ] s (step 3)\n  - did');
});

test('no item where VS Code would draw nothing or the wrong thing', () => {
  assert.equal(ghostItem(3, '- c', '- c', 'c', 0), undefined, 'nothing added');
  assert.equal(ghostItem(3, '- c', undefined, 'c', 0), undefined, 'no text');
  assert.equal(ghostItem(8, '- [ ] s', '- [x] s\n  - did', 'c', 0), undefined, 'the line not kept as it is');
  assert.equal(ghostItem(2, 'do the thing', 'do another thing', 'c', 0), undefined, 'a subsequence is still a replace');
  assert.equal(ghostItem(1, 'x', 'x\n' + 'y'.repeat(MAX_ITEM), 'c', 0), undefined, 'past 5000 characters');
  assert.equal(MAX_ITEM, 5000);
});

test('suggestionText: the line, then the ghost\'s lines; none: no text', () => {
  assert.equal(suggestionText('x = 10', ['case A():', '    return x']), 'x = 10\ncase A():\n    return x');
  assert.equal(suggestionText('x = 10', []), undefined);
});

const ask = (i: number, insertText?: string): Served => ({ uri: 'u', line: i, insertText, args: i });

test('ServedLog: every ask kept in order, a refusal too; since(count) is what came after', () => {
  const log = new ServedLog();
  assert.equal(log.count, 0);
  log.record(ask(1, 'a'));
  const n = log.count;
  log.record(ask(2));
  log.record(ask(3, 'c'));
  assert.equal(log.count, 3);
  assert.deepEqual(log.since(n), [ask(2), ask(3, 'c')]);
  assert.deepEqual(log.since(log.count), []);
});

test('ServedLog: only the last 50 are kept; a count from before them gives what is kept', () => {
  const log = new ServedLog();
  for (let i = 0; i < SERVED_KEEP + 20; i++) log.record(ask(i, 'x'));
  assert.equal(SERVED_KEEP, 50);
  assert.equal(log.count, 70);
  assert.equal(log.since(0).length, 50);
  assert.equal(log.since(0)[0].line, 20);
  assert.deepEqual(log.since(68).map(s => s.line), [68, 69]);
});
