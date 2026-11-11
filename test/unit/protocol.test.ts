import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Field, PreviewResult, Plan, FileActionsResult, ModelResult, GeneratorItem, InlineItem, SnippetData, Suggestion, SuggestResult,
  ChoicesResult, ConjureLanded, ConjurePaused, ConjureResume, MutateResult, StubResult, TestsRunResult, TestsRunParams, WaiveResult,
  ChooseResult, DoReview, ReconcileReview, ReviewsResult, ErrandParams, ReviewChooseParams, ReconcileResult, ErrandsResult,
} from '../../src/protocol';
import { fixture, wrapped } from '../pauseFixtures';
import { CLIENT_COMMANDS, Lsp, METHODS, Olifant, PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES, SERVER_COMMANDS } from '../../src/protocol';

const PINNED = [
  'olifant/choices', 'olifant/conjure', 'olifant/debugState', 'olifant/fileActions', 'olifant/generators',
  'olifant/holes', 'olifant/model', 'olifant/mutate', 'olifant/plan', 'olifant/plans/anchor', 'olifant/plans/ask',
  'olifant/plans/do', 'olifant/plans/errand', 'olifant/plans/errands', 'olifant/plans/files', 'olifant/plans/idle', 'olifant/plans/outcome',
  'olifant/plans/reconcile', 'olifant/plans/review', 'olifant/plans/review/choose', 'olifant/plans/review/ready',
  'olifant/plans/reviews', 'olifant/plans/stub', 'olifant/plans/test', 'olifant/plans/validate', 'olifant/preview',
  'olifant/recognitionFeedback', 'olifant/stub', 'olifant/suggest', 'olifant/suggestion', 'olifant/tests/file',
  'olifant/tests/run', 'olifant/waive',
];

test('every olifant/* method, once', () => {
  assert.deepEqual([...METHODS].sort(), PINNED);
  assert.equal(new Set(METHODS).size, METHODS.length);
  assert.equal(Olifant.testsRun.method, 'olifant/tests/run');
  assert.equal(Olifant.plansReviewChoose.method, 'olifant/plans/review/choose');
});

test('the commands and the plan legend', () => {
  assert.deepEqual(SERVER_COMMANDS, {
    doctor: 'olifant.doctor', checkSentence: 'olifant.checkSentence', showWhy: 'olifant.showWhy', showCode: 'olifant.showCode',
  });
  assert.deepEqual(Object.values(CLIENT_COMMANDS).sort(),
    ['olifant.plans.errand', 'olifant.plans.excerpt', 'olifant.plans.review', 'olifant.showActions']);
  assert.equal(PLAN_TOKEN_TYPES.length, 13);
  assert.deepEqual([...PLAN_TOKEN_MODIFIERS], ['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved']);
  assert.equal(Olifant.plansIdle.method, 'olifant/plans/idle');
});

// hsFiles lists olifant's library sources, without the specs.
function hsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return hsFiles(p);
    return n.endsWith('.hs') && !n.endsWith('Spec.hs') ? [p] : [];
  });
}

// With an olifant checkout (OLIFANT_REPO, as CI has at .olifant-ref), the contract is checked
// against the server's source: a method or command it gains or drops fails here. When the scan
// finds a new name, add it to protocol.ts (and, for a command, to commandTable.ts's
// SERVER_NAMED); never loosen the scan.
test('the contract matches olifant\'s source', { skip: !process.env.OLIFANT_REPO && 'OLIFANT_REPO is not set' }, () => {
  const files = hsFiles(join(process.env.OLIFANT_REPO!, 'src'));
  const methods = new Set<string>();
  const commands = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/Proxy :: Proxy "(olifant\/[A-Za-z/]+)"/g)) methods.add(m[1]);
    for (const line of src.split('\n')) {
      if (!line.includes('Command')) continue;
      for (const m of line.matchAll(/"(olifant\.[A-Za-z][A-Za-z.]*)"/g)) commands.add(m[1]);
    }
  }
  assert.deepEqual([...methods].sort(), PINNED);
  assert.deepEqual([...commands].sort(), [...Object.values(CLIENT_COMMANDS), ...Object.values(SERVER_COMMANDS)].sort());
  const plans = readFileSync(join(process.env.OLIFANT_REPO!, 'src/Olifant/Server/Plans.hs'), 'utf8');
  const types = /planTokenTypes =\s*\[([^\]]*)\]/.exec(plans)?.[1].match(/"[A-Za-z]+"/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(types, [...PLAN_TOKEN_TYPES]);
  const modifiers = /planTokenModifiers =\s*\[([^\]]*)\]/.exec(plans)?.[1].match(/"[A-Za-z]+"/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(modifiers, [...PLAN_TOKEN_MODIFIERS]);
});

// compile check: tsc over this file is the assertion that the types read as the server sends them.
test('compile check: the generate types read as the server sends them', () => {
  const g: GeneratorItem = { id: 'python-htmx/command', name: 'Command', here: true };
  const f: Field = { name: 'app', value: 'bistro', source: 'only', valid: true, why: null, choices: ['bistro'], needs: [], new: [] };
  const r: PreviewResult = { steps: [{ generator: g.id, fields: [f] }], files: [{ path: 'a.py', new: true, added: 2, removed: 0 }], main: { path: 'a.py', text: 'x\n', first: 1 }, ready: true, error: null };
  const p: Plan = { files: [{ path: 'a.py', before: null, after: 'x\n' }], conflicts: [], warnings: [], holes: [], snippet: null };
  const fa: FileActionsResult = { actions: [{ generator: 'g', name: 'G', label: 'Do', range: { start: [3, 4], end: [3, 8] }, sets: {}, missing: [], snippet: false }], nearby: [] };
  const m: ModelResult = { migration: { line: 'x', switches: [{ name: 's', on: true }], added_legacy: [], unregistered: [] } };
  assert.ok(r.steps.length === 1 && p.files && fa.actions.length === 1 && m.migration);
});

// The JSON keys the client reads from or sends in the generate, actions and model answers
// (protocol.ts types them). Each must appear as a string literal in olifant's source: a key the
// server renames fails here. When one fails, find what the server sends now and fix
// protocol.ts and its readers; never drop the key from this list to make it pass.
const KEYS = [
  'generators', 'id', 'name', 'summary', 'here',
  'steps', 'generator', 'sets', 'makes', 'step', 'input',
  'fields', 'value', 'source', 'valid', 'why', 'choices', 'needs', 'new',
  'files', 'path', 'added', 'removed', 'main', 'text', 'first', 'ready', 'error',
  'plan', 'edit', 'before', 'after', 'conflicts', 'message', 'warnings', 'holes', 'status', 'model', 'fill',
  'snippet', 'file', 'line', 'body',
  'actions', 'nearby', 'label', 'range', 'missing',
  'migration', 'switches', 'on', 'added_legacy', 'unregistered',
  'insertText', 'filterText', 'ghost',
  'uri', 'version', 'kind', 'lines', 'at', 'planId', 'band', 'or', 'reasons', 'score', 'data', 'optional', 'default', 'prompt', 'inputs',
];

test('the keys the client reads are olifant\'s', { skip: !process.env.OLIFANT_REPO && 'OLIFANT_REPO is not set' }, () => {
  const src = hsFiles(join(process.env.OLIFANT_REPO!, 'src')).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.deepEqual(KEYS.filter(k => !src.includes(`"${k}"`)), []);
});

test('compile check: the inline item reads as olifant sends it (Lsp.hs ghostItems)', () => {
  const data: SnippetData = { kind: 'action', path: '/p/a.py', generator: 'p/failure', sets: {}, line: 12 };
  const it: InlineItem = {
    insertText: { kind: 'snippet', value: 'class ${1:Name}:' }, range: { start: { line: 11, character: 0 }, end: { line: 11, character: 0 } },
    filterText: '', ghost: ['class ⟨Name⟩:'], data,
  };
  assert.ok(it.range.start.line === 11);
});

test('compile check: a suggestion, its pulled answer and the choices read as the server sends them', () => {
  const s: Suggestion = { uri: 'file:///a.py', version: 3, kind: 'recognition', label: 'Command', summary: 's', line: 2, lines: null, at: 2, planId: 7, generator: 'p/command', sets: {}, band: 'offer', or: null, reasons: ['r'], score: 0.9 };
  const r: SuggestResult = { ...s, plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } };
  const c: ChoicesResult = { name: 'Command', inputs: [{ name: 'command', optional: false, default: null, prompt: null, choices: ['a'] }] };
  assert.ok(r.planId === 7 && c.inputs.length === 1);
});

test('compile check: the TDD answers read as the server sends them (Lsp.hs :608-944, Tests.hs :199)', () => {
  const run: TestsRunResult = {
    file: '/p/a__test.py', passed: ['a__test.py::test_one'], scope: 'test', test: 'a__test.py::test_one',
    failed: [{ id: 'a__test.py::test_two', file: '/p/a__test.py', line: null, message: 'm', output: '' }], broken: null, seconds: 0.3,
  };
  const params: TestsRunParams = { textDocument: { uri: 'file:///p/a.py' }, scope: 'file' };
  const landed: ConjureLanded = {
    file: '/p/a.py', unit: 'f', edits: null, summary: 'green', green: true, tests: run, rounds: 1, rungs: ['local'], stopped: false,
  };
  const paused: ConjurePaused = { paused: { token: 't', lines: { first: 3, last: 9 }, offers: [], diagnosis: ['d'] } };
  const mutate: MutateResult = {
    file: '/p/a.py', unit: 'f', lines: { first: 3, last: 9 }, killed: 5, survived: 1, waived: 0,
    survivors: [{ line: 4, operator: 'swap', from: '+', to: '-', mutated: 'y = a - b', dim: false }], summary: '1 survivor · 5/6 killed',
  };
  const stub: StubResult = { file: '/p/a__test.py', line: 8, name: 'test_f', edits: { documentChanges: [] } };
  const waived: WaiveResult = { waived: true };
  assert.ok(run.failed[0].line === null && params.scope === 'file' && landed.edits === null && paused.paused.token === 't');
  assert.ok(mutate.lines.first === 3 && stub.line === 8 && waived.waived);
});

test('compile check: a resume, the reviews and a choose read as the server sends them (Lsp.hs :694-737, :1066-1090)', () => {
  const resume: ConjureResume = { token: 'conjure-1', choice: 'stop', land: true, arg: '2' };
  const list: ReviewsResult = { reviews: [
    { id: 'R1', kind: 'do', row: 2, step: '- [ ] a step', status: 'answered' },
    { id: 'reconcile', kind: 'reconcile', entries: [{ id: 'done|a.py|f|abc', kind: 'done', row: 4 }] },
  ] };
  const done: DoReview = {
    id: 'R1', kind: 'do', plan: 'plans/t.md', row: 2, title: { verb: 'do', step: 1, unit: 'T.label', badge: '◆ answered', model: 'sonnet', seconds: 42, cost: 0.06 },
    summary: 's', step: '- [ ] a step', said: [], tests: { ran: false, passed: 0, failed: 0, list: [] }, denials: [], denied: '',
    landing: { diff: '', files: [], edit: null }, offers: [{ choice: 'keep', key: 'a', label: 'keep', detail: 'd' }], details: [{ title: 'the step', text: 't' }],
  };
  const readings: ReconcileReview = {
    id: 'reconcile', kind: 'reconcile', title: { verb: 'reconcile', count: 1 }, summary: '1 reading to review', details: [],
    entries: [{ id: 'k', kind: 'unplaced', row: null, step: null, summary: 'Not in any step', offers: [{ choice: 'place', key: '2', label: 'under Step 3', detail: '', step: 3 }], landing: { edit: null, diff: '' } }],
  };
  const chosen: ChooseResult = { done: false, said: '1 passed · 0 failed', facts: [{ row: 2, text: '- [x] a step' }, { after: 2, lines: ['  ✓ t'] }], review: done };
  const choose: ReviewChooseParams = { textDocument: { uri: 'file:///p/plans/t.md' }, id: 'reconcile', choice: 'place', entry: 'k', step: 3 };
  const reopen: ErrandParams = { textDocument: { uri: 'file:///p/plans/t.md' }, line: 2, resume: 'R1', text: 'more' };
  assert.ok(resume.land && list.reviews.length === 2 && readings.entries[0].offers[0].step === 3 && chosen.review === done);
  assert.ok(choose.step === 3 && reopen.resume === 'R1');
});

// PAUSED_FIELDS: every field Paused names (protocol.ts); a fixture field outside it means the
// server sends something the models cannot read yet
const PAUSED_FIELDS = [
  'token', 'lines', 'offers', 'file', 'round', 'rung', 'summary', 'why', 'title', 'diagnosis', 'trigger', 'rounds', 'tests',
  'unit', 'landing', 'wired', 'expires', 'outcome', 'steps', 'failure', 'checker', 'snippet', 'proposal',
];

test('the four pause fixtures: paused answers whose fields Paused names', () => {
  for (const name of ['plain', 'wired', 'steps', 'check'] as const) {
    const p = fixture(name);
    assert.equal(typeof p.token, 'string', name);
    assert.ok(p.lines.first >= 1 && p.lines.last >= p.lines.first, name);
    assert.ok(Array.isArray(p.offers) && p.offers.length > 0, name);
    assert.ok(Array.isArray(p.diagnosis), `${name}: diagnosis is a list`);
    assert.deepEqual(Object.keys(p).filter(k => !PAUSED_FIELDS.includes(k)), [], name);
    assert.deepEqual(Object.keys(wrapped(name)), ['paused'], name);
  }
  // a copy each call: a test that edits one does not change the next
  const a = fixture('plain');
  a.token = 'changed';
  assert.notEqual(fixture('plain').token, 'changed');
});

// The keys the TDD commands read or send (spec §2); each a string literal in olifant's source.
// When one fails, find what the server sends now and fix protocol.ts and its readers; never drop
// the key from this list to make it pass.
const TDD_KEYS = [
  'passed', 'scope', 'test', 'failed', 'broken', 'seconds', 'output', 'exists',
  'edits', 'green', 'tests', 'rounds', 'rungs', 'stopped', 'paused', 'token', 'diagnosis',
  'lines', 'first', 'last', 'killed', 'survived', 'waived', 'survivors', 'operator', 'from', 'to', 'mutated', 'dim',
  'unit', 'reason', 'selection', 'resume', 'choice', 'position', 'summary',
  // the pause (ConjureNext.hs pausedJson)
  'why', 'trigger', 'offers', 'expires', 'outcome', 'steps', 'failure', 'checker', 'wired', 'landing', 'verdict',
  'attempt', 'decide', 'probabilities', 'confidence', 'flipped', 'note', 'proposal', 'refused', 'arg', 'land', 'hint',
  'problems', 'tool', 'param', 'port', 'failing', 'got', 'expected', 'assertion',
  // the reviews (Review.hs, ReviewReadings.hs, Lsp.hs choose)
  'reviews', 'entries', 'key', 'label', 'detail', 'said', 'denied', 'files', 'status', 'facts', 'done', 'reopen',
  'review', 'details', 'badge', 'cost', 'after',
];

test('the TDD keys are olifant\'s', { skip: !process.env.OLIFANT_REPO && 'OLIFANT_REPO is not set' }, () => {
  const src = hsFiles(join(process.env.OLIFANT_REPO!, 'src')).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.deepEqual(TDD_KEYS.filter(k => !src.includes(`"${k}"`)), []);
});

test('the standard requests the plan chords send themselves', () => {
  assert.equal(Lsp.codeAction.method, 'textDocument/codeAction');
  assert.equal(Lsp.codeActionResolve.method, 'codeAction/resolve');
  assert.equal(Olifant.plansFiles.method, 'olifant/plans/files');
});

test('compile check: the loop\'s answers are typed (no method added)', () => {
  const r: ReconcileResult = { id: 'R1', landed: 1, readings: '2' };
  const e: ErrandsResult = { errands: [{ id: 'E1', at: '2026-10-25T21:31:00Z', status: 'answered', choice: null, words: 'x' }] };
  assert.equal(r.readings, '2');
  assert.equal(e.errands[0].id, 'E1');
  assert.equal(Olifant.plansReconcile.method, 'olifant/plans/reconcile');
  assert.equal(Olifant.plansErrands.method, 'olifant/plans/errands');
});
