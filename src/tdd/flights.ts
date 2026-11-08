import { errorMessage } from '../errors';

// Flights are the TDD requests in the air (spec §3, §6). A newer run of a kind supersedes the
// older one, a Cancel click cancels its own, and a server stop cancels them all. The reason
// decides what is said: superseded and stopped say nothing.
export type Why = 'user' | 'superseded' | 'stopped';

// Source: a cancellation source (vscode.CancellationTokenSource in the extension).
export interface Source<T> { token: T; cancel(): void; dispose(): void }

export class Flight<T> {
  why: Why | undefined;

  constructor(private readonly src: Source<T>, private readonly gone: (f: Flight<T>) => void) {}

  get token(): T { return this.src.token; }

  // cancel: the first reason stays
  cancel(why: Why): void {
    if (this.why) return;
    this.why = why;
    this.src.cancel();
  }

  // done: the answer (or the error) is in; the flight leaves the air
  done(): void {
    this.gone(this);
    this.src.dispose();
  }
}

export class Flights<T> {
  private readonly live = new Map<string, Set<Flight<T>>>();

  constructor(private readonly make: () => Source<T>) {}

  // start puts a flight of kind in the air; supersede cancels that kind's others first
  start(kind: string, supersede = false): Flight<T> {
    const set = this.live.get(kind) ?? new Set<Flight<T>>();
    this.live.set(kind, set);
    if (supersede) for (const f of [...set]) f.cancel('superseded');
    const f: Flight<T> = new Flight(this.make(), x => set.delete(x));
    set.add(f);
    return f;
  }

  cancelAll(why: Why): void {
    for (const set of this.live.values()) for (const f of [...set]) f.cancel(why);
  }

  count(kind: string): number {
    return this.live.get(kind)?.size ?? 0;
  }
}

// CANCELLED: LSP's RequestCancelled; olifant answers it when it stops a request.
export const CANCELLED = -32800;

export type Outcome<R> =
  | { kind: 'answer'; value: R }
  | { kind: 'cancelled'; why: Why | 'server' }
  | { kind: 'error'; message: string };

// settle waits for a flight's request: its answer, or why there is none. A flight we cancelled
// drops whatever comes: a late answer, the server's -32800, the connection's end.
export async function settle<T, R>(f: Flight<T>, p: Promise<R | null | undefined>, method: string): Promise<Outcome<R>> {
  try {
    const value = await p;
    if (f.why) return { kind: 'cancelled', why: f.why };
    if (value === null || value === undefined) return { kind: 'error', message: `${method} answered nothing` };
    return { kind: 'answer', value };
  } catch (err) {
    if (f.why) return { kind: 'cancelled', why: f.why };
    if ((err as { code?: unknown } | null)?.code === CANCELLED) return { kind: 'cancelled', why: 'server' };
    return { kind: 'error', message: errorMessage(err) };
  } finally {
    f.done();
  }
}
