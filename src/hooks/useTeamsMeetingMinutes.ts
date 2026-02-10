import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MinutesContent {
  meeting_title: string;
  meeting_date: string;
  meeting_time: string;
  meeting_type: string;
  duration_minutes: number;
  facilitator: string;
  minute_taker: string;
  attendees: string[];
  apologies: string[];
  agenda_items: string[];
  discussion_notes: string;
  decisions: string[];
  actions: Array<{
    action: string;
    owner: string;
    due_date: string;
    status: string;
  }>;
  next_meeting: string;
  // AI metadata
  ai_generated?: boolean;
  ai_generated_at?: string;
  ai_generated_by?: string;
  ai_source_artifact_id?: string;
  ai_summary_version?: number;
  ai_notes?: string;
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

export interface AiProposedMinutes {
  agenda_items: string[];
  discussion_notes: string;
  decisions: string[];
  actions: Array<{ action: string; owner: string; due_date: string; status: string }>;
  risks: string[];
  open_questions: string[];
  confidence: Record<string, string>;
}

const EMPTY_CONTENT: MinutesContent = {
  meeting_title: '',
  meeting_date: '',
  meeting_time: '',
  meeting_type: '',
  duration_minutes: 0,
  facilitator: '',
  minute_taker: '',
  attendees: [],
  apologies: [],
  agenda_items: [],
  discussion_notes: '',
  decisions: [],
  actions: [],
  next_meeting: '',
};

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
      const content = typeof row.content === 'string' ? JSON.parse(row.content) : (row.content || {});
      return {
        ...row,
        content: { ...EMPTY_CONTENT, ...content },
      } as MeetingMinutes;
    },
    enabled: !!meetingId,
  });

  // Check if AI is enabled
  const { data: aiSettings } = useQuery({
    queryKey: ['app-settings-ai'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('minutes_ai_enabled, minutes_ai_require_review')
        .single();
      return data;
    },
    staleTime: 60_000,
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
    onSuccess: (data: any) => {
      const msg = data?.regenerated
        ? `Minutes regenerated (v${data.version}) and published to client portal`
        : 'Minutes published to client portal';
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to publish minutes');
    },
  });

  const generateFromTranscriptMutation = useMutation({
    mutationFn: async (minutesId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('generate-minutes-from-transcript', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { meeting_id: meetingId, minutes_id: minutesId },
      });

      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error((data as any).error);
      return data as { success: boolean; run_id: string; proposed: AiProposedMinutes };
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'AI generation failed');
    },
  });

  // Apply AI proposed content to the draft
  const applyAiContent = async (minutesId: string, proposed: AiProposedMinutes, currentContent: MinutesContent) => {
    const now = new Date().toISOString();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const mergedContent: MinutesContent = {
      ...currentContent,
      agenda_items: proposed.agenda_items.length > 0 ? proposed.agenda_items : currentContent.agenda_items,
      discussion_notes: proposed.discussion_notes || currentContent.discussion_notes,
      decisions: proposed.decisions.length > 0 ? proposed.decisions : currentContent.decisions,
      actions: proposed.actions.length > 0 ? proposed.actions : currentContent.actions,
      ai_generated: true,
      ai_generated_at: now,
      ai_generated_by: session.user.id,
      ai_summary_version: (currentContent.ai_summary_version || 0) + 1,
      ai_notes: 'Draft generated from transcript summary. Review required before publishing.',
    };

    await patchTable('meeting_minutes', minutesId, {
      content: mergedContent,
      updated_at: now,
    }, session.access_token);

    // Audit: applied
    await supabase.from('audit_events' as any).insert({
      entity: 'meeting_minutes',
      entity_id: minutesId,
      action: 'minutes_ai_applied_to_draft',
      user_id: session.user.id,
      details: { meeting_id: meetingId },
    });

    toast.success('AI draft applied to minutes');
    queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] });
  };

  // Discard AI proposal (audit only)
  const discardAiContent = async (minutesId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase.from('audit_events' as any).insert({
      entity: 'meeting_minutes',
      entity_id: minutesId,
      action: 'minutes_ai_discarded',
      user_id: session.user.id,
      details: { meeting_id: meetingId },
    });

    toast.info('AI draft discarded');
  };

  return {
    minutes,
    isLoading,
    aiEnabled: aiSettings?.minutes_ai_enabled ?? false,
    aiRequireReview: aiSettings?.minutes_ai_require_review ?? true,
    saveDraft: saveDraftMutation.mutate,
    isSaving: saveDraftMutation.isPending,
    publishMinutes: publishMinutesMutation.mutate,
    isPublishing: publishMinutesMutation.isPending,
    generateFromTranscript: generateFromTranscriptMutation.mutate,
    isGenerating: generateFromTranscriptMutation.isPending,
    aiProposal: generateFromTranscriptMutation.data?.proposed ?? null,
    aiRunId: generateFromTranscriptMutation.data?.run_id ?? null,
    applyAiContent,
    discardAiContent,
    resetAiProposal: generateFromTranscriptMutation.reset,
  };
}
