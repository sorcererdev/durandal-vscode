import * as vscode from 'vscode';
import { SERVER_NAMED, notYet } from './commandTable';
import type { Say } from './server';

// registerServerNamed: the commands the server names that no milestone builds yet say so (none
// today; SERVER_NAMED's type makes a new client command name a milestone). The command returns
// at once: the notice's promise settles only when it is dismissed.
export function registerServerNamed(context: vscode.ExtensionContext, say: Say): void {
  for (const [id, { title, milestone }] of Object.entries(SERVER_NAMED)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, () => { void say('info', notYet(title, milestone)); }));
  }
}
