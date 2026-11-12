import * as vscode from 'vscode';
import { CLIENT_COMMANDS } from '../protocol';
import type { PlanErrands } from './errands';
import { toggleFoldAt } from './folds';
import type { PlanLayer } from './layer';

const keyOf = (uri: string) => vscode.Uri.parse(uri).toString();

// registerLenses: the plan lenses' two client commands (M6 spec §5.4). The library shows the
// lenses and honours workspace/codeLens/refresh; olifant.plans.review is pause/review.ts's.
export function registerLenses(
  context: vscode.ExtensionContext,
  d: { errands: Pick<PlanErrands, 'list'>; layer: Pick<PlanLayer, 'collapsedAt' | 'foldStartsAt'> },
): void {
  context.subscriptions.push(
    // [uri, open, close, live, anchor]: the excerpt's fold opens or closes
    vscode.commands.registerCommand(CLIENT_COMMANDS.planExcerpt, (uri: unknown, open: unknown) =>
      (typeof uri === 'string' && typeof open === 'number' ? excerpt(d.layer, uri, open) : undefined)),
    // [uri, row]: the step's past dos
    vscode.commands.registerCommand(CLIENT_COMMANDS.planErrand, (uri: unknown, row: unknown) =>
      (typeof uri === 'string' && typeof row === 'number' ? d.errands.list(uri, row) : undefined)),
  );
}

// excerpt: toggle the fold at the excerpt's opening fence OPEN (0-based; nvim's open + 1 is
// 1-based) in an editor on URI, made active first (the fold commands act on the focused one);
// with none visible, one opens beside
async function excerpt(layer: Pick<PlanLayer, 'collapsedAt' | 'foldStartsAt'>, uri: string, open: number): Promise<void> {
  const key = keyOf(uri);
  const shown = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === key);
  const ed = shown
    ? await vscode.window.showTextDocument(shown.document, shown.viewColumn)
    : await vscode.window.showTextDocument(vscode.Uri.parse(key), { viewColumn: vscode.ViewColumn.Beside });
  if (layer.foldStartsAt(ed, open)) await toggleFoldAt(open, !!layer.collapsedAt(ed, open));
}
