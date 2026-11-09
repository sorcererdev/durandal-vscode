// The plan rule (spec §5.1): a markdown document (a .md name, or language markdown) under
// <project root>/plans/. Pure: Task 8's trackIsPlan.ts sets durandal.isPlan with it.

// The folder, under a project, whose markdown files are plans (durandal.nvim's plans.dir
// default; milestone 6 makes it a setting).
export const PLANS_DIR = 'plans';

// PATH a file system path, ROOT its olifant project's root (undefined: in none).
export function isPlanPath(path: string, root: string | undefined, languageId: string): boolean {
  if (root === undefined || root === '') return false;
  const norm = (p: string) => p.replace(/\\/g, '/');
  const file = norm(path);
  const plans = `${norm(root).replace(/\/+$/, '')}/${PLANS_DIR}/`;
  if (!file.startsWith(plans) || file.length === plans.length) return false;
  return languageId === 'markdown' || file.toLowerCase().endsWith('.md');
}
