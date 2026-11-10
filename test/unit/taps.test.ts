import { test } from 'node:test';
import assert from 'node:assert/strict';
import type * as vscode from 'vscode';
import { planTaps, ReadingHooks } from '../../src/plans/taps';

test('a tap answer that lands after its document closed records nothing', async () => {
  let yes: (v: boolean) => void = () => undefined;
  const folds: number[] = [];
  const hooks: ReadingHooks = {
    isPlan: () => new Promise<boolean>(r => { yes = r; }),
    tokens: () => undefined,
    tokenEdits: () => undefined,
    folds: (uri, version) => { assert.equal(uri, 'file:///p.md'); folds.push(version); },
    lenses: () => undefined,
  };
  const taps = planTaps(() => hooks, () => undefined, () => undefined);
  const doc = { version: 3, isClosed: false, uri: { toString: () => 'file:///p.md' } } as unknown as vscode.TextDocument;
  const token = {} as vscode.CancellationToken;
  const ctx = {} as vscode.FoldingContext;
  const answer = [{ start: 1, end: 2 }] as vscode.FoldingRange[];
  await taps.provideFoldingRanges!(doc, ctx, token, () => answer);
  (doc as { isClosed: boolean }).isClosed = true;
  yes(true);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(folds, []);
  (doc as { isClosed: boolean }).isClosed = false;
  await taps.provideFoldingRanges!(doc, ctx, token, () => answer);
  yes(true);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(folds, [3]);
});
