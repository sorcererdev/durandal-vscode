import * as vscode from 'vscode';
import type { PlanDocs } from './planDocs';

// PlanHere: the active editor when it shows a plan, and its cursor's row
export interface PlanHere { editor: vscode.TextEditor; uri: string; row: number }

export async function planHere(docs: PlanDocs): Promise<PlanHere | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !(await docs.is(editor.document))) return undefined;
  return { editor, uri: editor.document.uri.toString(), row: editor.selection.active.line };
}
