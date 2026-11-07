import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RequestType } from 'vscode-languageserver-protocol';
import type { ActionEvent } from '../../src/actionLog';
import { asPreset, Flow, FlowEnv, FlowServer, Origin } from '../../src/generate/flow';
import type { FormRow } from '../../src/generate/form';
import type { Field, GeneratorItem, Plan, PlanResult, PlanSnippet, PreviewResult } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { fld, plan } from '../fixtures';

const tick = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Pending { method: string; params: any; resolve(v: unknown): void; reject(e: unknown): void }

class FakeServer implements FlowServer {
  pending: Pending[] = [];
  sent: Pending[] = [];
  up = true;
  request<P, R>(type: RequestType<P, R, void>, params: P): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const p: Pending = { method: type.method, params, resolve: resolve as (v: unknown) => void, reject };
      this.pending.push(p);
      this.sent.push(p);
    });
  }
  running() { return this.up; }
  // take removes and returns the oldest pending request of method
  take(method: string): Pending {
    const i = this.pending.findIndex(p => p.method === method);
    assert.ok(i >= 0, `no pending ${method}; pending: ${this.pending.map(p => p.method).join(', ')}`);
    return this.pending.splice(i, 1)[0];
  }
  count(method: string) { return this.sent.filter(p => p.method === method).length; }
}

class FakeSink {
  shown: PreviewResult[] = [];
  disposed = false;
  show(r: PreviewResult) { this.shown.push(r); }
  dispose() { this.disposed = true; }
}

const origin: Origin = { uri: 'file:///w/src/booking/create_booking.py', position: { line: 3, character: 2 }, root: '/w' };
const command: GeneratorItem = { id: 'p/command', name: 'Command', summary: 'a use case', here: true };
const query: GeneratorItem = { id: 'p/query', name: 'Query', summary: 'reads' };
const preview = (fields: Field[], o: Partial<PreviewResult> = {}): PreviewResult => ({
  steps: [{ generator: 'p/command', fields }],
  files: [{ path: 'src/a.py', new: true, added: 3, removed: 0 }],
  main: { path: 'src/a.py', text: 'a\n', first: 1 },
  ready: false, error: null, ...o,
});
const app = fld({ name: 'app', value: 'bistro', source: 'only' });
const missing = preview([app, fld({ name: 'command', valid: false })]);
const filled = preview([app, fld({ name: 'command', value: 'close_table', source: 'you' })], { ready: true });
const planned = (o: Partial<Plan> = {}): PlanResult => ({
  plan: plan({ files: [{ path: 'src/a.py', before: null, after: 'a\n' }], ...o }),
  edit: { documentChanges: [] },
});
const fieldRows = (rows: FormRow[]) => rows.filter((r): r is Extract<FormRow, { kind: 'field' }> => r.kind === 'field');

function setup(debounceMs = 0) {
  const server = new FakeServer();
  const ui = new FakeUi();
  const sink = new FakeSink();
  const logged: ActionEvent[] = [];
  const remembered: string[] = [];
  const landed: { plan: Plan; name: string }[] = [];
  const snippets: PlanSnippet[] = [];
  const reviews: { plan: Plan; title: string; landed(): void }[] = [];
  let landError: string | undefined;
  const env: FlowEnv = {
    server, ui, preview: sink, recent: ['p/query'],
    remember: id => { remembered.push(id); },
    log: e => { logged.push(e); },
    land: async (p, _edit, name) => { landed.push({ plan: p, name }); return landError; },
    snippet: async s => { snippets.push(s); return true; },
    review: async (p, _edit, o) => { reviews.push({ plan: p, ...o }); },
    debounceMs,
  };
  const flow = new Flow(env, origin);
  return { server, ui, sink, logged, remembered, landed, snippets, reviews, flow, failLand: (m: string) => { landError = m; } };
}
type S = ReturnType<typeof setup>;

// opened: past the list on Command, its first preview answered with r.
async function opened(r: PreviewResult = missing, debounceMs = 0): Promise<S> {
  const s = setup(debounceMs);
  s.ui.onPick = o => o.items.find(i => (i.value as GeneratorItem | undefined)?.id === 'p/command')?.value;
  void s.flow.start();
  await tick();
  s.server.take('olifant/generators').resolve({ generators: [query, command] });
  await tick();
  s.server.take('olifant/preview').resolve(r);
  await tick();
  return s;
}

// type answers a text field: opens it, types text (one preview, debounce 0) and accepts.
async function type(s: S, step: number, name: string, text: string): Promise<void> {
  void s.ui.openForm!.answer({ kind: 'field', step, name });
  await tick();
  const t = s.ui.texts[s.ui.texts.length - 1];
  t.onChange!(text);
  t.finish(text);
  await tick();
}

// ready: command typed and the preview ready.
async function ready(): Promise<S> {
  const s = await opened();
  await type(s, 0, 'command', 'close_table');
  s.server.take('olifant/preview').resolve(filled);
  await tick();
  return s;
}

test('asPreset reads {generator, sets, done}, keeping string values', () => {
  assert.deepEqual(asPreset({ generator: 'g', sets: { a: 'x', n: 1 }, done: true }), { generator: 'g', sets: { a: 'x' }, done: true });
  assert.deepEqual(asPreset({ generator: 'g' }), { generator: 'g', sets: {}, done: false });
  assert.equal(asPreset('g'), undefined);
  assert.equal(asPreset(undefined), undefined);
});

test('no generators: the error names the root, and the flow ends', async () => {
  const s = setup();
  void s.flow.start();
  await tick();
  const p = s.server.take('olifant/generators');
  assert.deepEqual(p.params, { textDocument: { uri: origin.uri }, position: origin.position });
  p.resolve({ generators: [] });
  assert.deepEqual(await s.flow.result, { kind: 'closed' });
  assert.deepEqual(s.ui.log, ['error no generators in /w (its packs: .olifant/config.toml)']);
  assert.equal(s.ui.forms.length, 0);
});

test('the list: here first under its heading, then the rest by recent and name; a query ranks without headings', async () => {
  const s = setup();
  s.ui.onPick = () => undefined;
  void s.flow.start();
  await tick();
  s.server.take('olifant/generators').resolve({ generators: [{ id: 'p/event', name: 'Event' }, command, query] });
  await tick();
  const o = s.ui.picks[0];
  assert.deepEqual(o.items.map(i => (i.separator ? `[${i.label}]` : i.label)), ['[here]', 'Command', '[all]', 'Query', 'Event']);
  assert.deepEqual(o.query!('que').map(i => i.label), ['Query']);
  assert.deepEqual(await s.flow.result, { kind: 'closed' }, 'nothing picked');
});

test('picking opens the form and previews with no values; the answer fills the rows and the title', async () => {
  const s = await opened();
  const first = s.server.sent.filter(p => p.method === 'olifant/preview')[0];
  assert.deepEqual(first.params, { textDocument: { uri: origin.uri }, position: origin.position, steps: [{ generator: 'p/command', sets: {} }] });
  const m = s.ui.openForm!.model;
  assert.equal(m.title, 'Command · + src/a.py');
  assert.deepEqual(fieldRows(m.rows).map(r => [r.name, r.description, r.detail]), [['app', 'bistro', 'only one'], ['command', '⟨command⟩', undefined]]);
  assert.equal(m.ready, false);
  assert.deepEqual(s.sink.shown[s.sink.shown.length - 1], missing);
});

test('a preset opens its generator at once with its values; one the list lacks opens too', async () => {
  for (const id of ['p/command', 'p/hidden']) {
    const s = setup();
    void s.flow.start({ generator: id, sets: { app: 'bistro' } });
    await tick();
    s.server.take('olifant/generators').resolve({ generators: [command] });
    await tick();
    assert.equal(s.ui.picks.length, 0);
    assert.deepEqual(s.server.take('olifant/preview').params.steps, [{ generator: id, sets: { app: 'bistro' } }]);
  }
});

test('typing: one preview per burst (Review Focus 1)', async () => {
  const s = await opened(missing, 30);
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  const t = s.ui.texts[0];
  t.onChange!('c');
  t.onChange!('cl');
  t.onChange!('close');
  await sleep(80);
  const sent = s.server.sent.filter(p => p.method === 'olifant/preview');
  assert.equal(sent.length, 2, 'the first, then one for the burst');
  assert.deepEqual(sent[1].params.steps[0].sets, { command: 'close' });
});

test('an older answer is dropped (Review Focus 1)', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  const t = s.ui.texts[0];
  t.onChange!('a');
  await tick();
  const old = s.server.take('olifant/preview');
  t.onChange!('ab');
  await tick();
  s.server.take('olifant/preview').resolve(filled);
  await tick();
  old.resolve(missing);
  await tick();
  assert.deepEqual(s.sink.shown[s.sink.shown.length - 1], filled);
});

test('-32800 (superseded) is ignored (Review Focus 1)', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  s.ui.texts[0].onChange!('x');
  await tick();
  s.server.take('olifant/preview').reject(Object.assign(new Error('superseded by a newer preview'), { code: -32800 }));
  await tick();
  assert.deepEqual(s.ui.log.filter(l => l.startsWith('error')), []);
  assert.equal(s.sink.shown.length, 1, 'nothing painted');
});

test('a failed preview shows its error and disarms a waiting Enter', async () => {
  const s = await opened(missing, 30);
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  const t = s.ui.texts[0];
  t.onChange!('close');
  t.finish('close');
  await tick();
  // the debounced preview is still waiting: Enter sends it now and waits for its answer
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/preview').reject(new Error('boom'));
  await tick();
  assert.equal(s.sink.shown[s.sink.shown.length - 1].error, 'boom');
  assert.equal(s.server.count('olifant/plan'), 0);
  assert.equal(s.ui.texts.length, 1, 'the disarmed Enter opened no editor');
  assert.ok(s.ui.openForm);
});

test('Enter when not ready opens the first missing field', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  assert.equal(s.ui.texts[s.ui.texts.length - 1].title, 'command: command');
  assert.equal(s.server.count('olifant/plan'), 0);
});

test('Enter when ready plans with the inferred values merged, lands, logs, remembers, ends', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  const p = s.server.take('olifant/plan');
  assert.deepEqual(p.params.steps, [{ generator: 'p/command', sets: { app: 'bistro', command: 'close_table' } }]);
  p.resolve(planned());
  assert.deepEqual(await s.flow.result, { kind: 'applied' });
  assert.deepEqual(s.landed.map(l => l.name), ['Command']);
  assert.deepEqual(s.logged, [{ event: 'generate-applied', generator: 'p/command' }]);
  assert.deepEqual(s.remembered, ['p/command']);
  assert.ok(s.sink.disposed);
  assert.ok(!s.ui.openForm);
});

test('a plan that did not land keeps the form open with its values and the error', async () => {
  const s = await ready();
  s.failLand('src/a.py changed since planning; nothing was applied — plan again');
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/plan').resolve(planned());
  await tick();
  assert.equal(s.ui.openForm!.model.error, 'src/a.py changed since planning; nothing was applied — plan again');
  assert.ok(s.ui.log.includes('error src/a.py changed since planning; nothing was applied — plan again'));
  assert.deepEqual(s.logged, []);
  assert.equal(fieldRows(s.ui.openForm!.model.rows)[1].description, 'close_table');
});

test('a refused plan (the server\'s error) keeps the form with the error', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/plan').reject(new Error('src/a.py exists'));
  await tick();
  assert.equal(s.ui.openForm!.model.error, 'src/a.py exists');
  assert.equal(s.landed.length, 0);
});

test('a snippet plan inserts the snippet instead of landing', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/plan').resolve(planned({ snippet: { file: 'src/a.py', line: 3, body: 'x = ${1:1}' } }));
  assert.deepEqual(await s.flow.result, { kind: 'snippet' });
  assert.deepEqual(s.snippets, [{ file: 'src/a.py', line: 3, body: 'x = ${1:1}' }]);
  assert.equal(s.landed.length, 0);
  assert.deepEqual(s.logged, [{ event: 'generate-applied', generator: 'p/command' }]);
});

test('done mode: Enter hands back the last step\'s values, merged, without planning', async () => {
  const s = setup();
  void s.flow.start({ generator: 'p/command', sets: { app: 'bistro' }, done: true });
  await tick();
  s.server.take('olifant/generators').resolve({ generators: [command] });
  await tick();
  s.server.take('olifant/preview').resolve(missing);
  await tick();
  await type(s, 0, 'command', 'close_table');
  s.server.take('olifant/preview').resolve(filled);
  await tick();
  void s.ui.openForm!.answer({ kind: 'apply' });
  assert.deepEqual(await s.flow.result, { kind: 'sets', sets: { app: 'bistro', command: 'close_table' } });
  assert.equal(s.server.count('olifant/plan'), 0);
});

test('Review plans, closes the form, opens the review; its landing logs generate-applied', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'review' });
  await tick();
  s.server.take('olifant/plan').resolve(planned());
  assert.deepEqual(await s.flow.result, { kind: 'reviewed' });
  assert.equal(s.reviews.length, 1);
  assert.equal(s.reviews[0].title, 'Command');
  assert.ok(!s.ui.openForm);
  s.reviews[0].landed();
  assert.deepEqual(s.logged, [{ event: 'generate-applied', generator: 'p/command' }]);
});

test('a review whose values changed while it was planned is dropped', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'review' });
  await tick();
  const p = s.server.take('olifant/plan');
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  s.ui.texts[s.ui.texts.length - 1].onChange!('other');
  await tick();
  p.resolve(planned());
  await tick();
  assert.equal(s.reviews.length, 0);
});

test('+ New puts a step before the field\'s, with makes; a plain choice later drops it (Review Focus 4)', async () => {
  const port = preview([fld({ name: 'kind', value: 'commands', source: 'only' }), fld({ name: 'port', valid: false, choices: ['orders'], new: ['p/repository'] })]);
  const s = await opened(port);
  s.ui.onPick = o => o.items.find(i => i.label === '+ New repository…')?.value;
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'port' });
  await tick();
  const sent = s.server.take('olifant/preview');
  assert.deepEqual(sent.params.steps, [
    { generator: 'p/repository', sets: { kind: 'commands' }, makes: { step: 1, input: 'port' } },
    { generator: 'p/command', sets: {} },
  ]);
  sent.resolve({ ...port, steps: [{ generator: 'p/repository', fields: [fld({ name: 'entity', valid: false })] }, port.steps[0]] });
  await tick();
  const m = s.ui.openForm!.model;
  assert.deepEqual(m.rows.filter(r => r.kind === 'heading').map(r => r.label), ['+ New repository (for port)', 'command']);
  assert.equal(m.active, '0:entity', 'the new step\'s first field');
  s.ui.onPick = o => o.items.find(i => i.label === 'orders')?.value;
  void s.ui.openForm!.answer({ kind: 'field', step: 1, name: 'port' });
  await tick();
  assert.deepEqual(s.server.take('olifant/preview').params.steps, [{ generator: 'p/command', sets: { port: 'orders' } }]);
});

test('+ New past three steps is refused with a warning (Review Focus 4)', async () => {
  const deep = (generator: string) => ({ generator, fields: [fld({ name: 'x', valid: false, new: ['p/more'] })] });
  const s = await opened(preview([], { steps: [deep('p/command')] }));
  s.ui.onPick = o => o.items.find(i => i.label === '+ New more…')?.value;
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'x' });
  await tick();
  s.server.take('olifant/preview').resolve(preview([], { steps: [deep('p/more'), deep('p/command')] }));
  await tick();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'x' });
  await tick();
  s.server.take('olifant/preview').resolve(preview([], { steps: [deep('p/more'), deep('p/more'), deep('p/command')] }));
  await tick();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'x' });
  await tick();
  assert.ok(s.ui.log.includes('warn + New goes two levels deep at most'));
  assert.equal(s.server.pending.filter(p => p.method === 'olifant/preview').length, 0);
});

test('Back returns to the list and keeps the generator\'s values', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'back' });
  await tick();
  assert.equal(s.ui.picks.filter(p => p.title === 'Generate').length, 2);
  assert.deepEqual(s.server.take('olifant/preview').params.steps, [{ generator: 'p/command', sets: { command: 'close_table' } }]);
});

test('Escape ends the flow and closes the preview', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'escape' });
  assert.deepEqual(await s.flow.result, { kind: 'closed' });
  assert.ok(s.sink.disposed);
});

test('the server gone: the failed preview says so once and the form closes (Review Focus 3)', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  s.ui.texts[0].onChange!('x');
  await tick();
  s.server.up = false;
  s.server.take('olifant/preview').reject(new Error('olifant lsp is not running here (Durandal: Show Health)'));
  assert.deepEqual(await s.flow.result, { kind: 'closed' });
  assert.deepEqual(s.ui.log.filter(l => l.startsWith('error')), ['error olifant lsp is not running here (Durandal: Show Health)']);
  assert.ok(s.ui.stepsClosed > 0, 'the open editor closed');
});
