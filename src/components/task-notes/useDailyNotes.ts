import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { hydrateLegacyNote } from './hydrateLegacyNote';
import type { DailyNote } from './types';

const TABLE = 'user_daily_notes';

export const noteQueryKeys = {
  all: (userId: string) => ['user_daily_notes', userId] as const,
  date: (userId: string, dateStr: string) => ['user_daily_notes', userId, 'date', dateStr] as const,
  month: (userId: string, monthKey: string) => ['user_daily_notes', userId, 'month', monthKey] as const,
  search: (userId: string, q: string) => ['user_daily_notes', userId, 'search', q] as const,
  previous: (userId: string, dateStr: string) => ['user_daily_notes', userId, 'previous', dateStr] as const,
  range: (userId: string, from: string, to: string) =>
    ['user_daily_notes', userId, 'range', from, to] as const,
  summary: (userId: string, mode: string, from: string, to: string) =>
    ['user_daily_notes', userId, 'summary', mode, from, to] as const,
};

export function useNotesForRange(
  userId: string | undefined,
  from: string,
  to: string,
  enabled = true,
) {
  return useQuery({
    queryKey: noteQueryKeys.range(userId ?? '', from, to),
    enabled: !!userId && enabled,
    queryFn: async (): Promise<DailyNote[]> => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('*')
        .eq('user_id', userId!)
        .gte('note_date', from)
        .lte('note_date', to)
        .order('note_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map(hydrateLegacyNote);
    },
  });
}

async function fetchByDate(userId: string, dateStr: string): Promise<DailyNote[]> {
  const { data, error } = await supabase
    .from(TABLE as any)
    .select('*')
    .eq('user_id', userId)
    .eq('note_date', dateStr)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map(hydrateLegacyNote);
}

export function useNotesForDate(userId: string | undefined, date: Date, enabled = true) {
  const dateStr = format(date, 'yyyy-MM-dd');
  return useQuery({
    queryKey: noteQueryKeys.date(userId ?? '', dateStr),
    enabled: !!userId && enabled,
    queryFn: () => fetchByDate(userId!, dateStr),
  });
}

export function useNotesForMonth(userId: string | undefined, month: Date, enabled = true) {
  const from = format(startOfMonth(month), 'yyyy-MM-dd');
  const to = format(endOfMonth(month), 'yyyy-MM-dd');
  const monthKey = format(month, 'yyyy-MM');
  return useQuery({
    queryKey: noteQueryKeys.month(userId ?? '', monthKey),
    enabled: !!userId && enabled,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('note_date')
        .eq('user_id', userId!)
        .gte('note_date', from)
        .lte('note_date', to);
      if (error) throw error;
      const set = new Set<string>();
      ((data ?? []) as any[]).forEach((r) => r?.note_date && set.add(String(r.note_date)));
      return Array.from(set);
    },
  });
}

export function useSearchNotes(userId: string | undefined, query: string, enabled = true) {
  const q = query.trim();
  return useQuery({
    queryKey: noteQueryKeys.search(userId ?? '', q.toLowerCase()),
    enabled: !!userId && enabled && q.length > 0,
    queryFn: async (): Promise<DailyNote[]> => {
      // Fetch all rows for the user; filter client-side across title/body/items.
      // user_daily_notes is small per-user, this is a fine tradeoff and
      // avoids indexing a jsonb text column.
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('*')
        .eq('user_id', userId!)
        .order('note_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const notes = ((data ?? []) as any[]).map(hydrateLegacyNote);
      const needle = q.toLowerCase();
      return notes.filter((n) => {
        if (n.title.toLowerCase().includes(needle)) return true;
        if (n.items.some((it) => it.text.toLowerCase().includes(needle))) return true;
        const bodyText = n.body.replace(/<[^>]*>/g, ' ').toLowerCase();
        if (bodyText.includes(needle)) return true;
        if ((n.content || '').toLowerCase().includes(needle)) return true;
        return false;
      });
    },
  });
}

export function usePreviousDayUnfinished(userId: string | undefined, date: Date, enabled = true) {
  const prevDate = subDays(date, 1);
  const prevStr = format(prevDate, 'yyyy-MM-dd');
  return useQuery({
    queryKey: noteQueryKeys.previous(userId ?? '', prevStr),
    enabled: !!userId && enabled,
    queryFn: async () => {
      const notes = await fetchByDate(userId!, prevStr);
      const unfinished = notes.flatMap((n) => n.items.filter((it) => !it.done));
      return { prevDate: prevStr, notes, unfinishedCount: unfinished.length };
    },
  });
}
