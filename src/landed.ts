import * as vscode from 'vscode';

// The landed bus (M6 spec §5.1): something landed that the open plans should reconcile with. The
// only cross-module event in the port. Fired by the TDD runs, stubs and conjures, a review answered
// done, and the plan verbs (do, accept) and steps (stub, test); plans/reconcile.ts listens.
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
