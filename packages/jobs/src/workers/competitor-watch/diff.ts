/** One line of a stored diff: added, removed, or unchanged context. */
export interface DiffLine {
  op: '+' | '-' | ' ';
  text: string;
}

/** A line diff with its counts and the share of text that changed, from 0 to 1. */
export interface TextDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
  ratio: number;
}

/** Above this many cells the middle of the diff is not aligned line by line, only replaced. */
const MAX_CELLS = 4_000_000;
const CONTEXT = 2;
const MAX_STORED_LINES = 400;
const MAX_LINE_LENGTH = 500;

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split('\n');
}

/** Aligns two line arrays with a longest-common-subsequence table and returns the edit script. */
function align(a: string[], b: string[]): DiffLine[] {
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text) => ({ op: '-' as const, text })), ...b.map((text) => ({ op: '+' as const, text }))];
  }
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j] ? table[(i + 1) * width + j + 1]! + 1 : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', text: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      out.push({ op: '-', text: a[i++]! });
    } else {
      out.push({ op: '+', text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ op: '-', text: a[i++]! });
  while (j < b.length) out.push({ op: '+', text: b[j++]! });
  return out;
}

/** Keeps the changed lines with a little context around them, capped so a stored diff stays small. */
function compact(script: DiffLine[]): DiffLine[] {
  const keep = new Uint8Array(script.length);
  script.forEach((line, index) => {
    if (line.op === ' ') return;
    for (let k = Math.max(0, index - CONTEXT); k <= Math.min(script.length - 1, index + CONTEXT); k++) keep[k] = 1;
  });
  return script
    .filter((_, index) => keep[index] === 1)
    .slice(0, MAX_STORED_LINES)
    .map((line) => ({ op: line.op, text: line.text.slice(0, MAX_LINE_LENGTH) }));
}

/**
 * Diffs two normalized texts line by line. The ratio weighs each added or
 * removed line by its length, over the length of both texts, so a changed
 * price line counts for more than a moved comma and a full rewrite is 1.
 */
export function diffText(before: string, after: string): TextDiff {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const middle = align(a.slice(start, endA), b.slice(start, endB));
  const script: DiffLine[] = [
    ...a.slice(Math.max(0, start - CONTEXT), start).map((text) => ({ op: ' ' as const, text })),
    ...middle,
    ...a.slice(endA, endA + CONTEXT).map((text) => ({ op: ' ' as const, text })),
  ];
  let added = 0;
  let removed = 0;
  let changedChars = 0;
  for (const line of middle) {
    if (line.op === ' ') continue;
    if (line.op === '+') added++;
    else removed++;
    changedChars += line.text.length + 1;
  }
  const total = before.length + after.length + 2;
  const ratio = added + removed === 0 ? 0 : Math.min(1, changedChars / total);
  return { lines: compact(script), added, removed, ratio };
}
