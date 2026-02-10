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
    action_id?: string;
    action: string;
    owner: string;
    due_date: string;
    status: string;
    task_id?: string;
    package_id?: number | null;
    assigned_to_user_uuid?: string | null;
    assigned_to_role?: string | null;
    confidence?: string;
  }>;
  next_meeting: string;
  // AI metadata
  ai_generated?: boolean;
  ai_generated_at?: string;
  ai_generated_by?: string;
  ai_source_artifact_id?: string;
  ai_summary_version?: number;
  ai_notes?: string;
  // Copilot source metadata
  source?: 'manual' | 'copilot';
  source_pasted_at?: string;
  source_pasted_by?: string;
  raw_input?: string;
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

export interface CopilotExtracted {
  attendees: string[];
  summary: string;
  decisions: string[];
  actions: Array<{ action: string; owner: string; due_date: string; status: string }>;
  confidence: Record<string, string>;
}

export const EMPTY_CONTENT: MinutesContent = {
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

  // ── One-click draft generation ─────────────────────────────────────
  const generateDraftMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('generate-minutes-draft', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { meeting_id: meetingId },
      });

      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error((data as any).error);
      return data as {
        success: boolean;
        minutes_id: string;
        version: number;
        attendees: Array<{ display_name: string; email: string | null; is_external: boolean; attendance_status: string }>;
        attendees_count: number;
        graph_synced: boolean;
        auto_fetch_enabled: boolean;
        recap_found: boolean;
        recap_source: string | null;
        extracted: CopilotExtracted | null;
        needs_copilot_input: boolean;
        warnings: string[];
      };
    },
    onSuccess: (data) => {
      if (data.recap_found && data.extracted) {
        toast.success(`Draft created with ${data.attendees_count} attendees and Copilot recap auto-populated`);
      } else {
        const msg = data.graph_synced
          ? `Draft created with ${data.attendees_count} attendees from Microsoft`
          : `Draft created with ${data.attendees_count} attendees`;
        toast.success(msg);
      }
      if (data.warnings?.length) {
        data.warnings.forEach((w) => toast.warning(w));
      }
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Draft generation failed');
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

  // ── Task creation from minutes actions ──────────────────────────────
  const createTasksMutation = useMutation({
    mutationFn: async ({ minutesId, actions }: { minutesId: string; actions: MinutesContent['actions'] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      // Ensure each action has a stable action_id
      const actionsWithIds = actions.map((a, idx) => ({
        ...a,
        action_id: a.action_id || `action-${idx}-${Date.now()}`,
      }));

      const { data, error } = await supabase.functions.invoke('create-tasks-from-minutes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { minutes_id: minutesId, actions: actionsWithIds },
      });

      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error((data as any).error);
      return data as { success: boolean; created: number; skipped: number; total: number; tasks: Array<{ task_id: string; action_id: string }>; errors: Array<{ action_id: string; error: string }> };
    },
    onSuccess: (data) => {
      if (data.created > 0) {
        toast.success(`${data.created} task${data.created > 1 ? 's' : ''} created`);
      }
      if (data.skipped > 0) {
        toast.info(`${data.skipped} task${data.skipped > 1 ? 's' : ''} already existed`);
      }
      if (data.errors?.length > 0) {
        toast.error(`${data.errors.length} task${data.errors.length > 1 ? 's' : ''} failed`);
      }
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-action-tasks', meetingId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Task creation failed');
    },
  });

  // Query existing action tasks
  const { data: actionTasks } = useQuery({
    queryKey: ['meeting-action-tasks', meetingId],
    queryFn: async () => {
      if (!meetingId) return [];
      const { data } = await supabase
        .from('meeting_action_tasks' as any)
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });
      return ((data as unknown) || []) as Array<{
        id: string;
        action_id: string;
        title: string;
        status: string;
        due_date: string | null;
        assigned_to_user_uuid: string | null;
        assigned_to_role: string | null;
        package_id: number | null;
      }>;
    },
    enabled: !!meetingId,
  });

  // ── Copilot extraction ─────────────────────────────────────────────
  const extractCopilotMutation = useMutation({
    mutationFn: async (pastedText: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('extract-copilot-minutes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { meeting_id: meetingId, pasted_text: pastedText },
      });

      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error((data as any).error);
      return data as { success: boolean; extracted: CopilotExtracted; store_raw: boolean };
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Copilot extraction failed');
    },
  });

  // Apply Copilot extracted content to the draft
  const applyCopilotContent = async (
    minutesId: string,
    extracted: CopilotExtracted,
    currentContent: MinutesContent,
    storeRaw: boolean,
    rawInput?: string,
  ) => {
    const now = new Date().toISOString();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const mergedContent: MinutesContent = {
      ...currentContent,
      attendees: extracted.attendees.length > 0 ? extracted.attendees : currentContent.attendees,
      discussion_notes: extracted.summary || currentContent.discussion_notes,
      decisions: extracted.decisions.length > 0 ? extracted.decisions : currentContent.decisions,
      actions: extracted.actions.length > 0 ? extracted.actions : currentContent.actions,
      source: 'copilot',
      source_pasted_at: now,
      source_pasted_by: session.user.id,
      ai_notes: 'Imported from Teams Copilot. Review required.',
    };

    if (storeRaw && rawInput) {
      mergedContent.raw_input = rawInput;
    }

    await patchTable('meeting_minutes', minutesId, {
      content: mergedContent,
      updated_at: now,
    }, session.access_token);

    await supabase.from('audit_events' as any).insert({
      entity: 'meeting_minutes',
      entity_id: minutesId,
      action: 'minutes_copilot_applied_to_draft',
      user_id: session.user.id,
      details: {
        meeting_id: meetingId,
        counts: {
          attendees: extracted.attendees.length,
          decisions: extracted.decisions.length,
          actions: extracted.actions.length,
        },
      },
    });

    toast.success('Copilot minutes applied to draft');
    queryClient.invalidateQueries({ queryKey: ['meeting-minutes', meetingId] });
  };

  // Discard Copilot extraction (audit only)
  const discardCopilotContent = async (minutesId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase.from('audit_events' as any).insert({
      entity: 'meeting_minutes',
      entity_id: minutesId,
      action: 'minutes_copilot_discarded',
      user_id: session.user.id,
      details: { meeting_id: meetingId },
    });

    toast.info('Copilot extraction discarded');
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
    // One-click draft
    generateDraft: generateDraftMutation.mutate,
    isGeneratingDraft: generateDraftMutation.isPending,
    draftResult: generateDraftMutation.data ?? null,
    resetDraftResult: generateDraftMutation.reset,
    // Copilot
    extractCopilot: extractCopilotMutation.mutate,
    isExtracting: extractCopilotMutation.isPending,
    copilotExtracted: extractCopilotMutation.data?.extracted ?? null,
    copilotStoreRaw: extractCopilotMutation.data?.store_raw ?? false,
    applyCopilotContent,
    discardCopilotContent,
    resetCopilotExtraction: extractCopilotMutation.reset,
    // Task creation
    createTasks: createTasksMutation.mutate,
    isCreatingTasks: createTasksMutation.isPending,
    actionTasks: actionTasks ?? [],
  };
}
