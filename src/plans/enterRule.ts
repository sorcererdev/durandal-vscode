import * as vscode from 'vscode';

// Enter continues a step (spec §3.5; nvim comments "b:- [ ],b:-"): after an open step a new
// open step, after a done step a plain item. A language configuration is per language, not
// per file, so it is installed while the active editor shows a plan and disposed when it stops.
// VS Code merges an extension's configuration field by field over the contributed one
// (checked in the 1.145.2 bundle): markdown keeps its brackets, pairs, folding and word pattern.
export const PLAN_ENTER_RULES: vscode.OnEnterRule[] = [
  { beforeText: /^\s*- \[ \] /, action: { indentAction: vscode.IndentAction.None, appendText: '- [ ] ' } },
  { beforeText: /^\s*- \[[xX]\] /, action: { indentAction: vscode.IndentAction.None, appendText: '- ' } },
];

export class EnterRule implements vscode.Disposable {
  private reg: vscode.Disposable | undefined;

  set(on: boolean): void {
    if (on && !this.reg) this.reg = vscode.languages.setLanguageConfiguration('markdown', { onEnterRules: PLAN_ENTER_RULES });
    if (!on && this.reg) {
      this.reg.dispose();
      this.reg = undefined;
    }
  }

  dispose(): void { this.set(false); }
}
