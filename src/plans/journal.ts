// Journal lines and past dos (durandal.nvim plans.lua is_journal, review.lua's errand pick). No
// vscode import.
import type { Errand } from '../protocol';

// isJournal: a journal line ("- 25 Oct 21:31 · …"), nvim's ^%s*%- %d%d? %a%a%a %d%d:%d%d ·
export const isJournal = (line: string): boolean => /^\s*- \d\d? [A-Za-z]{3} \d\d:\d\d ·/.test(line);

// errandLabel: a past do in the pick: its time (minutes, T as a space), status, choice, words
export const errandLabel = (e: Errand): string =>
  [e.at.slice(0, 16).replace('T', ' '), e.status, e.choice ?? '', e.words].join(' · ');
