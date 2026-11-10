import * as vscode from 'vscode';
import { findRoot } from '../root';
import { isPlanPath } from './isPlan';

// PlanDocs answers "is this document a plan" once per document, language and plans folder: the
// root lookup reads the disk, and the taps ask on every answer the server sends. A file:
// document only (the server serves plan features to nothing else).
export class PlanDocs {
  private readonly cache = new Map<string, Promise<boolean>>();

  constructor(private readonly dir: () => string) {}

  is(doc: vscode.TextDocument): Promise<boolean> {
    if (doc.uri.scheme !== 'file') return Promise.resolve(false);
    const dir = this.dir();
    const key = `${doc.uri.toString()}\n${doc.languageId}\n${dir}`;
    let p = this.cache.get(key);
    if (!p) {
      const path = doc.uri.fsPath;
      const languageId = doc.languageId;
      p = findRoot(path).then(root => isPlanPath(path, root, languageId, dir));
      this.cache.set(key, p);
    }
    return p;
  }

  // forget drops a document's answers (it closed: a reopened one is asked again).
  forget(uri: string): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${uri}\n`)) this.cache.delete(k);
  }

  clear(): void { this.cache.clear(); }
}
