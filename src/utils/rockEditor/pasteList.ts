const BULLET = /^\s*(?:[-*•–—]|\d{1,2}[.)])\s+/;
const MAX_ITEMS = 30;

/**
 * Milestones pasted as a list, one per line. Bullets and numbering are stripped,
 * blanks dropped, and repeats (ignoring case) kept once.
 */
export function parseMilestoneList(text: string, max = MAX_ITEMS): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(BULLET, '').trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
    if (items.length >= max) break;
  }
  return items;
}
