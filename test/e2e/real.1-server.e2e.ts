import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES, SERVER_COMMANDS } from '../../src/protocol';
import { file, open, running, until, ws } from './helpers';

describe('olifant lsp', () => {
  it('is olifant, with doctor and the plan legend, holding both projects', async () => {
    await open(file('py/src/bistro/main.py'));
    const a = await running();
    const init = a.server.client()!.initializeResult!;
    assert.equal(init.serverInfo?.name, 'olifant');
    assert.ok(init.capabilities.executeCommandProvider?.commands.includes(SERVER_COMMANDS.doctor));
    const legend = (init.capabilities.semanticTokensProvider as { legend: { tokenTypes: string[]; tokenModifiers: string[] } }).legend;
    assert.deepEqual(legend.tokenTypes, [...PLAN_TOKEN_TYPES]);
    assert.deepEqual(legend.tokenModifiers, [...PLAN_TOKEN_MODIFIERS]);
    await until(() => a.server.roots().length === 2, 'both projects');
    assert.deepEqual(a.server.roots().sort(), [join(ws(), 'py'), join(ws(), 'py2')].sort());
  });
});
