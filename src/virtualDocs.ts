import * as vscode from 'vscode';

export const DOC_SCHEME = 'durandal-doc';

// VirtualDocs are the read-only documents the extension writes (alder-vscode's): the live
// preview, the review's two sides, the migration report. A path's extension picks the
// language. Setting a path's text again updates its open editor.
export class VirtualDocs implements vscode.TextDocumentContentProvider {
  private texts = new Map<string, string>();
  private changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DOC_SCHEME, this), this.changed);
  }

  uri(path: string): vscode.Uri {
    return vscode.Uri.from({ scheme: DOC_SCHEME, path: '/' + path });
  }

  set(path: string, text: string): vscode.Uri {
    const uri = this.uri(path);
    this.texts.set(uri.path, text);
    this.changed.fire(uri);
    return uri;
  }

  // forget drops every text under prefix (a document still open then reads as empty).
  forget(prefix: string): void {
    const p = this.uri(prefix).path;
    for (const k of [...this.texts.keys()]) if (k.startsWith(p)) this.texts.delete(k);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.texts.get(uri.path) ?? '';
  }
}

// tabsUnder are the open tabs showing durandal-doc documents whose path starts with prefix
// (e.g. '/plan/3/'): a document's own tab, or a diff by either side.
export function tabsUnder(prefix: string): vscode.Tab[] {
  const ours = (u: vscode.Uri) => u.scheme === DOC_SCHEME && u.path.startsWith(prefix);
  return vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(t =>
    (t.input instanceof vscode.TabInputText && ours(t.input.uri))
    || (t.input instanceof vscode.TabInputTextDiff && (ours(t.input.original) || ours(t.input.modified))));
}
