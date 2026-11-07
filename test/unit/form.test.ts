import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseNew, firstMissing, FormStep, formRows, isChoice, note, options, rowKey, setValue, short, stepsPayload, valueOf } from '../../src/generate/form';
import { fld, step } from '../fixtures';

test('short is the last segment of a generator id', () => {
  assert.equal(short('python-htmx/repository'), 'repository');
  assert.equal(short('plain'), 'plain');
});

test('note: why (an error), else set X first, else where the value came from', () => {
  assert.deepEqual(note(fld({ name: 'a', why: 'not a name', valid: false })), { text: 'not a name', error: true });
  assert.deepEqual(note(fld({ name: 'a', needs: ['app', 'service'] })), { text: 'set app, service first', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'only' })), { text: 'only one', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'path' })), { text: 'from this file', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'here' })), { text: 'from the cursor', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'suggested' })), { text: 'suggested', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'you' })), { text: undefined, error: false });
  assert.deepEqual(note(fld({ name: 'a' })), { text: undefined, error: false });
});

test('formRows: a heading per step (a + New step says what it is for), then its fields', () => {
  const target = step('p/add-dependency', [fld({ name: 'port', valid: false }), fld({ name: 'kind', value: 'commands', source: 'only' })]);
  const made: FormStep = { ...step('p/repository', [fld({ name: 'entity', value: 'table', source: 'you' })], { entity: 'table' }), makes: { target, input: 'port' } };
  assert.deepEqual(formRows([made, target]), [
    { kind: 'heading', label: '+ New repository (for port)' },
    { kind: 'field', key: '0:entity', step: 0, name: 'entity', description: 'table', detail: undefined, error: false },
    { kind: 'heading', label: 'add-dependency' },
    { kind: 'field', key: '1:port', step: 1, name: 'port', description: '⟨port⟩', detail: undefined, error: false },
    { kind: 'field', key: '1:kind', step: 1, name: 'kind', description: 'commands', detail: 'only one', error: false },
  ]);
  assert.equal(rowKey(1, 'port'), '1:port');
});

test('valueOf: what you set, else the server\'s value', () => {
  const st = step('g', [fld({ name: 'a', value: 'server' })], { a: 'mine' });
  assert.equal(valueOf(st, st.fields[0]), 'mine');
  assert.equal(valueOf(step('g', [fld({ name: 'a', value: 'server' })]), fld({ name: 'a', value: 'server' })), 'server');
});

test('options: the choices, then + New for each generator that makes one', () => {
  const f = fld({ name: 'port', choices: ['orders'], new: ['python-htmx/repository'] });
  assert.ok(isChoice(f));
  assert.ok(isChoice(fld({ name: 'x', new: ['g'] })));
  assert.ok(!isChoice(fld({ name: 'x' })));
  assert.deepEqual(options(f), [{ label: 'orders', value: 'orders' }, { label: '+ New repository…', generator: 'python-htmx/repository' }]);
});

test('firstMissing: the first field of any step with no value or not valid', () => {
  const a = step('a', [fld({ name: 'x', value: 'v' }), fld({ name: 'y' })]);
  const b = step('b', [fld({ name: 'z', value: 'bad', valid: false })]);
  assert.deepEqual(firstMissing([a, b]), { step: 0, name: 'y' });
  a.sets.y = 'set';
  assert.deepEqual(firstMissing([a, b]), { step: 1, name: 'z' });
  assert.equal(firstMissing([a]), undefined);
});

test('stepsPayload: your values only, or merged with what the server inferred; makes as a 0-based index', () => {
  const target = step('p/add', [fld({ name: 'kind', value: 'commands', source: 'only' }), fld({ name: 'port' }), fld({ name: 'note', value: 'x', source: 'you' })], { note: 'x' });
  const made: FormStep = { ...step('p/repo', [fld({ name: 'entity', value: 'table', source: 'you' })], { entity: 'table' }), makes: { target, input: 'port' } };
  assert.deepEqual(stepsPayload([made, target], false), [
    { generator: 'p/repo', sets: { entity: 'table' }, makes: { step: 1, input: 'port' } },
    { generator: 'p/add', sets: { note: 'x' } },
  ]);
  assert.deepEqual(stepsPayload([made, target], true)[1], { generator: 'p/add', sets: { kind: 'commands', note: 'x' } });
});

test('setValue sets or clears a value; a plain value for an input a + New step makes drops that step and its maker', () => {
  const target = step('p/add', [fld({ name: 'port', new: ['p/repo'] })]);
  const middle: FormStep = { ...step('p/repo', [fld({ name: 'entity', new: ['p/entity'] })]), makes: { target, input: 'port' } };
  const first: FormStep = { ...step('p/entity', []), makes: { target: middle, input: 'entity' } };
  let steps = [first, middle, target];
  steps = setValue(steps, 2, 'port', 'orders');
  assert.deepEqual(steps, [target]);
  assert.deepEqual(target.sets, { port: 'orders' });
  steps = setValue(steps, 0, 'port', '');
  assert.deepEqual(target.sets, {});
  steps = setValue(steps, 0, 'other', 'x');
  assert.deepEqual(target.sets, { other: 'x' });
  setValue(steps, 0, 'other', undefined);
  assert.deepEqual(target.sets, {});
});

test('chooseNew: a step before the target carrying its other values; a fourth step is refused; again for the same input replaces', () => {
  const target = step('p/add', [fld({ name: 'kind', value: 'commands', source: 'only' }), fld({ name: 'port' }), fld({ name: 'command' })], { command: 'create', port: 'old' });
  const one = chooseNew([target], 0, 'port', 'p/repo')!;
  assert.equal(one.length, 2);
  assert.equal(one[1], target);
  assert.deepEqual(one[0].sets, { kind: 'commands', command: 'create' });
  assert.deepEqual(one[0].makes, { target, input: 'port' });
  assert.ok(!('port' in target.sets), 'the made input is the new step\'s now');
  one[0].fields = [fld({ name: 'entity', new: ['p/entity'] })];
  const two = chooseNew(one, 0, 'entity', 'p/entity')!;
  assert.equal(two.length, 3);
  assert.equal(two[0].makes!.target, one[0]);
  two[0].fields = [fld({ name: 'x', new: ['p/more'] })];
  assert.equal(chooseNew(two, 0, 'x', 'p/more'), undefined, 'two levels at most');
  const again = chooseNew(two, 2, 'port', 'p/other')!;
  assert.deepEqual(again.map(s => s.generator), ['p/other', 'p/add'], 'the old + New steps for port go');
});
