import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
