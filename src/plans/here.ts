import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { errorMessage } from '../errors';
import { NOT_RUNNING, Say, Server } from '../server';
import type { PlanDocs } from './planDocs';
import { NO_PLAN } from './words';

// PlanHere: the active editor when it shows a plan, and its cursor's row
export interface PlanHere { editor: vscode.TextEditor; uri: string; row: number }

export async function planHere(docs: PlanDocs): Promise<PlanHere | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !(await docs.is(editor.document))) return undefined;
  return { editor, uri: editor.document.uri.toString(), row: editor.selection.active.line };
}

export interface HereDeps { planDocs: PlanDocs; server: Server; say: Say }

// RunningHere: a PlanHere and the client running when the chord was pressed
export interface RunningHere extends PlanHere { lc: LanguageClient }

// runningHere: planHere for a chord that asks the server; undefined, said as an error, when the
// active editor is not a plan or the server is not running
export async function runningHere(d: HereDeps): Promise<RunningHere | undefined> {
  const h = await planHere(d.planDocs);
  if (!h) {
    void d.say('error', NO_PLAN);
    return undefined;
  }
  const lc = d.server.client();
  if (!lc) {
    void d.say('error', NOT_RUNNING);
    return undefined;
  }
  return { ...h, lc };
}

// asked: ASK's answer for the chord at H, or undefined: its failure said as an error, or nothing
// said when the server H asked stopped meanwhile (a stop, a restart, a crash). After a stop a
// late answer lands nothing and a late rejection says nothing (spec §5.7).
export async function asked<R>(d: HereDeps, h: RunningHere, ask: () => Promise<R>): Promise<{ r: R } | undefined> {
  try {
    const r = await ask();
    return d.server.client() === h.lc ? { r } : undefined;
  } catch (err) {
    if (d.server.client() === h.lc) void d.say('error', errorMessage(err));
    return undefined;
  }
}
