export interface DuplicateCandidate {
  id: string;
  title: string;
  quarterYear: number;
  quarterNumber: number;
  archived: boolean;
}

export interface DuplicateMatch<T extends DuplicateCandidate = DuplicateCandidate> {
  rock: T;
  reason: 'same_title' | 'similar';
  score: number;
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'to', 'in', 'on', 'with', 'our', 'across', 'platform']);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t)));
}

/**
 * Rocks in the same quarter that look like the one being typed: an identical
 * title, or at least 70% of its meaningful words in common. Short titles are not
 * compared, so "Hiring" does not match everything.
 */
export function findLikelyDuplicates<T extends DuplicateCandidate>(
  title: string,
  quarter: { year: number; quarter: number },
  rocks: readonly T[],
  options: { excludeId?: string; limit?: number } = {},
): DuplicateMatch<T>[] {
  const normalized = normalizeTitle(title);
  if (normalized.length < 4) return [];
  const mine = tokensOf(title);
  const matches: DuplicateMatch<T>[] = [];

  for (const rock of rocks) {
    if (rock.id === options.excludeId || rock.archived) continue;
    if (rock.quarterYear !== quarter.year || rock.quarterNumber !== quarter.quarter) continue;
    if (normalizeTitle(rock.title) === normalized) {
      matches.push({ rock, reason: 'same_title', score: 1 });
      continue;
    }
    const theirs = tokensOf(rock.title);
    if (mine.size < 3 || theirs.size < 3) continue;
    const shared = [...mine].filter(t => theirs.has(t)).length;
    const score = shared / (mine.size + theirs.size - shared);
    if (score >= 0.7) matches.push({ rock, reason: 'similar', score });
  }

  return matches.sort((a, b) => b.score - a.score || a.rock.title.localeCompare(b.rock.title)).slice(0, options.limit ?? 3);
}
