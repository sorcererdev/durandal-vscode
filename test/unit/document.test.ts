import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseDocument, configPath } from '../../src/document';

test('chooseDocument: the active file in a known project; else the one project\'s config; several: ask; none: say so', () => {
  assert.deepEqual(chooseDocument('/w/one', ['/w/one', '/w/two']), { kind: 'here', root: '/w/one' });
  assert.deepEqual(chooseDocument(undefined, ['/w/one']), { kind: 'config', root: '/w/one' });
  assert.deepEqual(chooseDocument('/elsewhere', ['/w/one']), { kind: 'config', root: '/w/one' });
  assert.deepEqual(chooseDocument(undefined, ['/w/two', '/w/one']), { kind: 'choose', roots: ['/w/one', '/w/two'] });
  assert.deepEqual(chooseDocument(undefined, []), { kind: 'none' });
  assert.equal(configPath('/w/one'), '/w/one/.olifant/config.toml');
});
