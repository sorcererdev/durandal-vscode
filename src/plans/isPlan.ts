// The plan rule (spec §5.1): a markdown document (a .md name, or language markdown) under
// <project root>/plans/. Pure: trackIsPlan.ts sets durandal.isPlan with it.

// The folder, under a project, whose markdown files are plans (durandal.nvim's plans.dir
// default; durandal.plans.dir overrides it, and callers pass that as DIR).
export const PLANS_DIR = 'plans';

// PATH a file system path, ROOT its olifant project's root (undefined: in none).
export function isPlanPath(path: string, root: string | undefined, languageId: string, dir: string = PLANS_DIR): boolean {
  if (root === undefined || root === '') return false;
  const norm = (p: string) => p.replace(/\\/g, '/');
  const file = norm(path);
  const plans = `${norm(root).replace(/\/+$/, '')}/${dir}/`;
  if (!file.startsWith(plans) || file.length === plans.length) return false;
  return languageId === 'markdown' || file.toLowerCase().endsWith('.md');
}
