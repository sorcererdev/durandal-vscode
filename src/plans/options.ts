import * as vscode from 'vscode';
import { PlansOptions, plansOptionsFrom } from './settings';

// readPlansOptions: durandal.plans.* now (spec §3.1).
export function readPlansOptions(): PlansOptions {
  const c = vscode.workspace.getConfiguration('durandal.plans');
  return plansOptionsFrom((k, fallback) => c.get(k, fallback));
}

// onPlansOptions: LISTENER hears the new options after any durandal.plans.* change.
export function onPlansOptions(context: vscode.ExtensionContext, listener: (o: PlansOptions) => void): void {
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('durandal.plans')) listener(readPlansOptions());
  }));
}
