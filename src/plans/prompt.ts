import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { Ui } from '../uiTypes';
import { tabsUnder, VirtualDocs } from '../virtualDocs';
import { Placed, proposalText, Verb } from './blocks';
import { promptWord } from './words';

export const ACCEPT_ALL = 'Accept all';
export const REJECT_ALL = 'Reject all';

let seq = 0;

// askBlocks: the blocks of a validate, a do with no review, or an ask held for review, until
// ghost blocks come (milestone 7; M6 spec §4.3): their text beside the plan (a durandal-doc, one
// per prompt), then Accept all / Reject all. The document goes with the answer. undefined: the
// notice was dismissed (nvim's ghost left unanswered: nothing is written or sent).
export async function askBlocks(
  d: { docs: VirtualDocs; ui: Ui }, uri: string, verb: Verb, placed: readonly Placed[], lines: number,
): Promise<'accept' | 'reject' | undefined> {
  const path = `plans/${basename(vscode.Uri.parse(uri).path, '.md')}/proposal-${++seq}.md`;
  const doc = d.docs.set(path, proposalText(placed));
  // not awaited before the prompt; awaited before the close, so a quick answer leaves no tab
  const shown = vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: true })
    .then(() => undefined, () => undefined);
  try {
    const pick = await d.ui.ask('info', promptWord(verb, lines, placed.length), [ACCEPT_ALL, REJECT_ALL]);
    return pick === ACCEPT_ALL ? 'accept' : pick === REJECT_ALL ? 'reject' : undefined;
  } finally {
    await shown;
    const tabs = tabsUnder(`/${path}`);
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs).then(undefined, () => false);
    d.docs.forget(path);
  }
}
