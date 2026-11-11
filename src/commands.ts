import * as vscode from 'vscode';
import { NOT_YET, SERVER_NAMED, notYet } from './commandTable';
import type { Say } from './server';

// registerNotYet: the commands later milestones build, and the server-named ones, say so.
// The command returns at once: the notice's promise settles only when it is dismissed.
export function registerNotYet(context: vscode.ExtensionContext, say: Say): void {
  for (const [id, { title, milestone }] of Object.entries({ ...NOT_YET, ...SERVER_NAMED })) {
    context.subscriptions.push(vscode.commands.registerCommand(id, () => { void say('info', notYet(title, milestone)); }));
  }
}
