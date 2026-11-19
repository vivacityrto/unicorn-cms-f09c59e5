import { formatDistanceToNow, parseISO } from 'date-fns';
import { categoryLabel } from '@/components/client/checkins-staff/tenantCheckins';

/** One flagged live package, from get_checkins_attention. Names only; the description is clipped to 160 characters. */
export interface CheckinAttentionItem {
  package_instance_id: number;
  tenant_id: number;
  tenant_name: string;
  package_name: string;
  manager_id: string | null;
  manager_name: string | null;
  /** Blockers not yet resolved, from the last 30 days. */
  blocker_count: number;
  /** Of those, how many nobody has marked seen yet. */
  new_blocker_count: number;
  latest_blocker: { category: string; comment: string | null; name: string; created_at: string; status: 'flagged' | 'seen' } | null;
  low_streak_people: number;
}

export interface CheckinsAttention {
  items: CheckinAttentionItem[];
}

/** The packages this person manages. */
export function minePackages(items: readonly CheckinAttentionItem[], userId: string | null | undefined): CheckinAttentionItem[] {
  return userId ? items.filter((i) => i.manager_id === userId) : [];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ago = (iso: string) => {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return 'recently';
  }
};

/** What is flagged on one package, in plain words. */
export function describeItem(item: CheckinAttentionItem): string[] {
  const parts: string[] = [];
  if (item.blocker_count > 0 && item.latest_blocker) {
    const b = item.latest_blocker;
    const open = item.blocker_count > 1 ? ` (${item.blocker_count} unresolved)` : '';
    const state = item.new_blocker_count === 0 ? ', seen' : '';
    parts.push(`Blocker flagged: ${categoryLabel(b.category)}, ${b.name} ${ago(b.created_at)}${open}${state}`);
  }
  if (item.low_streak_people > 0) {
    parts.push(`${plural(item.low_streak_people, 'person has', 'people have')} given two low pulses in a row`);
  }
  return parts;
}

/** The sentence for the top of the card. */
export function attentionSentence(items: readonly CheckinAttentionItem[]): string {
  if (items.length === 0) return 'No client check-ins need attention right now.';
  const clients = new Set(items.map((i) => i.tenant_id)).size;
  const blockers = items.filter((i) => i.blocker_count > 0).length;
  const fresh = items.filter((i) => i.new_blocker_count > 0).length;
  const lows = items.filter((i) => i.low_streak_people > 0).length;
  const bits: string[] = [];
  if (blockers > 0) bits.push(`${plural(blockers, 'package has', 'packages have')} an unresolved blocker${fresh > 0 ? ` (${fresh} new)` : ''}`);
  if (lows > 0) bits.push(`${plural(lows, 'package has', 'packages have')} two low pulses in a row`);
  return `${plural(clients, 'client')} to look at: ${bits.join(' and ')}.`;
}
