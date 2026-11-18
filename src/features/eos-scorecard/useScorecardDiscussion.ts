import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { isOpenIssue, issueSourceFor } from '@/utils/rockDiscussion';

/**
 * The scorecard discussion table and the issue link column arrive in migration 20261118100000, so they are
 * not in the generated types yet. Until they are refreshed after the production apply, these two tables go
 * through a small hand-typed query interface: column names are plain strings, results are typed.
 */
interface DiscussionNoteRow {
  id: string;
  category: string;
  body: string;
  created_by: string;
  updated_at: string;
}

interface IssueRow {
  id: string;
  title: string;
  status: string | null;
  linked_scorecard_metric_id: string | null;
}

interface QueryError {
  message: string;
}

interface Query<T> extends PromiseLike<{ data: T | null; error: QueryError | null }> {
  select<U>(columns: string): Query<U[]>;
  eq(column: string, value: string): Query<T>;
  in(column: string, values: readonly string[]): Query<T>;
  is(column: string, value: null): Query<T>;
  order(column: string, options?: { ascending: boolean }): Query<T>;
  single(): Query<T extends readonly (infer U)[] ? U : T>;
}

interface LooseTable {
  select<U>(columns: string): Query<U[]>;
  insert(values: Record<string, unknown>): Query<unknown>;
  upsert(values: Record<string, unknown>, options: { onConflict: string }): Query<unknown>;
}

const loose = supabase as unknown as { from(table: string): LooseTable };

export interface ScorecardNote {
  id: string;
  category: string;
  body: string;
  createdBy: string;
  updatedAt: string;
}

export interface MetricIssue {
  id: string;
  title: string;
  status: string | null;
  metricId: string;
}

function messageOf(error: unknown, fallback: string): string {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : fallback;
}

/** Everyone's notes for this meeting, so the room sees what was written for each area. */
export function useScorecardNotes(meetingId: string | undefined, enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['scorecard-discussion-notes', meetingId],
    queryFn: async (): Promise<ScorecardNote[]> => {
      const { data, error } = await loose
        .from('eos_scorecard_discussion_notes')
        .select<DiscussionNoteRow>('id, category, body, created_by, updated_at')
        .eq('meeting_id', meetingId!)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((n) => ({ id: n.id, category: n.category, body: n.body, createdBy: n.created_by, updatedAt: n.updated_at }));
    },
    enabled: !!profile && enabled && !!meetingId,
  });
}

/** Save the caller's note for one area in this meeting. One note per person per area: saving again replaces it. */
export function useSaveScorecardNote(meetingId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: string; body: string }) => {
      if (!meetingId || !profile?.user_uuid) throw new Error('Open the note from a live meeting.');
      const body = input.body.trim();
      if (!body) throw new Error('Write something first.');
      const meeting = await loose.from('eos_meetings').select<{ tenant_id: number }>('tenant_id').eq('id', meetingId).single();
      if (meeting.error || !meeting.data) throw new Error(meeting.error?.message ?? 'The meeting was not found.');
      const { error } = await loose
        .from('eos_scorecard_discussion_notes')
        .upsert(
          { tenant_id: meeting.data.tenant_id, meeting_id: meetingId, category: input.category, body, created_by: profile.user_uuid },
          { onConflict: 'meeting_id,category,created_by' },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scorecard-discussion-notes', meetingId] }),
    onError: (error) => toast({ title: 'Could not save the note', description: messageOf(error, 'Nothing was saved.'), variant: 'destructive' }),
  });
}

/** Issues already raised for these measures, so the room can see what is waiting for IDS and avoid a duplicate. */
export function useMetricIssues(metricIds: readonly string[], enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['scorecard-metric-issues', metricIds],
    queryFn: async (): Promise<MetricIssue[]> => {
      if (metricIds.length === 0) return [];
      const { data, error } = await loose
        .from('eos_issues')
        .select<IssueRow>('id, title, status, linked_scorecard_metric_id')
        .in('linked_scorecard_metric_id', [...metricIds])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).flatMap((i) => (i.linked_scorecard_metric_id ? [{ id: i.id, title: i.title, status: i.status, metricId: i.linked_scorecard_metric_id }] : []));
    },
    enabled: !!profile && enabled && metricIds.length > 0,
  });
}

/** Ids of measures with at least one open issue, for the wrap-up. */
export function openIssueMetricIds(issues: readonly MetricIssue[]): Set<string> {
  return new Set(issues.filter((i) => isOpenIssue(i.status)).map((i) => i.metricId));
}

export interface RaiseScorecardIssueInput {
  title: string;
  description: string;
  metricId: string;
  meetingId?: string;
  meetingSegmentId?: string;
  meetingType?: string | null;
}

/** Raise an issue for a measure into the meeting's IDS queue: the same columns IDS writes, plus the link to the measure. */
export function useRaiseScorecardIssue() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RaiseScorecardIssueInput) => {
      const { data, error } = await loose
        .from('eos_issues')
        .insert({
          tenant_id: profile?.tenant_id ?? null,
          item_type: 'risk',
          title: input.title.trim(),
          description: input.description,
          linked_scorecard_metric_id: input.metricId,
          meeting_id: input.meetingId,
          meeting_segment_id: input.meetingSegmentId,
          source: issueSourceFor(input.meetingType),
          created_by: profile?.user_uuid,
        })
        .select<{ id: string }>('id')
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      for (const queryKey of [['meeting-issues'], ['risks-opportunities'], ['eos-issues'], ['scorecard-metric-issues']]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => toast({ title: 'Could not raise the issue', description: messageOf(error, 'Nothing was added.'), variant: 'destructive' }),
  });
}
