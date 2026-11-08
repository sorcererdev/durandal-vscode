// spanOf: the whole lines (0-based, inclusive) a snippet inserted at the start of line covers:
// as many as its body has. The fill replaces these lines when the model's body comes back.
export function spanOf(line: number, body: string): { start: number; end: number } {
  return { start: line, end: line + body.split('\n').length - 1 };
}
