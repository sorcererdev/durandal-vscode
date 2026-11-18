import type { DetailsSection } from '../protocol';

// details: the d document (durandal.nvim details.lua): a review's or a conjure step's details
// sections as one markdown text that VS Code shows read-only beside the panel. Spec §6. Each
// section is a `##` heading so the outline, breadcrumbs and sticky scroll navigate them.

// lines: TEXT split on newlines, one trailing newline dropped; '' is no lines
function lines(text: string): string[] {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body === '' ? [] : body.split('\n');
}

// fence: TEXT as a fenced block in LANG ('' a plain fence); none for empty text. The fence is
// one backtick longer than the longest run inside, so no line of the text can close it.
function fence(text: string, lang: string): string[] {
  const body = lines(text);
  if (body.length === 0) return [];
  let longest = 0;
  for (const run of body.join('\n').match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return [ticks + lang, ...body, ticks];
}

// writer: blocks of lines, one blank line between blocks; an empty block adds nothing
function writer(): { out: string[]; block(ls: string[]): void } {
  const out: string[] = [];
  return {
    out,
    block(ls: string[]): void {
      if (ls.length === 0) return;
      if (out.length > 0) out.push('');
      out.push(...ls);
    },
  };
}

// reviewDetails: a review's details sections (details.lua build_sections) under TITLE: each
// section's title a `##` heading, a diff section fenced as diff, any other as prose
export function reviewDetails(title: string, sections: DetailsSection[]): string {
  const w = writer();
  w.block([`# ${title}`]);
  for (const s of sections) {
    w.block([`## ${s.title ?? ''}`]);
    w.block(s.lang === 'diff' ? fence(s.text ?? '', 'diff') : lines(s.text ?? ''));
  }
  return w.out.join('\n') + '\n';
}