import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { isEchoOf, speakerOf } from '@/lib/dictation';

/**
 * Helpers for letting several attendees edit the same IDS issue at once.
 *
 * The IDS dialog used to be facilitator-only, so a plain "last save wins"
 * update was fine. With everyone able to write, two people typing into the
 * same discussion notes / solution would silently overwrite each other. These
 * helpers add (1) a guarded save that detects a concurrent edit to that same
 * field and (2) the rules for when a live update from someone else may replace
 * the local text.
 */

export type IssueTextField = 'outcome_note' | 'solution';

/** Thrown when the field changed since the value the caller started editing. */
export class IssueEditConflictError extends Error {
  constructor() {
    super('This text was changed by someone else while you were editing');
    this.name = 'IssueEditConflictError';
  }
}

/**
 * Saves one text field only if it still holds `expected` (compare-and-swap on
 * that field alone). Checking the field, not the row's `updated_at`, means an
 * unrelated change — someone moving the issue to Discussing, say — is not a
 * false conflict. `expected` is the value as last loaded from the server
 * (`null` when the column is null).
 */
export async function saveIssueTextField(
  issueId: string,
  field: IssueTextField,
  value: string,
  expected: string | null
): Promise<void> {
  const patch: { outcome_note?: string; solution?: string } = { [field]: value };
  const base = supabase.from('eos_issues').update(patch).eq('id', issueId);
  const guarded = expected === null ? base.is(field, null) : base.eq(field, expected);
  const { data, error } = await guarded.select('id');

  if (error) throw error;
  if (!data || data.length === 0) throw new IssueEditConflictError();
}

/** Latest saved value of a text field, used to resolve a conflict. */
export async function fetchIssueTextField(
  issueId: string,
  field: IssueTextField
): Promise<string | null> {
  const { data, error } = await supabase
    .from('eos_issues')
    .select(field)
    .eq('id', issueId)
    .single();

  if (error) throw error;
  return (data as unknown as Record<string, string | null>)[field] ?? null;
}

/**
 * Combines someone else's saved text with what this user typed so a conflict
 * never loses either side. Nothing is duplicated: not when the saved text already contains
 * what was typed, not for lines both sides share, and not for a dictated line that repeats
 * what a saved line says.
 */
export function mergeConflictingText(remote: string, local: string): string {
  const r = remote.trim();
  const l = local.trim();
  if (!l) return remote;
  if (!r) return local;
  if (r.includes(l)) return remote;
  if (l.includes(r)) return local;
  // Add only the lines that are really new. Both sides usually start from the same saved text,
  // so repeating the typed side whole would repeat everything they share. When two people dictate
  // on one call each microphone hears the other, so a labelled line that says what a saved line
  // from a DIFFERENT labelled speaker already says is dropped too. Nothing else is judged by
  // wording: a line you edited, or one of your own, is kept even when it resembles a saved one.
  const savedLines = r.split('\n').map(line => line.trim()).filter(Boolean);
  const added = l
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line || savedLines.includes(line)) return false;
      const speaker = speakerOf(line);
      return !(speaker && savedLines.some(saved => {
        const savedSpeaker = speakerOf(saved);
        return savedSpeaker !== null && savedSpeaker !== speaker && isEchoOf(line, saved);
      }));
    });
  return added.length === 0 ? remote : `${r}\n\n${added.join('\n')}`;
}

/**
 * A live update from another attendee may replace the local text only when the
 * user has no unsaved changes (`local` still equals the last known saved
 * value, `baseline`) and the saved value actually moved. Otherwise the local
 * draft must be left alone — it is saved (and reconciled) on blur.
 */
export function shouldAdoptRemoteText(local: string, baseline: string, remote: string): boolean {
  return local === baseline && remote !== baseline;
}

export interface IssueTodoInput {
  title: string;
  owner_id: string;
  due_date: string;
}

/**
 * Creates to-dos from an issue immediately, linked to the meeting, through the
 * existing `create_todos_from_issue` RPC. Used at the moment the user clicks
 * "Add To-Do" (not deferred until the issue is marked solved).
 */
export async function createIssueTodos(
  issueId: string,
  meetingId: string | null,
  todos: IssueTodoInput[]
): Promise<void> {
  if (todos.length === 0) return;
  const { error } = await supabase.rpc('create_todos_from_issue', {
    p_issue_id: issueId,
    p_todos: todos as unknown as Json,
    p_meeting_id: meetingId,
  });
  if (error) throw error;
}
