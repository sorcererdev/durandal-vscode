import { CLIENT_COMMANDS } from './protocol';

// The commands later milestones build (spec §6); until then each says so when run.
export const NOT_YET: Record<string, { title: string; milestone: number }> = {
  'durandal.actions': { title: 'Actions Here', milestone: 2 },
  'durandal.generate': { title: 'Generate…', milestone: 2 },
  'durandal.test.file': { title: "Run This File's Tests", milestone: 4 },
  'durandal.test.all': { title: 'Run All Tests', milestone: 4 },
  'durandal.jump': { title: 'Jump to Test or Module', milestone: 4 },
  'durandal.stub': { title: 'Stub a Test', milestone: 4 },
  'durandal.conjure': { title: 'Conjure', milestone: 4 },
  'durandal.mutate': { title: 'Mutate', milestone: 4 },
  'durandal.plan.ask': { title: 'Plan: Ask', milestone: 6 },
  'durandal.plan.validate': { title: 'Plan: Validate', milestone: 6 },
  'durandal.plan.do': { title: 'Plan: Do', milestone: 6 },
  'durandal.plan.accept': { title: 'Plan: Accept', milestone: 6 },
  'durandal.plan.reject': { title: 'Plan: Reject', milestone: 6 },
  'durandal.plan.files': { title: 'Plan: Files', milestone: 6 },
  'durandal.plan.reconcile': { title: 'Plan: Reconcile', milestone: 6 },
  'durandal.plan.excerpt': { title: 'Plan: Excerpt', milestone: 6 },
  'durandal.plan.review': { title: 'Plan: Review', milestone: 5 },
  'durandal.plan.toggle': { title: 'Plan: Toggle Reading', milestone: 6 },
};

// Commands the server names in its inlay hints (⚡) and code lenses: registered so a click
// never fails with "command not found", not contributed (they need the server's arguments).
// Keyed by protocol.ts CLIENT_COMMANDS' values, so a command added there must be given a
// title and milestone here (the Record type fails to compile otherwise).
const SERVER_NAMED_INFO: Record<keyof typeof CLIENT_COMMANDS, { title: string; milestone: number }> = {
  showActions: { title: 'Actions', milestone: 2 },
  planReview: { title: 'Plan Review', milestone: 5 },
  planExcerpt: { title: 'Plan Excerpt', milestone: 6 },
  planErrand: { title: 'Plan Delegations', milestone: 6 },
};

export const SERVER_NAMED: Record<string, { title: string; milestone: number }> = Object.fromEntries(
  (Object.keys(CLIENT_COMMANDS) as (keyof typeof CLIENT_COMMANDS)[]).map(k => [CLIENT_COMMANDS[k], SERVER_NAMED_INFO[k]]),
);

export const notYet = (title: string) => `Durandal: ${title} is not implemented yet`;

// The chord prefix, then durandal.nvim's letters (spec §4).
export const PREFIX = { key: 'ctrl+alt+d', mac: 'cmd+alt+d' } as const;

export const KEYS: { command: string; keys: string; when: string }[] = [
  { command: 'durandal.actions', keys: 'a', when: 'durandal.inProject' },
  { command: 'durandal.generate', keys: 'g', when: 'durandal.inProject' },
  { command: 'durandal.test.file', keys: 't', when: 'durandal.inProject' },
  { command: 'durandal.test.all', keys: 'shift+t', when: 'durandal.inProject' },
  { command: 'durandal.jump', keys: 'j', when: 'durandal.inProject' },
  { command: 'durandal.stub', keys: 's', when: 'durandal.inProject' },
  { command: 'durandal.conjure', keys: 'c', when: 'durandal.inProject' },
  { command: 'durandal.mutate', keys: 'm', when: 'durandal.inProject' },
  { command: 'durandal.plan.ask', keys: 'p q', when: 'durandal.isPlan' },
  { command: 'durandal.plan.validate', keys: 'p v', when: 'durandal.isPlan' },
  { command: 'durandal.plan.do', keys: 'p d', when: 'durandal.isPlan' },
  { command: 'durandal.plan.accept', keys: 'p y', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reject', keys: 'p n', when: 'durandal.isPlan' },
  { command: 'durandal.plan.files', keys: 'p f', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reconcile', keys: 'p c', when: 'durandal.isPlan' },
  { command: 'durandal.plan.excerpt', keys: 'p e', when: 'durandal.isPlan' },
  { command: 'durandal.plan.review', keys: 'p r', when: 'durandal.isPlan' },
  { command: 'durandal.plan.toggle', keys: 'p x', when: 'durandal.isPlan' },
];
