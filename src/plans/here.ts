import * as vscode from 'vscode';
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

// runningHere: planHere for a chord that asks the server; undefined, said as an error, when the
// active editor is not a plan or the server is not running
export async function runningHere(d: HereDeps): Promise<PlanHere | undefined> {
  const h = await planHere(d.planDocs);
  if (!h) {
    void d.say('error', NO_PLAN);
    return undefined;
  }
  if (!d.server.client()) {
    void d.say('error', NOT_RUNNING);
    return undefined;
  }
  return h;
}
