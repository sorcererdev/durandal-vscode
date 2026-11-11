import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excerptNext, newStepNext, sources, toggleNext } from '../../src/plans/sourceActions';

const edit = { changes: {} };
const newStep = { title: 'New step below', kind: 'source', edit };
const showWhy = { title: 'Show why', kind: '', command: { title: 'Show why', command: 'olifant.showWhy', arguments: [] } };
const claimCode = { title: 'Show the code here', kind: '', command: { title: 'Show the code here', command: 'olifant.showCode', arguments: ['/p/a.py', 3] } };

test('sources keeps kind source only: the server does not filter on only (facts §3)', () => {
  assert.deepEqual(sources([newStep, showWhy, claimCode, { title: 'Re-fingerprint this claim', kind: 'quickfix', edit }, null, 'x']), [newStep]);
  assert.deepEqual(sources(null), []);
  assert.deepEqual(sources([{ title: 'x', kind: 'source.organizeImports' }]).length, 1);
});

test('new step: the action with its edit, else the warning', () => {
  assert.deepEqual(newStepNext([newStep]), { kind: 'apply', action: newStep });
  assert.deepEqual(newStepNext([{ title: 'New step below', kind: 'source' }]), { kind: 'say', level: 'warn', text: 'no new step here' });
});

test('excerpt: a disabled one folds at its open row or says its reason; an edit applies; else resolve', () => {
  const at = (x: object) => excerptNext(sources([{ title: 'Show the code here', kind: 'source', ...x }]));
  assert.deepEqual(at({ disabled: { reason: 'the step shows its code already' }, data: { kind: 'excerpt', open: 4 } }),
    { kind: 'fold', row: 4, reason: 'excerpt: the step shows its code already' });
  assert.deepEqual(at({ disabled: { reason: 'not on a step' }, data: { kind: 'excerpt', open: null } }), { kind: 'say', level: 'info', text: 'excerpt: not on a step' });
  assert.equal(at({ edit }).kind, 'apply');
  const r = at({ data: { kind: 'excerpt', path: '/p/plans/t.md', line: 2, version: 3 } });
  assert.equal(r.kind, 'resolve');
  assert.equal((r as { none: string }).none, 'excerpt: nothing to show here');
  assert.deepEqual(excerptNext([]), { kind: 'say', level: 'info', text: 'excerpt: nothing to show here' });
});

test('toggle: by data.kind; disabled says its reason; an edit applies; else resolve; none: not on a step', () => {
  const at = (x: object) => toggleNext(sources([{ title: 'Mark done', kind: 'source', data: { kind: 'toggle', line: 2 }, ...x }]));
  assert.deepEqual(at({ disabled: { reason: 'not on a step' } }), { kind: 'say', level: 'info', text: 'toggle: not on a step' });
  assert.equal(at({ edit }).kind, 'apply');
  assert.deepEqual((at({}) as { none: string }).none, 'toggle: nothing to change here');
  assert.deepEqual(toggleNext([newStep]), { kind: 'say', level: 'info', text: 'toggle: not on a step' });
});
