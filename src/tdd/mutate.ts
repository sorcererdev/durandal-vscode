import * as vscode from 'vscode';
import { At, MutateResult, Olifant } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { here, NO_FILE, TddFlights, withCancel } from './common';
import { settle } from './flights';
import type { Marks } from './marks';
import { killedBetween, nextMarked } from './memory';
import type { Survivors } from './survivors';

const hasLines = (a: MutateResult) => !!a.lines && typeof a.lines.first === 'number' && typeof a.lines.last === 'number';

// Mutate: the unit at the cursor mutated against its tests (durandal.nvim mutate.lua, spec §5);
// each survivor a warning on its line, the picker over them. After a green run the marked units
// are mutated again, silently, and what no longer survives is said.
export class Mutate {
  constructor(private readonly d: { server: Server; say: Say; marks: Marks; flights: TddFlights; survivors: Survivors }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('durandal.mutate', () => this.run()));
  }

  async run(): Promise<void> {
    const h = here();
    if (!h) {
      void this.d.say('error', NO_FILE);
      return;
    }
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    const params: At = { textDocument: { uri: h.uri }, position: h.position };
    const f = this.d.flights.start('mutate', true);
    const o = await withCancel('Durandal: mutating…', f,
      () => settle(f, this.d.server.request(Olifant.mutate, params, f.token), Olifant.mutate.method));
    if (o.kind === 'cancelled') {
      if (o.why === 'user' || o.why === 'server') void this.d.say('info', 'mutate cancelled');
      return;
    }
    if (o.kind === 'error') {
      void this.d.say('error', o.message);
      return;
    }
    const a = o.value;
    if (!hasLines(a)) {
      void this.d.say('error', `${Olifant.mutate.method} answered without the unit's lines`);
      return;
    }
    const uri = h.editor.document.uri;
    this.d.marks.setMutate(uri, a);
    void this.d.say('info', String(a.summary));
    if ((a.survivors ?? []).length > 0 && vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
      this.d.survivors.open(uri, a);
    } else {
      // an open picker over this unit follows the answer; none left closes it
      this.d.survivors.refresh(uri, a);
    }
  }

  // recheck: after a green run of the tests of uri, the marked units of its module (uri itself,
  // or its other side by olifant/tests/file) mutated again (mutate.lua :129-142)
  async recheck(uri: string): Promise<void> {
    if (!this.d.server.client()) return;
    let target = uri;
    if (this.d.marks.memory.survivors(uri).length === 0) {
      try {
        const r = await this.d.server.request(Olifant.testsFile, { textDocument: { uri } });
        if (!r || typeof r.file !== 'string') return;
        target = vscode.Uri.file(r.file).toString();
      } catch {
        return;
      }
      if (this.d.marks.memory.survivors(target).length === 0) return;
    }
    await this.again(vscode.Uri.parse(target));
  }

  // again: one unit after another, no progress and no picker (mutate.lua :84-124); a unit whose
  // request fails keeps its marks
  private async again(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const killed: string[] = [];
    const done: { first: number; last: number }[] = [];
    for (;;) {
      const line = nextMarked(this.d.marks.memory.survivors(key), done);
      if (line === undefined) break;
      // a newer green run's loop supersedes this one; superseded returns silently
      const f = this.d.flights.start('remutate', true);
      const o = await settle(f, this.d.server.request(Olifant.mutate,
        { textDocument: { uri: key }, position: { line: line - 1, character: 0 } }, f.token), Olifant.mutate.method);
      if (o.kind === 'cancelled') return;
      // the line is done whatever came: an answer for another unit cannot loop
      done.push({ first: line, last: line });
      if (o.kind === 'error' || !hasLines(o.value)) continue;
      const a = o.value;
      const before = this.d.marks.memory.within(key, a.lines);
      this.d.marks.setMutate(uri, a);
      killed.push(...killedBetween(before, this.d.marks.memory.within(key, a.lines)));
      this.d.survivors.refresh(uri, a);
      done.push(a.lines);
    }
    if (killed.length > 0) void this.d.say('info', `killed: ${killed.join('; ')}`);
  }
}
