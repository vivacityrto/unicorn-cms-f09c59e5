import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MinutesContent {
  meeting_title: string;
  meeting_date: string;
  meeting_time: string;
  duration_minutes: number;
  attendees: string[];
  apologies: string[];
  agenda_items: string[];
  discussion_notes: string;
  decisions: string[];
  actions: Array<{
    action: string;
    owner: string;
    due_date: string;
  }>;
  next_meeting: string;
}

export interface MeetingMinutes {
  id: string;
  tenant_id: number;
  meeting_id: string;
  version: number;
  status: 'draft' | 'published';
  title: string;
  content: MinutesContent;
  pdf_storage_path: string | null;
  pdf_document_id: string | null;
  published_at: string | null;
  published_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const EMPTY_CONTENT: MinutesContent = {
  meeting_title: '',
  meeting_date: '',
  meeting_time: '',
  duration_minutes: 0,
  attendees: [],
  apologies: [],
  agenda_items: [],
  discussion_notes: '',
  decisions: [],
  actions: [],
  next_meeting: '',
};

// Use raw fetch since types aren't regenerated yet
async function fetchFromTable(table: string, params: Record<string, string>, token: string) {
  const url = new URL(`${(supabase as any).supabaseUrl}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString(), {
    headers: {
      'apikey': (supabase as any).supabaseKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.statusText}`);
  return res.json();
}

async function upsertToTable(table: string, data: Record<string, unknown>, token: string) {
  const url = `${(supabase as any).supabaseUrl}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': (supabase as any).supabaseKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to upsert ${table}: ${errText}`);
  }
  return res.json();
}

async function patchTable(table: string, id: string, data: Record<string, unknown>, token: string) {
  const url = `${(supabase as any).supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': (supabase as any).supabaseKey,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to patch ${table}: ${errText}`);
  }
  return res.json();
}

export function useTeamsMeetingMinutes(meetingId: string | null) {
  const queryClient = useQueryClient();

  const { data: minutes, isLoading } = useQuery({
    queryKey: ['meeting-minutes', meetingId],
    queryFn: async () => {
      if (!meetingId) return null;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const rows = await fetchFromTable('meeting_minutes', {
        'meeting_id': `eq.${meetingId}`,
        'order': 'version.desc',
        'limit': '1',
      }, session.access_token);

      if (!rows || rows.length === 0) return null;
      const row = rows[0];
      return {
        ...row,
        content: typeof row.content === 'string' ? JSON.parse(row.content) : (row.content || EMPTY_CONTENT),
      } as MeetingMinutes;
    },
    enabled: !!meetingId,
  });

  const saveDraftMutation = useMutation({
    mutationFn: async ({ minutesId, content, title }: { minutesId: string; content: MinutesContent; title?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const updates: Record<string, unknown> = {
        content,
        updated_at: new Date().toISOString(),
      };
      if (title) updates.title = title;

      await patchTable('meeting_minutes', minutesId, updates, session.access_token);
    },
    onSuccess: () => {
      toast.success('Minutes saved');
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] });
    },
    onError: () => {
      toast.error('Failed to save minutes');
    },
  });

  const publishMinutesMutation = useMutation({
    mutationFn: async (minutesId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('publish-meeting-minutes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { minutes_id: minutesId },
      });

      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Minutes published as PDF to client portal');
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] });
    },
    onError: (error) => {
      console.error('Publish minutes failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish minutes');
    },
  });

  return {
    minutes,
    isLoading,
    saveDraft: saveDraftMutation.mutate,
    isSaving: saveDraftMutation.isPending,
    publishMinutes: publishMinutesMutation.mutate,
    isPublishing: publishMinutesMutation.isPending,
  };
}
