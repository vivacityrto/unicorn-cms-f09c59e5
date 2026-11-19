/** What the notifications drawer needs to know about one notification, whichever portal it came from. */
export interface DrawerItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
  /** The client it is about. Shown for staff, who see many clients. */
  tenantName?: string | null;
}

export type ReadView = 'all' | 'unread';

export interface DayGroup {
  key: string;
  label: string;
  items: DrawerItem[];
}

/** Strip HTML tags so a stored message reads as plain text. */
export function plainText(text: string | null | undefined): string {
  return (text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** note_shared becomes "Note shared". */
export function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Apply the Unread view and the chosen type. `type` of null means every type. */
export function filterItems(items: readonly DrawerItem[], view: ReadView, type: string | null): DrawerItem[] {
  return items.filter((n) => (view === 'all' || !n.isRead) && (type == null || n.type === type));
}

/** The types present, most common first, with how many of each. */
export function typeCounts(items: readonly DrawerItem[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const n of items) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  return Array.from(counts, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Newest first, under Today, Yesterday, Earlier this week and Older. Empty groups are left out. */
export function groupByDay(items: readonly DrawerItem[], now: Date = new Date()): DayGroup[] {
  const today = startOfDay(now);
  const DAY = 24 * 60 * 60 * 1000;
  const groups: DayGroup[] = [
    { key: 'today', label: 'Today', items: [] },
    { key: 'yesterday', label: 'Yesterday', items: [] },
    { key: 'week', label: 'Earlier this week', items: [] },
    { key: 'older', label: 'Older', items: [] },
  ];
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const n of sorted) {
    const day = startOfDay(new Date(n.createdAt));
    const idx = day >= today ? 0 : day >= today - DAY ? 1 : day >= today - 6 * DAY ? 2 : 3;
    groups[idx].items.push(n);
  }
  return groups.filter((g) => g.items.length > 0);
}
