import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { noteQueryKeys } from './useDailyNotes';
import type { DailyNote } from './types';

export interface NotesSummary {
  headline: string;
  summary: string;
  open_count: number;
}

export type RangeMode = 'day' | 'week' | 'month';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildDigest(notes: DailyNote[]): string {
  const byDate = new Map<string, DailyNote[]>();
  for (const n of notes) {
    const list = byDate.get(n.note_date) ?? [];
    list.push(n);
    byDate.set(n.note_date, list);
  }
  const dates = Array.from(byDate.keys()).sort();
  const parts: string[] = [];
  for (const d of dates) {
    parts.push(`## ${d}`);
    for (const n of byDate.get(d)!) {
      const title = n.title.trim() || '(untitled)';
      parts.push(`### ${title}`);
      const done = n.items.filter((i) => i.done).map((i) => `- [x] ${i.text}`);
      const open = n.items.filter((i) => !i.done).map((i) => `- [ ] ${i.text}`);
      if (done.length) parts.push('Done:', ...done);
      if (open.length) parts.push('Open:', ...open);
      const body = stripHtml(n.body || n.content || '');
      if (body) parts.push('Notes:', body);
    }
  }
  return parts.join('\n');
}

interface Args {
  userId: string;
  rangeMode: RangeMode;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  notes: DailyNote[];
}

export function useNotesSummary(args: Args) {
  const qc = useQueryClient();
  const { userId, rangeMode, periodStart, periodEnd, periodLabel, notes } = args;

  const query = useQuery({
    queryKey: noteQueryKeys.summary(userId, rangeMode, periodStart, periodEnd),
    enabled: false,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<NotesSummary> => {
      const digest = buildDigest(notes);
      if (!digest.trim()) throw new Error('No notes in the selected period.');
      const { data, error } = await supabase.functions.invoke('summarize-daily-notes', {
        body: {
          user_id: userId,
          period_label: periodLabel,
          period_start: periodStart,
          period_end: periodEnd,
          digest,
        },
      });
      if (error) throw new Error(error.message ?? 'Summary failed');
      if (!data || typeof data !== 'object') throw new Error('Invalid summary response');
      return data as NotesSummary;
    },
  });

  const regenerate = async () => {
    await qc.invalidateQueries({
      queryKey: noteQueryKeys.summary(userId, rangeMode, periodStart, periodEnd),
    });
    try {
      await query.refetch({ throwOnError: true });
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate summary');
    }
  };

  const generate = async () => {
    try {
      await query.refetch({ throwOnError: true });
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate summary');
    }
  };

  return {
    data: query.data,
    isFetching: query.isFetching,
    hasResult: !!query.data,
    generate,
    regenerate,
  };
}
