import * as vscode from 'vscode';

// The landed bus (M6 spec §5.1): something landed that the open plans should reconcile with. The
// only cross-module event in the port. M6b fires do and accept (plans/verbs.ts) and a plan step's
// stub and test (plans/steps.ts); M6c adds the TDD runs, stubs, conjures and reviews, and the
// reconcile, its first listener.
export type LandedKind = 'test' | 'stub' | 'conjure' | 'do' | 'accept' | 'review';

export class Landed implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<{ kind: LandedKind }>();
  readonly event = this.emitter.event;
  // fired: every kind fired, in order (the e2e tests read it)
  readonly fired: LandedKind[] = [];

  fire(kind: LandedKind): void {
    this.fired.push(kind);
    this.emitter.fire({ kind });
  }

  dispose(): void { this.emitter.dispose(); }
}
