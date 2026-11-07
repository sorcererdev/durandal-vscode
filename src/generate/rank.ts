import type { GeneratorItem } from '../protocol';

// rank: the generate list's order, ported from durandal.nvim generate/rank.lua. With nothing
// typed: here first, then recent, then by name. With a query (fuzzy over the name and the
// summary; the detailed list has no pack): a match in the name first, then here, then
// recent, then how well it matched. Pure.

export const RECENT_MAX = 10;

// fuzzy keeps the items whose text holds query's characters in order (ignoring case), best
// first: the earliest first match, then the fewest gaps, then list order (alder form.ts).
export function fuzzy<T>(list: T[], query: string, text: (x: T) => string): T[] {
  const q = query.toLowerCase();
  const scored: { x: T; score: number; i: number }[] = [];
  list.forEach((x, i) => {
    const t = text(x).toLowerCase();
    let at = -1;
    let first = -1;
    let gaps = 0;
    for (const ch of q) {
      const k = t.indexOf(ch, at + 1);
      if (k < 0) return;
      if (first < 0) first = k;
      else gaps += k - at - 1;
      at = k;
    }
    scored.push({ x, score: first + gaps, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map(s => s.x);
}

const label = (g: GeneratorItem) => g.name || g.id;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function rank(items: GeneratorItem[], query: string, recent: string[]): GeneratorItem[] {
  const recency = new Map(recent.map((id, i) => [id, i]));
  const matched = query
    ? fuzzy(items, query, g => `${label(g)} ${g.summary ?? ''}`)
    : [...items].sort((a, b) => cmp(label(a), label(b)));
  const inName = new Set(query ? fuzzy(matched, query, label).map(g => g.id) : []);
  const order = new Map(matched.map((g, i) => [g, i]));
  return matched.sort((a, b) => {
    const na = inName.has(a.id);
    const nb = inName.has(b.id);
    if (na !== nb) return na ? -1 : 1;
    const ha = a.here === true;
    const hb = b.here === true;
    if (ha !== hb) return ha ? -1 : 1;
    const ra = recency.get(a.id);
    const rb = recency.get(b.id);
    if (ra !== rb) {
      if (ra !== undefined && rb !== undefined) return ra - rb;
      return ra !== undefined ? -1 : 1;
    }
    return order.get(a)! - order.get(b)!;
  });
}

// remember puts id first among the recents, once, keeping RECENT_MAX.
export function remember(recent: string[], id: string): string[] {
  return [id, ...recent.filter(x => x !== id)].slice(0, RECENT_MAX);
}

// PickerRow: a heading (`here` above the first item that applies at the cursor, `all` above
// the first other) or a generator. Headings only with nothing typed: ranked matches mix them.
export type PickerRow = { heading: 'here' | 'all' } | { item: GeneratorItem };

export function pickerRows(items: GeneratorItem[], query: string): PickerRow[] {
  if (query) return items.map(item => ({ item }));
  const out: PickerRow[] = [];
  let seenHere = false;
  let seenRest = false;
  for (const item of items) {
    if (item.here && !seenHere) {
      out.push({ heading: 'here' });
      seenHere = true;
    } else if (!item.here && !seenRest) {
      out.push({ heading: 'all' });
      seenRest = true;
    }
    out.push({ item });
  }
  return out;
}
