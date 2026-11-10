// The plan glyphs (spec §3.3, §3.4; durandal.nvim plans.lua:17-19). No vscode import.

export const GLYPH_NAMES = ['todo', 'done', 'question', 'test', 'also', 'dash', 'path', 'hex', 'queued', 'checking', 'right', 'wrong', 'unsure'] as const;
export type GlyphName = typeof GLYPH_NAMES[number];
export type Glyphs = Record<GlyphName, string>;

// The markers' glyphs (an empty one hides its text and shows nothing), then the verdict margin's.
export const DEFAULT_GLYPHS: Glyphs = {
  todo: '☐', done: '☑', question: '?', test: '·', also: '+', dash: '', path: '', hex: '',
  queued: '○', checking: '…', right: '✓', wrong: '✗', unsure: '?',
};
