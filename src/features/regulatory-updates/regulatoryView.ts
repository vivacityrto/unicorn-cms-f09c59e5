import { format, isThisYear, parseISO } from 'date-fns';
import { getRegulatorySummarySections } from './summaryFormatting';

export type ImpactLevel = 'critical' | 'high' | 'moderate' | 'low';

/** Most serious first. This is the order the overview cards and any sorting use. */
export const IMPACT_ORDER: ImpactLevel[] = ['critical', 'high', 'moderate', 'low'];

export const IMPACT_LABEL: Record<ImpactLevel, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

/** A short line a client can act on, one per level. */
export const IMPACT_MEANING: Record<ImpactLevel, string> = {
  critical: 'Act now. This may affect your registration.',
  high: 'Plan changes soon and check your evidence.',
  moderate: 'Worth reviewing at your next compliance meeting.',
  low: 'Good to know. Little or no change expected.',
};

export function impactOf(level: string | null | undefined): ImpactLevel | null {
  const l = (level ?? '').toLowerCase();
  return (IMPACT_ORDER as string[]).includes(l) ? (l as ImpactLevel) : null;
}

const EXCERPT_LENGTH = 180;

/** Markdown to a short plain sentence for a card. */
export function plainExcerpt(markdown: string | null | undefined, max = EXCERPT_LENGTH): string | null {
  if (!markdown) return null;
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** The start of the change summary as plain text, leaving out the machine-readable analysis block. */
export function changeExcerpt(markdown: string | null | undefined, max = 220): string | null {
  if (!markdown) return null;
  return plainExcerpt(getRegulatorySummarySections(markdown).changeSummary, max);
}

export interface UpdateSummary {
  id: string;
  regulator: string;
  category: string | null;
  url: string | null;
  impact: ImpactLevel | null;
  detectedAt: string | null;
  excerpt: string | null;
  areaCount: number;
}

/** How many updates there are at each impact level, and how many are recent. */
export function impactCounts(updates: readonly UpdateSummary[], now: Date = new Date()) {
  const counts: Record<ImpactLevel, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  let recent = 0;
  for (const u of updates) {
    if (u.impact) counts[u.impact] += 1;
    if (isRecent(u.detectedAt, now)) recent += 1;
  }
  return { counts, recent, total: updates.length };
}

/** Detected in the last 30 days. */
export function isRecent(detectedAt: string | null, now: Date = new Date(), days = 30): boolean {
  if (!detectedAt) return false;
  const t = new Date(detectedAt).getTime();
  return !Number.isNaN(t) && now.getTime() - t <= days * 86_400_000 && t <= now.getTime() + 60_000;
}

/** "November 2026" heading for a month group; older years show the year, this year still does for clarity. */
export function monthLabel(detectedAt: string | null): string {
  if (!detectedAt) return 'Undated';
  const d = parseISO(detectedAt);
  return Number.isNaN(d.getTime()) ? 'Undated' : format(d, isThisYear(d) ? 'MMMM yyyy' : 'MMMM yyyy');
}

/** Updates under month headings in the order given (newest first), with undated ones last. */
export function groupByMonth(updates: readonly UpdateSummary[]): Array<{ label: string; items: UpdateSummary[] }> {
  const groups: Array<{ label: string; items: UpdateSummary[] }> = [];
  for (const u of updates) {
    const label = monthLabel(u.detectedAt);
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.items.push(u);
    else groups.push({ label, items: [u] });
  }
  return [...groups.filter((g) => g.label !== 'Undated'), ...groups.filter((g) => g.label === 'Undated')];
}

export function matchesUpdate(u: UpdateSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [u.regulator, u.category, u.excerpt].some((v) => (v ?? '').toLowerCase().includes(q));
}

export interface RegulatorChangeEventRow {
  id: string;
  detected_at: string | null;
  impact_level: string | null;
  change_summary_md: string | null;
  affected_areas_json: unknown[] | null;
  regulator_watchlist: { name: string | null; url: string | null; category: string | null } | null;
}

/** One database row as the card the list shows. */
export function toUpdateSummary(event: RegulatorChangeEventRow): UpdateSummary {
  const wl = event.regulator_watchlist;
  return {
    id: event.id,
    regulator: wl?.name || 'Regulator update',
    category: wl?.category ?? null,
    url: wl?.url ?? null,
    impact: impactOf(event.impact_level),
    detectedAt: event.detected_at,
    excerpt: changeExcerpt(event.change_summary_md),
    areaCount: Array.isArray(event.affected_areas_json) ? event.affected_areas_json.length : 0,
  };
}
