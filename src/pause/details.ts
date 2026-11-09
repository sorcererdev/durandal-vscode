import type { DetailsSection, Paused } from '../protocol';
import { given } from './text';

// details: the d document (durandal.nvim details.lua): everything a pause holds, or a review's
// details sections, as one markdown text that VS Code shows read-only beside the panel.
// Spec §6. The sections keep nvim's order (situation, rounds, tests, unit, steps, diffs); each
// is a `##` heading so the outline, breadcrumbs and sticky scroll navigate them.

const SEP = ' · ';
// a round whose diff is '' (not null): its body is the person's own text
const NO_DIFF = '(none: the body is your text)';

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

// jevLine: the decider's probabilities, highest first then by name, two decimals without the
// leading zero (details.lua jev_line); none when there are none
function jevLine(probabilities: Record<string, number> | null | undefined): string | undefined {
  const list = Object.entries(probabilities ?? {}).map(([k, v]): [string, number] => [k, Number(v) || 0]);
  if (list.length === 0) return undefined;
  list.sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return `Jev: ${list.map(([k, v]) => `${k} ${v.toFixed(2).replace(/^0/, '')}`).join(SEP)}`;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// shorteners: a path relative to ROOT, and by its name alone when it sits beside the unit's
// own file (details.lua short); TEXT: every such path inside free text (short_text)
function shorteners(unitFile: string | undefined, rootIn: string | undefined): { path(p: string): string; text(t: string): string } {
  const root = rootIn ? rootIn.replace(/\/+$/, '') : '';
  const strip = (s: string): string => (root !== '' && s.startsWith(`${root}/`) ? s.slice(root.length + 1) : s);
  const unit = strip(unitFile ?? '');
  const slash = unit.lastIndexOf('/');
  const dir = slash >= 0 ? unit.slice(0, slash + 1) : '';
  const beside = dir === '' ? undefined : new RegExp(`${escapeRe(dir)}([^/\\s]+)`, 'g');
  return {
    path(p: string): string {
      const s = strip(p);
      return dir !== '' && s.startsWith(dir) && !s.slice(dir.length).includes('/') ? s.slice(dir.length) : s;
    },
    text(t: string): string {
      let s = root === '' ? t : t.split(`${root}/`).join('');
      if (beside) s = s.replace(beside, '$1');
      return s;
    },
  };
}

// shortPath: FILE as the details show it: relative to ROOT, bare beside UNITFILE (the paused file)
export function shortPath(file: string, unitFile: string | undefined, root: string | undefined): string {
  return shorteners(unitFile, root).path(file);
}

// conjureDetails: PAUSED as markdown (details.lua build). ROOT: the project's folder (paths
// shorten against it); LANG: the unit's document languageId, the fence language of its code
// ('' a plain fence). No clock: the footer shows the server's expiry as sent (a snapshot).
export function conjureDetails(p: Paused, o: { root?: string; lang: string }): string {
  const { path, text } = shorteners(p.file, o.root);
  const w = writer();
  const heading = (word: string): void => w.block([`## ${word}`]);

  const file = p.file ?? '';
  const unit = p.title?.unit || file.slice(file.lastIndexOf('/') + 1);
  w.block([unit ? `# conjure${SEP}${unit}` : '# conjure']);

  // situation: what the last choice came to, why it paused, the check's wall and its places
  heading('situation');
  if (given(p.outcome)) w.block(lines(p.outcome));
  let diagnosis = p.diagnosis ?? [];
  if (diagnosis.length === 0 && given(p.why) && p.why !== '') diagnosis = [p.why];
  if (diagnosis.length > 0) {
    w.block(lines(diagnosis[0]).map(l => (l.trim() === '' ? '' : `**${l.trim()}**`)));
    w.block(diagnosis.slice(1).flatMap(lines));
  }
  if (given(p.trigger) && p.trigger !== '') w.block([`trigger: ${p.trigger}`]);
  const failure = p.failure;
  if (given(failure) && failure.kind === 'check') {
    w.block([`round ${failure.round ?? '?'}: ${failure.tool || 'the check'} refused it before the tests ran`]);
    w.block((failure.problems ?? []).map(pr =>
      `- ${path(pr.file || '?')}${given(pr.line) ? `:${pr.line}` : ''}  ${pr.message ?? ''}`));
  }
  // the person's hints are steps of kind hint (the server sends no top-level hint); their text
  // already reads 'hint: …' (Conjure.hs :670)
  const steps = p.steps ?? [];
  w.block(steps.filter(s => s.kind === 'hint').map(s => (s.text.startsWith('hint:') ? s.text : `hint: ${s.text}`)));

  // rounds: each round's verdict, body, the decider's choice and the runner's output
  const rounds = p.rounds ?? [];
  if (rounds.length > 0) {
    heading('rounds');
    for (const r of rounds) {
      w.block([`### round ${r.round}${SEP}${r.rung || '?'}${SEP}${r.verdict || '?'}`]);
      w.block(fence(given(r.attempt) ? r.attempt : (r.line ?? ''), o.lang));
      const d = r.decide;
      if (given(d)) {
        w.block([`decide: ${d.choice || '?'} ${given(d.confidence) ? d.confidence : ''}`.trimEnd()]);
        const jev = jevLine(d.probabilities);
        if (jev !== undefined) w.block([jev]);
      }
      const output = (r.failed ?? []).flatMap(f => text(f.output ?? '').split('\n')).filter(l => l !== '');
      w.block(fence(output.join('\n'), ''));
    }
  }

  // tests: each involved test's place and status, the scan's note, its source
  const tests = p.tests ?? [];
  if (tests.length > 0) {
    heading('tests');
    for (const x of tests) {
      const id = String(x.test);
      const at = id.indexOf('::');
      const shown = at < 0 ? id : `${path(id.slice(0, at))}::${id.slice(at + 2)}`;
      w.block([`### ${shown}${SEP}${x.status ?? '?'}`]);
      if (given(x.note)) w.block(lines(x.note));
      w.block(fence(x.source ?? '', o.lang));
    }
  }

  // unit: its header and its ports
  if (given(p.unit)) {
    heading('unit');
    w.block(fence(p.unit.header ?? '', o.lang));
    const ports = p.unit.ports ?? [];
    w.block([`ports: ${ports.length > 0 ? ports.join(', ') : 'none'}`]);
  }

  // steps: what was accepted, each in force from the next round on, and what is wired
  const wired = p.wired ?? [];
  if (steps.length > 0 || wired.length > 0) {
    heading('steps');
    if (steps.length > 0) w.block(['each in force from the next round on']);
    w.block([
      ...steps.map(s => {
        const after = Number(s.after) || 0;
        return `- ✓ ${after === 0 ? 'before round 1' : `after round ${after}`}${SEP}${s.text ?? ''}`;
      }),
      ...wired.map(x => {
        const files = (x.files ?? []).map(f => path(f.file ?? ''));
        return `- wired ${x.param || '?'}: ${x.port || '?'}${files.length > 0 ? `${SEP}${files.join(', ')}` : ''}`;
      }),
    ]);
  }

  // diffs: each round's (keep's landing said on the kept round when it is that round's own
  // diff), each step's files', the wire's unless a wire step listed them, then the landing
  const diffs: { title: string; diff: string }[] = [];
  let landing = given(p.landing) && given(p.landing.diff) ? p.landing.diff : undefined;
  const kept = String(p.round ?? '?');
  for (const r of rounds) {
    if (!given(r.diff)) continue;
    let title = `round ${r.round}`;
    if (landing !== undefined && String(r.round) === kept && r.diff === landing) {
      title += `${SEP}what keep round ${kept} lands`;
      landing = undefined;
    }
    diffs.push({ title, diff: r.diff });
  }
  let wireStep = false;
  for (const s of steps) {
    if (s.kind === 'wire') wireStep = true;
    for (const f of s.files ?? []) {
      if (given(f.diff) && f.diff !== '') diffs.push({ title: `${s.text || 'step'}${SEP}${path(f.file ?? '')}`, diff: f.diff });
    }
  }
  if (!wireStep) {
    for (const x of wired) {
      for (const f of x.files ?? []) {
        if (given(f.diff) && f.diff !== '') diffs.push({ title: `wire ${x.param || '?'}${SEP}${path(f.file ?? '')}`, diff: f.diff });
      }
    }
  }
  if (landing !== undefined) diffs.push({ title: `keep round ${kept} would land`, diff: landing });
  if (diffs.length > 0) {
    heading('diffs');
    for (const d of diffs) {
      w.block([`### ${d.title}`]);
      const body = fence(d.diff, 'diff');
      w.block(body.length > 0 ? body : [NO_DIFF]);
    }
  }

  // the footer: the token and how long the server keeps it
  w.block(['---']);
  const expires = given(p.expires) ? String(p.expires) : '?';
  w.block([`token ${p.token || '?'}${SEP}expires in ${expires} s`]);
  return w.out.join('\n') + '\n';
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
