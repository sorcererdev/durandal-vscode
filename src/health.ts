import { execFile } from 'node:child_process';
import { promises as fs, constants } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

export const BUILD_HINT = 'build it from a checkout of sorcererdev/olifant: cabal build && scripts/install-olifant.sh (installs ~/.local/bin/olifant), or set durandal.path';
export const STOPPED = 'olifant lsp stopped: Durandal is off until it runs again';

// candidates lists where the binary may be. VS Code opened from the Dock on macOS sees a
// shorter PATH than a shell, so olifant's install directory (~/.local/bin), cabal's
// (~/.cabal/bin) and ~/bin follow PATH.
export function candidates(setting: string, env: NodeJS.ProcessEnv, home: string): string[] {
  if (isAbsolute(setting)) return [setting];
  if (setting.startsWith('~/')) return [join(home, setting.slice(2))];
  if (setting.includes('/')) return [resolve(setting)];
  const dirs = (env.PATH ?? '').split(delimiter).filter(d => d !== '');
  dirs.push(join(home, '.local', 'bin'), join(home, '.cabal', 'bin'), join(home, 'bin'));
  return [...new Set(dirs.map(d => join(d, setting)))];
}

async function executable(p: string): Promise<boolean> {
  try {
    await fs.access(p, constants.X_OK);
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

// hasLsp: olifant prints no version, so the gate is its command list: `olifant --help`
// (optparse-applicative) lists each command indented under "Available commands:".
export function hasLsp(stdout: string): boolean {
  return /^\s+lsp\s/m.test(stdout);
}

function run(path: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise(res => {
    execFile(path, args, { timeout: 10_000, maxBuffer: 4 << 20 }, (err, stdout) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      res({ code, stdout: String(stdout ?? '') });
    });
  });
}

export interface Gate { path?: string; ok: boolean; problem?: string; skipped?: string[] }

async function gate(path: string): Promise<Gate> {
  const help = await run(path, ['--help']);
  if (help.code !== 0 || !hasLsp(help.stdout)) {
    return { path, ok: false, problem: `olifant: \`${path} --help\` lists no \`lsp\` command: this olifant predates the language server; ${BUILD_HINT}` };
  }
  return { path, ok: true };
}

// checkBinary: a path setting checks only that binary; a bare name takes the first candidate
// that passes the gate, listing the executables it passed over.
export async function checkBinary(setting: string, env: NodeJS.ProcessEnv, home: string): Promise<Gate> {
  const found: string[] = [];
  for (const p of candidates(setting, env, home)) if (await executable(p)) found.push(p);
  if (found.length === 0) {
    return { ok: false, problem: `olifant: no \`${setting}\` binary found (durandal.path, PATH, ~/.local/bin, ~/.cabal/bin, ~/bin); ${BUILD_HINT}` };
  }
  const failed: Gate[] = [];
  for (const p of found) {
    const g = await gate(p);
    if (g.ok) return failed.length ? { ...g, skipped: failed.map(f => f.path!) } : g;
    failed.push(g);
  }
  const [first, ...rest] = failed;
  return rest.length ? { ...first, skipped: rest.map(f => f.path!) } : first;
}

export type ServerState = 'not started' | 'starting' | 'running' | 'stopped' | 'failed';

// doctorLines are olifant doctor's checks (the `olifant.doctor` command's answer, the shape
// `olifant doctor --json` prints), as durandal.nvim's health shows them.
export function doctorLines(result: unknown): string[] {
  const checks = (result as { checks?: unknown } | null | undefined)?.checks;
  if (!Array.isArray(checks)) return ['error: olifant doctor gave no checks'];
  const out: string[] = [];
  for (const c of checks as Record<string, unknown>[]) {
    const level = c.status === 'ok' || c.status === 'warn' || c.status === 'error' ? c.status : 'warn';
    out.push(`${level}: ${String(c.name)} — ${String(c.detail)}`);
    if (typeof c.fix === 'string' && c.fix !== '') out.push(`  fix: ${c.fix}`);
  }
  return out;
}

export interface DoctorSection { root: string; result?: unknown; error?: string }

const STATE_LINE: Record<ServerState, string> = {
  'running': 'ok: olifant lsp running',
  'starting': 'info: olifant lsp starting',
  'stopped': `error: ${STOPPED} (Durandal: Restart Server; its log is the Durandal output channel)`,
  'failed': 'error: olifant lsp did not start (the Durandal output channel says why; Durandal: Restart Server)',
  'not started': 'info: olifant lsp not started (it starts when the window holds an Olifant project)',
};

// report is the `Durandal: Show Health` text.
export function report(gate: Gate, state: ServerState, roots: string[], doctor?: DoctorSection): string[] {
  const out: string[] = [];
  out.push(gate.path ? `binary: ${gate.path}` : 'binary: not found');
  for (const p of gate.skipped ?? []) out.push(`skipped: ${p}: failed the \`--help\` lists \`lsp\` check`);
  out.push(gate.ok ? 'ok: `olifant --help` lists `lsp`' : `error: ${gate.problem}`);
  out.push(STATE_LINE[state]);
  for (const r of roots) out.push(`project: ${r}`);
  if (roots.length === 0) out.push('info: no Olifant project in this window (no .olifant/ found)');
  if (!doctor) {
    out.push('info: open a file of an Olifant project (with olifant lsp running) to see what its generators need');
  } else {
    out.push(`--- olifant doctor in ${doctor.root}`);
    out.push(...(doctor.error !== undefined ? [`error: olifant doctor failed: ${doctor.error}`] : doctorLines(doctor.result)));
  }
  return out;
}
