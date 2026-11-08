import * as vscode from 'vscode';

// toggleSetting flips a boolean durandal.* setting (default true) where the user set it:
// the workspace if it is set there, else the user's settings.
export async function toggleSetting(key: string): Promise<void> {
  const c = vscode.workspace.getConfiguration('durandal');
  const target = c.inspect<boolean>(key)?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  await c.update(key, !c.get<boolean>(key, true), target);
}
