import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spanOf } from '../../src/suggest/span';

test('spanOf: the whole lines a snippet inserted at a line start covers', () => {
  assert.deepEqual(spanOf(4, 'class ${1:Name}:'), { start: 4, end: 4 });
  assert.deepEqual(spanOf(4, 'class ${1:Name}:\n    ${2:reason}: str$0'), { start: 4, end: 5 });
  assert.deepEqual(spanOf(0, 'a\nb\nc\n'), { start: 0, end: 3 });
});
