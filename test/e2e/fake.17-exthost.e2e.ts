import * as assert from 'node:assert/strict';
import { api, exthostLog } from './helpers';

// The extension host's log after every other fake suite (mocha runs fake.17 last, index.ts): no
// listener of this extension threw. VS Code logs such a throw and goes on, so no other test sees
// it (#23).
const FAILED = /Extension 'sorcererdev\.durandal' FAILED to handle event/;

describe('the extension host log (fake server)', () => {
  it('holds no throw from a listener of this extension', async () => {
    const a = await api();
    const text = exthostLog(a);
    // an empty read would pass for the wrong reason: the log is there and has the run in it
    assert.ok(text.length > 0, `no exthost.log beside ${a.logUri.fsPath}`);
    assert.deepEqual(text.split('\n').filter(l => FAILED.test(l)), []);
  });
});
