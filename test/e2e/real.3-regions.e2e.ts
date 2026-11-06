import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { Olifant } from '../../src/protocol';
import { disk, file, open, running, until, ws } from './helpers';

const RESOURCES = 'py/src/bistro/web/resources.py';

describe('regions on save (olifant lsp)', () => {
  after(() => {
    const cwd = join(ws(), 'py');
    execFileSync('git', ['checkout', '--', '.'], { cwd });
    execFileSync('git', ['clean', '-fdq'], { cwd });
  });

  it('saving the regions file puts its region back in the same write', async () => {
    const ed = await open(file(RESOURCES));
    const a = await running();
    // warm the project: a cold first will-save can run past VS Code's ~1.5 s budget
    await a.server.request(Olifant.fileActions, { textDocument: { uri: ed.document.uri.toString() } });
    const original = disk(RESOURCES);
    const item = '    "bookings",\n';
    const i = ed.document.getText().indexOf(item);
    assert.ok(i >= 0, 'the region lists bookings');
    await ed.edit(b => b.delete(new vscode.Range(ed.document.positionAt(i), ed.document.positionAt(i + item.length))));
    assert.ok(await ed.document.save());
    assert.equal(disk(RESOURCES), original);
    assert.ok(!ed.document.isDirty);
  });

  it('a new web resource lands in the regions file, which is saved and named', async () => {
    const a = await running();
    const before = a.shown.length;
    const dir = join(ws(), 'py/src/bistro/web/menu');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '__init__.py'), '');
    writeFileSync(join(dir, 'routes.py'), '"""The menu."""\n');
    const ed = await open(file('py/src/bistro/web/menu/routes.py'));
    await ed.edit(b => b.insert(new vscode.Position(1, 0), '\n'));
    assert.ok(await ed.document.save());
    await until(() => disk(RESOURCES).includes('    "menu",\n'), 'menu in resources.py on disk', 90_000);
    await until(() => a.shown.slice(before).some(s => s.level === 'info' && s.text.endsWith('resources.py')), 'the notice naming resources.py');
  });
});
