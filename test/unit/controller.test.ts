import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActionEvent } from '../../src/actionLog';
import { ConsiderDeps, Controller, Cursor, noSuchPlan } from '../../src/suggest/controller';
import type { Shown } from '../../src/suggest/types';
import type { PlanResult, SuggestResult, Suggestion } from '../../src/protocol';

function setup() {
  const keys: { visible: boolean; kind?: string; band?: string }[] = [];
  const logged: ActionEvent[] = [];
  const c = new Controller({ view: { keys: k => keys.push(k) }, log: e => logged.push(e) });
  return { c, keys, logged, lastKeys: () => keys[keys.length - 1] };
}

const snippet = (o: Partial<Shown> = {}): Shown => ({
  kind: 'snippet', uri: 'file:///p/a.py', line: 4, lineText: '', version: 3, key: 'k1', generator: 'p/failure', name: 'p/failure', sets: {}, ...o,
});

test('an inline ghost is recorded and logged once per key; the keys follow', () => {
  const { c, logged, lastKeys } = setup();
  c.focus('file:///p/a.py');
  c.inline(snippet());
  c.inline(snippet());
  assert.equal(c.state('file:///p/a.py')?.kind, 'snippet');
  assert.deepEqual(logged, [{ event: 'snippet-shown', generator: 'p/failure', band: undefined, score: undefined }]);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'snippet', band: undefined });
});

test('moving off the line, or editing it, clears it at once', () => {
  const { c, lastKeys } = setup();
  c.focus('file:///p/a.py');
  c.inline(snippet());
  c.moved('file:///p/a.py', 4, '');
  assert.ok(c.state('file:///p/a.py'));
  c.moved('file:///p/a.py', 4, 'c');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.deepEqual(lastKeys(), { visible: false });
  c.inline(snippet());
  c.moved('file:///p/a.py', 5, '');
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('dismiss remembers the key, logs it and clears', () => {
  const { c, logged } = setup();
  c.inline(snippet());
  c.dismiss('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.ok(c.isDismissed('file:///p/a.py', 'k1'));
  assert.ok(!c.isDismissed('file:///p/b.py', 'k1'));
  assert.deepEqual(logged.at(-1), { event: 'snippet-dismissed', generator: 'p/failure', band: undefined, score: undefined });
});

test('closed forgets the state and the dismissals', () => {
  const { c } = setup();
  c.inline(snippet());
  c.dismiss('file:///p/a.py');
  c.inline(snippet({ key: 'k2' }));
  c.closed('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.ok(!c.isDismissed('file:///p/a.py', 'k1'));
});

test('the keys follow the active editor', () => {
  const { c, lastKeys } = setup();
  c.inline(snippet());
  c.focus('file:///p/b.py');
  assert.deepEqual(lastKeys(), { visible: false });
  c.focus('file:///p/a.py');
  assert.deepEqual(lastKeys(), { visible: true, kind: 'snippet', band: undefined });
  c.focus(undefined);
  assert.deepEqual(lastKeys(), { visible: false });
});

test('off clears every document; clearSnippet only a snippet; nonInline is a decoration kind on the line', () => {
  const { c } = setup();
  c.inline(snippet());
  c.inline(snippet({ uri: 'file:///p/b.py' }));
  assert.equal(c.nonInline('file:///p/a.py', 4), false);
  c.inline(snippet({ uri: 'file:///p/c.py', kind: 'followup' }));
  assert.equal(c.nonInline('file:///p/c.py', 4), true);
  assert.equal(c.nonInline('file:///p/c.py', 5), false);
  c.clearSnippet('file:///p/c.py');
  assert.equal(c.state('file:///p/c.py')?.kind, 'followup', 'clearSnippet leaves a decoration kind');
  c.clearSnippet('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  c.off();
  assert.equal(c.state('file:///p/b.py'), undefined);
  assert.equal(c.state('file:///p/c.py'), undefined);
});

const PLAN = { files: [{ path: 'a.py', before: 'x', after: 'y' }], conflicts: [], warnings: [], holes: [], snippet: null };

class FakeTimer {
  fns = new Map<number, () => void>();
  n = 0;
  set = (f: () => void) => { this.fns.set(++this.n, f); return this.n; };
  clear = (h: unknown) => { this.fns.delete(h as number); };
  fire() { const fs = [...this.fns.values()]; this.fns.clear(); for (const f of fs) f(); }
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

function considering(o: { cursor?: Cursor } = {}) {
  const logged: ActionEvent[] = [];
  const keys: { visible: boolean; kind?: string; band?: string; inline?: true }[] = [];
  const shown: Shown[] = [];
  const hidden: string[] = [];
  let inlineHidden = 0;
  const c = new Controller({
    view: { keys: k => keys.push(k), show: st => shown.push(st), hide: uri => hidden.push(uri), hideInline: () => { inlineHidden++; } },
    log: e => logged.push(e),
  });
  const st = {
    enabled: true, running: true,
    cursor: o.cursor ?? { uri: 'file:///p/a.py', version: 4, line: 6, lineText: 'class Cancelled:', inProject: true } as Cursor | undefined,
    suggests: [] as { uri: string; line: number; d: ReturnType<typeof deferred<SuggestResult | null>> }[],
    plans: [] as { planId: number; d: ReturnType<typeof deferred<PlanResult>> }[],
    triggered: 0,
    feedback: [] as string[],
  };
  const timer = new FakeTimer();
  const deps: ConsiderDeps = {
    enabled: () => st.enabled, running: () => st.running, cursor: () => st.cursor,
    suggest: (uri, line) => { const d = deferred<SuggestResult | null>(); st.suggests.push({ uri, line, d }); return d.promise; },
    plan: planId => { const d = deferred<PlanResult>(); st.plans.push({ planId, d }); return d.promise; },
    triggerInline: () => { st.triggered++; },
    feedback: (_uri, g, outcome) => { st.feedback.push(`${g} ${outcome}`); },
    debounceMs: () => 300, timer,
  };
  c.attach(deps);
  c.focus('file:///p/a.py');
  return { c, st, timer, shown, hidden, logged, inlineHidden: () => inlineHidden, lastKeys: () => keys[keys.length - 1] };
}

const sug = (o: Partial<Suggestion> = {}): Suggestion => ({
  uri: 'file:///p/a.py', version: 4, kind: 'followup', label: 'Failure arms', summary: '2 files', line: 7, lines: null, at: 7, planId: 3,
  generator: null, sets: {}, ...o,
});

test('one request per burst: the cursor settles before anything is asked', async () => {
  const { c, st, timer } = considering();
  c.schedule(); c.schedule(); c.schedule();
  assert.equal(st.suggests.length, 0);
  timer.fire();
  await flush();
  assert.equal(st.suggests.length, 1);
  assert.equal(st.suggests[0].line, 7, 'olifant/suggest takes the 1-based line');
});

test('a pulled follow-up with its plan is shown and logged; nothing pulled clears it and triggers nothing', async () => {
  const { c, st, shown, logged } = considering();
  const p = c.consider();
  await flush();
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup');
  assert.equal(shown.at(-1)?.summary, '2 files');
  assert.deepEqual(logged.at(-1), { event: 'followup-shown', generator: 'Failure arms', band: undefined, score: undefined });
  const q = c.consider();
  await flush();
  st.suggests[1].d.resolve(null);
  await q;
  assert.equal(c.state('file:///p/a.py'), undefined, 'the decoration goes');
  assert.equal(st.triggered, 0, 'an empty consideration asks no inline provider (spec §0)');
});

test('a pulled snippet triggers the inline ghost; a pulled ghost without a plan does not', async () => {
  const { c, st, logged } = considering();
  const p = c.consider();
  await flush();
  st.suggests[0].d.resolve({ ...sug({ kind: 'snippet', label: 'p/failure' }), plan: null } as unknown as SuggestResult);
  await p;
  assert.equal(st.triggered, 1);
  assert.deepEqual(logged.at(-1), { event: 'snippet-anticipated', generator: 'p/failure', line: 7 });
  const q = c.consider();
  await flush();
  st.suggests[1].d.resolve({ ...sug({ kind: 'followup' }), plan: null } as unknown as SuggestResult);
  await q;
  assert.equal(st.triggered, 1);
});

test('stopped: a pushed follow-up is not offered again from its cached plan; the pull is asked', async () => {
  const { c, st } = considering();
  c.pushed(sug());
  await flush();
  st.plans[0].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup');
  c.stopped();
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.equal(c.store.current('file:///p/a.py', 4, 6), undefined, 'the push is gone');
  const p = c.consider();
  await flush();
  assert.equal(st.plans.length, 1, 'no plan asked');
  assert.equal(st.suggests.length, 1, 'the pull is used');
  assert.equal(c.state('file:///p/a.py'), undefined, 'nothing offered from the cached plan');
  st.suggests[0].d.resolve(null);
  await p;
});

test('off keeps the pushes (ghosts off); stopped drops them', async () => {
  const { c } = considering();
  c.pushed(sug({ version: 3 }));
  c.off();
  assert.ok(c.store.current('file:///p/a.py', 3, 6));
  c.stopped();
  assert.equal(c.store.current('file:///p/a.py', 3, 6), undefined);
});

test('a stale answer is dropped: the cursor moved, the version changed, or a newer consideration began', async () => {
  const { c, st } = considering();
  const p = c.consider();
  await flush();
  st.cursor = { ...st.cursor!, line: 8 };
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.equal(st.triggered, 0);
  st.cursor = { ...st.cursor!, line: 6 };
  const first = c.consider();
  await flush();
  const second = c.consider();
  await flush();
  st.suggests[1].d.resolve({ ...sug(), plan: PLAN });
  await first;
  assert.equal(c.state('file:///p/a.py'), undefined, 'the older answer counts for nothing');
  st.suggests[2].d.resolve(null);
  await second;
});

test('ghosts off drops an in-flight answer', async () => {
  const { c, st } = considering();
  const p = c.consider();
  await flush();
  st.enabled = false;
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('the server stopping drops an in-flight answer', async () => {
  const { c, st } = considering();
  const p = c.consider();
  await flush();
  st.running = false;
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('not running: nothing asked, the suggestion cleared', async () => {
  const { c, st } = considering();
  c.inline({ ...snippet(), uri: 'file:///p/a.py' });
  st.running = false;
  await c.consider();
  assert.equal(st.suggests.length, 0);
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('off drops an in-flight answer and the pending pause', async () => {
  const { c, st, timer } = considering();
  const p = c.consider();
  await flush();
  c.schedule();
  c.off();
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py'), undefined, 'nothing late lands');
  assert.equal(st.triggered, 0);
  timer.fire();
  await flush();
  assert.equal(st.suggests.length, 1, 'the pending pause was cancelled');
});

test('order: a push for this version and line comes first; its plan is asked once', async () => {
  const { c, st } = considering();
  c.pushed(sug());
  await flush();
  assert.equal(st.plans.length, 1);
  assert.equal(st.plans[0].planId, 3);
  assert.equal(st.suggests.length, 0, 'no pull while the push is being planned');
  st.plans[0].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup');
  c.clear('file:///p/a.py');
  const p = c.consider();
  await flush();
  assert.equal(st.plans.length, 1, 'asked once per push');
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup', 'shown again from the plan in hand');
  await p;
});

test('a push whose plan request a newer pass cancelled is planned again by that pass, not pulled', async () => {
  const { c, st, timer } = considering();
  c.pushed(sug());
  await flush();
  assert.equal(st.plans.length, 1);
  c.schedule();
  timer.fire();
  await flush();
  st.plans[0].d.reject(new Error('Request cancelled'));
  await flush();
  assert.equal(st.plans.length, 2, 'the push is planned again');
  assert.equal(st.suggests.length, 0, 'no pull');
  st.plans[1].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup');
});

test('a push for another version or line is not used: the pull is asked', async () => {
  const { c, st } = considering();
  c.pushed(sug({ version: 3 }));
  await flush();
  assert.equal(st.plans.length, 0);
  assert.equal(st.suggests.length, 1);
  st.suggests[0].d.resolve(null);
  await flush();
});

test('a pushed snippet logs snippet-anticipated and triggers the inline ghost, without a pull', async () => {
  const { c, st, logged } = considering();
  c.pushed(sug({ kind: 'snippet', label: 'p/failure' }));
  await flush();
  assert.equal(st.triggered, 1);
  assert.equal(st.suggests.length, 0);
  assert.deepEqual(logged.at(-1), { event: 'snippet-anticipated', generator: 'p/failure', line: 7 });
});

test('a pushed ghost is shown with its lines, no plan asked', async () => {
  const { c, st } = considering();
  c.pushed(sug({ kind: 'ghost', label: 'Arms', lines: ['a', 'b'] }));
  await flush();
  assert.equal(st.plans.length, 0);
  assert.deepEqual(c.state('file:///p/a.py')?.lines, ['a', 'b']);
});

// M7 spec §4: a ghost going under the line (server line === at + 1; the cursor is line 6, at 7)
const BELOW: Partial<Suggestion> = { kind: 'ghost', label: 'Arms', lines: ['a', 'b'], line: 8, at: 7 };

test('a pushed ghost going under the line: ghostAt finds it and the inline ghost is asked for; ghostInline waits for the item', async () => {
  const { c, st, lastKeys } = considering();
  c.pushed(sug(BELOW));
  await flush();
  const g = c.ghostAt('file:///p/a.py', 6);
  assert.equal(g?.generator, 'Arms');
  assert.equal(c.ghostAt('file:///p/a.py', 5), undefined);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'ghost', band: undefined });
  assert.equal(st.triggered, 1);
  c.inlineServed('file:///p/a.py', g!.key, true);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'ghost', band: undefined, inline: true });
});

test('durandal.ghostInline is ours only while our item is served: a refusal, or another key, leaves it off (spec §4)', async () => {
  const { c, lastKeys } = considering();
  c.pushed(sug(BELOW));
  await flush();
  const key = c.ghostAt('file:///p/a.py', 6)!.key;
  c.inlineServed('file:///p/a.py', 'another', true);
  assert.equal(lastKeys().inline, undefined);
  c.inlineServed('file:///p/a.py', key, true);
  assert.equal(lastKeys().inline, true);
  c.inlineServed('file:///p/a.py', key, false);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'ghost', band: undefined });
  c.inlineServed('file:///p/a.py', key, true);
  c.moved('file:///p/a.py', 5, 'x');
  assert.deepEqual(lastKeys(), { visible: false });
  c.inlineServed('file:///p/a.py', key, true);
  assert.deepEqual(lastKeys(), { visible: false }, 'nothing shown: nothing served of ours');
});

test('a ghost going above the line: band only, no ghostAt, no ghostInline, nothing triggered (decision 8)', async () => {
  const { c, st, lastKeys } = considering();
  c.pushed(sug({ ...BELOW, line: 7 }));
  await flush();
  const s = c.state('file:///p/a.py');
  assert.equal(s?.kind, 'ghost');
  assert.equal(c.ghostAt('file:///p/a.py', 6), undefined);
  c.inlineServed('file:///p/a.py', s!.key, true);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'ghost', band: undefined });
  assert.equal(st.triggered, 0);
});

test('each cursor move on the ghost\'s line asks for the inline ghost again, once; off the line it goes', async () => {
  const { c, st } = considering();
  c.pushed(sug(BELOW));
  await flush();
  const n = st.triggered;
  c.moved('file:///p/a.py', 6, 'class Cancelled:');
  c.schedule();
  assert.equal(st.triggered, n + 1, 'once per move (the editor calls moved, then schedule)');
  st.cursor = { uri: 'file:///p/a.py', version: 4, line: 5, lineText: 'x', inProject: true };
  c.moved('file:///p/a.py', 5, 'x');
  c.schedule();
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.equal(st.triggered, n + 1);
});

test('Esc on a ghost going under the line: dismissed wherever its block goes, ghostInline off (M7 spec §2)', async () => {
  const { c, st, logged, lastKeys } = considering();
  c.pushed(sug(BELOW));
  await flush();
  c.inlineServed('file:///p/a.py', c.ghostAt('file:///p/a.py', 6)!.key, true);
  c.dismiss('file:///p/a.py');
  assert.equal(logged.at(-1)?.event, 'ghost-dismissed');
  assert.deepEqual(lastKeys(), { visible: false });
  c.pushed(sug({ ...BELOW, line: 7 }));
  await flush();
  assert.equal(c.state('file:///p/a.py'), undefined, 'the same ghost going above is dismissed too');
  c.pushed(sug(BELOW));
  await flush();
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.equal(st.triggered, 1, 'a dismissed ghost is not asked for');
});

test('no such plan falls through to the pull, and the push is forgotten', async () => {
  const { c, st } = considering();
  c.pushed(sug());
  await flush();
  st.plans[0].d.reject(new Error('no such plan (offered plans last until their document changes)'));
  await flush();
  assert.equal(st.suggests.length, 1);
  assert.equal(c.store.current('file:///p/a.py', 4, 6), undefined);
  st.suggests[0].d.resolve(null);
  await flush();
  assert.ok(noSuchPlan(new Error('no such plan (x)')));
  assert.ok(!noSuchPlan(new Error('boom')));
});

test('recognitions: a hint needs no plan and logs model; the model\'s upgrade to an offer replaces it; a dismissed offer stays away and says so', async () => {
  const { c, st, logged, lastKeys } = considering();
  const rec = (o: Partial<Suggestion>) => sug({ kind: 'recognition', label: 'Command', generator: 'p/command', sets: { command: 'x' }, ...o });
  c.pushed(rec({ band: 'hint', reasons: ['the model agrees'], score: 0.5 }));
  await flush();
  assert.equal(st.plans.length, 0);
  assert.equal(c.state('file:///p/a.py')?.band, 'hint');
  assert.deepEqual(logged.at(-1), { event: 'recognition-shown', generator: 'p/command', band: 'hint', score: 0.5, model: true });
  c.pushed(rec({ band: 'offer', planId: 4 }));
  await flush();
  st.plans[0].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py')?.band, 'offer');
  c.dismiss('file:///p/a.py');
  assert.deepEqual(st.feedback, ['p/command dismissed']);
  c.pushed(rec({ band: 'offer', planId: 5 }));
  await flush();
  st.plans[1].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py'), undefined, 'the dismissed offer is not shown again here');
  c.pushed(rec({ band: 'offer', planId: 6, or: 'p/query' }));
  await flush();
  assert.deepEqual(lastKeys(), { visible: true, kind: 'recognition', band: 'choice' }, 'durandal.ghostBand is choice for a choice');
});

test('a pulled recognition is offered with the plan the pull carries', async () => {
  const { c, st } = considering();
  const p = c.consider();
  await flush();
  st.suggests[0].d.resolve({ ...sug({ kind: 'recognition', label: 'Command', generator: 'p/command', band: 'offer' }), plan: PLAN });
  await p;
  assert.deepEqual(c.state('file:///p/a.py')?.plan, PLAN);
  assert.equal(st.plans.length, 0);
});

test('a decoration replacing the inline snippet hides the inline ghost', async () => {
  const { c, st, inlineHidden } = considering();
  c.inline({ ...snippet(), line: 6, lineText: 'class Cancelled:', version: 4 });
  const p = c.consider();
  await flush();
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup');
  assert.equal(inlineHidden(), 1);
});

test('schedule clears at once when the line changed, before the pause', () => {
  const { c, st } = considering();
  c.inline({ ...snippet(), uri: 'file:///p/a.py', line: 6, lineText: 'class Cancelled:' });
  st.cursor = { ...st.cursor!, lineText: 'class Cancelled:x' };
  c.schedule();
  assert.equal(c.state('file:///p/a.py'), undefined);
});
