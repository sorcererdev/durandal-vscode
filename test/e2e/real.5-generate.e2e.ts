import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { FormRow } from '../../src/generate/form';
import { Olifant } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { cleanTold, file, open, running, until, ws } from './helpers';

const BOOKING = 'py/src/bistro/booking/commands/create_booking.py';
const exists = (rel: string) => existsSync(join(ws(), rel));
type FieldRow = Extract<FormRow, { kind: 'field' }>;

const fieldRow = (ui: FakeUi, name: string, step?: number) => ui.openForm?.model.rows.find(
  (r): r is FieldRow => r.kind === 'field' && r.name === name && (step === undefined || r.step === step));

// fill answers the field name with value: from its choices (or `+ New value…`) when it lists
// some, else typed.
async function fill(ui: FakeUi, name: string, value: string, step?: number): Promise<void> {
  const row = await until(() => fieldRow(ui, name, step), `the ${name} field`, 60_000);
  const picks = ui.picks.length;
  const texts = ui.texts.length;
  ui.onPick = o => o.items.find(i => i.label === value || i.label === `+ New ${value}…`)?.value;
  ui.openForm!.answer({ kind: 'field', step: row.step, name });
  await until(() => ui.picks.length > picks || ui.texts.length > texts, `the ${name} editor`);
  if (ui.texts.length > texts) {
    const t = ui.texts[ui.texts.length - 1];
    t.onChange!(value);
    t.finish(value);
  }
  await until(() => ui.openForm, 'the form back');
}

const ready = (ui: FakeUi) => until(() => ui.openForm && !ui.openForm.model.updating && ui.openForm.model.ready,
  'the form ready', 90_000);

describe('generate against olifant lsp (python-htmx)', () => {
  afterEach(async () => {
    const a = await running();
    a.setUi(undefined);
    const cwd = join(ws(), 'py');
    execFileSync('git', ['checkout', '--', '.'], { cwd });
    // the next test's previews must not see this one's files (olifant lists them on a save)
    await cleanTold(a, cwd);
  });

  it('comm → close_table → Ctrl+Enter: the command and its test written', async () => {
    await open(file(BOOKING));
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    ui.onPick = o => {
      if (o.title !== 'Generate') return undefined;
      const top = o.query!('comm').find(i => !i.separator)!;
      assert.equal((top.value as { id: string }).id, 'python-htmx/command');
      return top.value;
    };
    const run = vscode.commands.executeCommand('durandal.generate');
    await fill(ui, 'command', 'close_table');
    await ready(ui);
    await vscode.commands.executeCommand('durandal.generate.apply');
    await run;
    await until(() => exists('py/src/bistro/booking/commands/close_table__test.py'), 'the test written', 60_000);
    assert.ok(exists('py/src/bistro/booking/commands/close_table.py'));
  });

  it('Add a port → + New repository → table: both written, the command takes the port', async () => {
    await open(file(BOOKING));
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    ui.onPick = o => (o.title === 'Generate' ? o.items.find(i => (i.value as { id?: string } | undefined)?.id === 'python-htmx/add-dependency')?.value : undefined);
    const run = vscode.commands.executeCommand('durandal.generate');
    await fill(ui, 'kind', 'commands');
    await fill(ui, 'command', 'create_booking');
    await fill(ui, 'port', 'repository');
    await until(() => ui.openForm?.model.rows.some(r => r.kind === 'heading' && r.label.startsWith('+ New repository')), 'the + New step', 60_000);
    await fill(ui, 'entity', 'table', 0);
    await ready(ui);
    await vscode.commands.executeCommand('durandal.generate.apply');
    await run;
    await until(() => exists('py/src/bistro/booking/ports/table_repository/table_repository.py'), 'the repository written', 60_000);
    assert.ok(readFileSync(join(ws(), BOOKING), 'utf8').includes('table_repository: TableRepository'));
  });

  it('olifant/fileActions lists the project\'s actions for a project file', async () => {
    const ed = await open(file(BOOKING));
    const a = await running();
    const r = await a.server.request(Olifant.fileActions, { textDocument: { uri: ed.document.uri.toString() } });
    assert.ok(r.actions.length > 0 && r.actions.every(x => x.generator.startsWith('python-htmx/')), JSON.stringify(r.actions.map(x => x.generator)));
  });
});
