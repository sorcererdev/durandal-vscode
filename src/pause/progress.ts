// progress: the server's work-done progress a resume claims (spec §3.6; nvim lsp.claim
// lsp.lua :76-121). A claim names a title; the next begin with that title is its token's, and
// that token's report words go to the claim until its end. Unclaimed progress stays the
// library's (the status bar). First come: two resumes in the air own two begins in order.
export type ProgressValue =
  | { kind: 'begin'; title: string; message?: string }
  | { kind: 'report'; message?: string }
  | { kind: 'end'; message?: string };

export interface Claim { release(): void }

interface Waiting { title: string; words(message: string): void; released: boolean }

export class ProgressClaims {
  private waiting: Waiting[] = [];
  private readonly owned = new Map<string | number, Waiting>();

  claim(title: string, words: (message: string) => void): Claim {
    const w: Waiting = { title, words, released: false };
    this.waiting.push(w);
    return { release: () => { w.released = true; } };
  }

  hear(token: string | number, v: ProgressValue): void {
    if (v.kind === 'begin') {
      this.owned.delete(token);
      this.waiting = this.waiting.filter(w => !w.released);
      const i = this.waiting.findIndex(w => w.title === v.title);
      if (i < 0) return;
      const [w] = this.waiting.splice(i, 1);
      this.owned.set(token, w);
      if (typeof v.message === 'string') w.words(v.message);
      return;
    }
    const w = this.owned.get(token);
    if (!w) return;
    if (v.kind === 'end') {
      this.owned.delete(token);
      return;
    }
    if (!w.released && typeof v.message === 'string') w.words(v.message);
  }

  // clear: the server stopped
  clear(): void {
    this.waiting = [];
    this.owned.clear();
  }
}
