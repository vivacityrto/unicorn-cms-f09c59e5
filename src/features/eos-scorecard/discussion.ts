import { areaNeedsRoom, type Area, type Measure } from './scorecardView';

/** What happened to an area while the room looked at it. */
export type AreaOutcome = 'noted' | 'raised';

/**
 * The areas the deck steps through. "Needs the room" keeps areas with something off track or nearly there,
 * plus areas with missing numbers, because a gap nobody owns is itself something to ask about.
 */
export function discussionAreas(areas: readonly Area[], options: { needsRoomOnly?: boolean } = {}): Area[] {
  if (!options.needsRoomOnly) return [...areas];
  return areas.filter((a) => areaNeedsRoom(a) || a.worst === 'waiting');
}

/** A measure the room should look at: off track, nearly there, or with no number. */
export function needsRoom(m: Pick<Measure, 'status'>): boolean {
  return m.status !== 'on_track';
}

export interface WrapUpSummary {
  total: number;
  visited: number;
  raised: string[];
  noted: string[];
  /** Areas that need the room, were looked at or not, and have no open issue and no note. */
  unresolved: string[];
  unvisited: string[];
}

/**
 * The last slide. An area is "unresolved" when it needs the room but nothing came of it:
 * no issue raised now or already open for any of its measures, and no note written.
 */
export function wrapUp(
  deck: readonly Area[],
  outcomes: Readonly<Record<string, readonly AreaOutcome[]>>,
  notedCategories: ReadonlySet<string>,
  openIssueMetricIds: ReadonlySet<string>,
  viewed: ReadonlySet<string> = new Set(),
): WrapUpSummary {
  const raised: string[] = [];
  const noted: string[] = [];
  const unresolved: string[] = [];
  const unvisited: string[] = [];
  let visited = 0;
  for (const area of deck) {
    const done = outcomes[area.category] ?? [];
    const hasNote = notedCategories.has(area.category) || done.includes('noted');
    const hasIssue = done.includes('raised') || area.measures.some((m) => openIssueMetricIds.has(m.id));
    if (done.length > 0 || hasNote || viewed.has(area.category)) visited += 1;
    else unvisited.push(area.name);
    if (hasIssue) raised.push(area.name);
    if (hasNote) noted.push(area.name);
    if ((areaNeedsRoom(area) || area.worst === 'waiting') && !hasIssue && !hasNote) unresolved.push(area.name);
  }
  return { total: deck.length, visited, raised, noted, unresolved, unvisited };
}
