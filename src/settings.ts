// The settings the server reads at initialize. A change needs Durandal: Restart Server.
export interface Settings { debounceMs: number; model: string; fills: string }

export function settingsFrom(get: (key: string, fallback: unknown) => unknown): Settings {
  const d = get('debounceMs', 300);
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    debounceMs: typeof d === 'number' && Number.isFinite(d) && d >= 0 ? Math.round(d) : 300,
    model: str(get('model', '')),
    fills: str(get('fills', '')),
  };
}

// chordLabel is how a chord reads on this platform; the server prints it in its lenses
// ("looks done · tick? Ctrl+Alt+D P R").
export function chordLabel(platform: string, rest: string): string {
  return `${platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Alt+D ${rest}`;
}

export interface InitOptions {
  debug: false;
  keys: { plan_review: string };
  debounce_ms: number;
  model?: string;
  fills?: string;
}

export function initOptions(s: Settings, platform: string): InitOptions {
  const o: InitOptions = { debug: false, keys: { plan_review: chordLabel(platform, 'P R') }, debounce_ms: s.debounceMs };
  if (s.model) o.model = s.model;
  if (s.fills) o.fills = s.fills;
  return o;
}
