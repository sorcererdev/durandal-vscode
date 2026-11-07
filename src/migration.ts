import type { Migration } from './protocol';

// migration: :DurandalMigration's report from olifant/model's migration (durandal.nvim
// migration.lua): the PR line, each switch on or off, then what the branch added to legacy
// code and any switch the registry lacks. Pure.

export const NOT_MIGRATING = 'this project is not migrating (no [migrate] in .olifant/config.toml; olifant init --migrate PATH sets it up)';

export function migrationLines(m: Migration): string[] {
  const out = [m.line ?? '', ''];
  const switches = m.switches ?? [];
  if (switches.length === 0) {
    out.push('no switches yet');
  } else {
    const width = Math.max(...switches.map(s => s.name.length));
    out.push('switches');
    for (const s of switches) out.push(`  ${s.name}${' '.repeat(width - s.name.length + 2)}${s.on ? 'on' : 'off'}`);
  }
  if ((m.added_legacy ?? []).length > 0) out.push('', `legacy functions this branch added: ${m.added_legacy.join(', ')}`);
  if ((m.unregistered ?? []).length > 0) out.push('', `switches not in the registry: ${m.unregistered.join(', ')}`);
  return out;
}
