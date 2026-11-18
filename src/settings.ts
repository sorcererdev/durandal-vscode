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

// chordLabel is how a chord reads (the same on every platform: cmd+alt+d is macOS's Dock-hide
// shortcut, so macOS uses ctrl too); the server prints it in its lenses
// ("looks done · tick? Ctrl+Alt+D P R").
export function chordLabel(platform: string, rest: string): string {
  return `Ctrl+Alt+D ${rest}`;
}

export interface InitOptions {
  debug: false;
  // the keys the server names: plan_review in its lenses, plan_keep and definition in a
  // checked sentence's hover footer
  keys: { plan_review: string; plan_keep: string; definition: string };
  debounce_ms: number;
  model?: string;
  fills?: string;
  check_answers?: string;
  step_replies?: string;
  decide_answers?: string;
  inspect_answers?: string;
}

// env: the extension host's environment. The DURANDAL_*_ANSWERS and DURANDAL_STEP_REPLIES
// variables are olifant's test hooks (recorded claim checks, decisions, inspect finds, and the
// text every conjure writer answers); only the real e2e sets them.
export function initOptions(s: Settings, platform: string, env: NodeJS.ProcessEnv = process.env): InitOptions {
  const o: InitOptions = {
    debug: false,
    keys: { plan_review: chordLabel(platform, 'P R'), plan_keep: chordLabel(platform, 'P K'), definition: 'F12' },
    debounce_ms: s.debounceMs,
  };
  if (s.model) o.model = s.model;
  if (s.fills) o.fills = s.fills;
  if (env.DURANDAL_CHECK_ANSWERS) o.check_answers = env.DURANDAL_CHECK_ANSWERS;
  if (env.DURANDAL_STEP_REPLIES) o.step_replies = env.DURANDAL_STEP_REPLIES;
  if (env.DURANDAL_DECIDE_ANSWERS) o.decide_answers = env.DURANDAL_DECIDE_ANSWERS;
  if (env.DURANDAL_INSPECT_ANSWERS) o.inspect_answers = env.DURANDAL_INSPECT_ANSWERS;
  return o;
}
