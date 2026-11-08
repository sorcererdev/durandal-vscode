import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Field, PreviewResult, Plan, FileActionsResult, ModelResult, GeneratorItem, InlineItem, SnippetData, Suggestion, SuggestResult, ChoicesResult } from '../../src/protocol';
import { CLIENT_COMMANDS, METHODS, Olifant, PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES, SERVER_COMMANDS } from '../../src/protocol';

const PINNED = [
  'olifant/choices', 'olifant/conjure', 'olifant/debugState', 'olifant/fileActions', 'olifant/generators',
  'olifant/holes', 'olifant/model', 'olifant/mutate', 'olifant/plan', 'olifant/plans/anchor', 'olifant/plans/ask',
  'olifant/plans/do', 'olifant/plans/errand', 'olifant/plans/errands', 'olifant/plans/files', 'olifant/plans/outcome',
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
  assert.deepEqual(SERVER_COMMANDS, { doctor: 'olifant.doctor' });
  assert.deepEqual(Object.values(CLIENT_COMMANDS).sort(),
    ['olifant.plans.errand', 'olifant.plans.excerpt', 'olifant.plans.review', 'olifant.showActions']);
  assert.equal(PLAN_TOKEN_TYPES.length, 13);
  assert.deepEqual([...PLAN_TOKEN_MODIFIERS], ['done', 'stale', 'notFound']);
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
  assert.deepEqual([...commands].sort(), [...Object.values(CLIENT_COMMANDS), SERVER_COMMANDS.doctor].sort());
  const plans = readFileSync(join(process.env.OLIFANT_REPO!, 'src/Olifant/Server/Plans.hs'), 'utf8');
  const types = /planTokenTypes =\s*\[([^\]]*)\]/.exec(plans)?.[1].match(/"[A-Za-z]+"/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(types, [...PLAN_TOKEN_TYPES]);
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
