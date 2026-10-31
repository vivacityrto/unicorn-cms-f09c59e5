/**
 * Rock notes: short, dated records of what was said about a Rock. These helpers
 * only arrange notes for display; nothing here writes anything.
 */

export interface RockNote {
  id: string;
  rock_id: string;
  meeting_id: string | null;
  body: string;
  source: string;
  rock_status: string | null;
  milestones_complete: number | null;
  milestones_total: number | null;
  created_by: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface RockNoteSummary {
  id: string;
  rock_id: string;
  summary: string;
  status_signal: string;
  suggested_todos: Array<{ title: string }>;
  notes_through: string;
  note_count: number;
  rocks_included: number;
  generated_at: string;
}

export const NOTE_MAX_CHARS = 4000;
const TIME_ZONE = 'Australia/Sydney';

/** "Today, 3:40 pm AEDT", "Yesterday, ...", or "Tue 14 Oct, 3:40 pm AEDT". Always Sydney time. */
export function formatNoteTime(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d);
  const time = new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })
    .format(when)
    .replace(/\b(am|pm)\b/i, m => m.toLowerCase());
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const day = dayKey(when);
  if (day === today) return `Today, ${time}`;
  if (day === yesterday) return `Yesterday, ${time}`;
  const date = new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).format(when);
  return `${date.replace(',', '')}, ${time}`;
}

/** Date only, in Sydney time: "Tue 14 Oct". */
export function formatNoteDay(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)).replace(',', '');
}

export interface NoteWithChange extends RockNote {
  /** The Rock's status in the previous note on the same Rock, when it differs from this one. */
  statusChangedFrom: string | null;
}

/**
 * Newest first, each note carrying the status it moved away from. Compared per Rock so a
 * roll-up of several Rocks does not report one Rock's status as another's change.
 */
export function withStatusChanges(notes: readonly RockNote[]): NoteWithChange[] {
  const oldestFirst = [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastStatus = new Map<string, string | null>();
  const result = oldestFirst.map(note => {
    const previous = lastStatus.get(note.rock_id);
    lastStatus.set(note.rock_id, note.rock_status);
    const changed = lastStatus.has(note.rock_id) && previous !== undefined && previous !== null && note.rock_status !== null && previous !== note.rock_status;
    return { ...note, statusChangedFrom: changed ? previous! : null };
  });
  return result.reverse();
}

export interface LastTime {
  /** The meeting the notes came from, or null when they were written outside a meeting. */
  meetingId: string | null;
  at: string;
  notes: RockNote[];
}

/**
 * What was said the last time this Rock came up: the most recent meeting (or, for notes written
 * outside any meeting, the most recent day) that is not the current meeting. Notes from this
 * meeting are what is being written now, so they are never "last time".
 */
export function lastTimeNotes(notes: readonly RockNote[], currentMeetingId: string | undefined): LastTime | null {
  const earlier = notes
    .filter(note => !(currentMeetingId && note.meeting_id === currentMeetingId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (earlier.length === 0) return null;
  const first = earlier[0];
  const sameOccasion = (note: RockNote) =>
    first.meeting_id ? note.meeting_id === first.meeting_id : note.meeting_id === null && note.created_at.slice(0, 10) === first.created_at.slice(0, 10);
  const group = earlier.filter(sameOccasion).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { meetingId: first.meeting_id, at: first.created_at, notes: group };
}

/** How many notes were written after the summary last looked. */
export function notesSinceSummary(
  notes: readonly RockNote[],
  summary: Pick<RockNoteSummary, 'notes_through' | 'generated_at' | 'note_count'> | null | undefined,
): number {
  if (!summary) return notes.length;
  const through = new Date(summary.notes_through).getTime();
  const generated = new Date(summary.generated_at).getTime();
  const changed = notes.filter(note =>
    new Date(note.created_at).getTime() > through
    || (note.edited_at !== null && new Date(note.edited_at).getTime() > generated),
  ).length;
  // A deleted note no longer appears in the list, so the count mismatch signals that a summary
  // may still contain it. Keep the stale marker visible until a new summary is written.
  return Math.max(changed, notes.length === summary.note_count ? 0 : 1);
}

export const SIGNAL_LABEL: Record<string, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  unclear: 'Not clear from the notes',
};

export const progressText = (note: Pick<RockNote, 'milestones_complete' | 'milestones_total'>): string | null =>
  note.milestones_total === null || note.milestones_complete === null || note.milestones_total === 0
    ? null
    : `${note.milestones_complete} of ${note.milestones_total} milestones`;
