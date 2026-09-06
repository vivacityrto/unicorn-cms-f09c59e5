import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { QueryCacheNotifyEvent } from '@tanstack/react-query';

export type CompletionState =
  | 'unanswered'
  | 'finding_required'
  | 'notes_required'
  | 'complete';

export interface ResponseCompletion {
  response_id: string;
  audit_id: string;
  section_id: string | null;
  question_id: string | null;
  rating: string | null;
  has_notes: boolean;
  has_finding: boolean;
  is_complete: boolean;
  completion_state: CompletionState;
}

export interface SectionCompletion {
  section_id: string;
  audit_id: string;
  title: string;
  audit_phase: string | null;
  sort_order: number;
  total_questions: number;
  complete_count: number;
  findings_required: number;
  notes_required: number;
  unanswered: number;
  section_state: 'empty' | 'complete' | 'rated_incomplete' | 'in_progress';
}

export interface AuditProgress {
  audit_id: string;
  total_questions: number;
  complete_count: number;
  findings_required: number;
  notes_required: number;
  unanswered: number;
}

/**
 * Per-audit progress rollup. Drives the sidebar progress block.
 */
export function useAuditProgress(auditId: string | undefined) {
  const queryClient = useQueryClient();

  // Re-fetch this view whenever responses or findings invalidate.
  useEffect(() => {
    if (!auditId) return;
    const unsub = queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
      const key = event?.query?.queryKey?.[0];
      const id = event?.query?.queryKey?.[1];
      if (
        (key === 'audit-responses' || key === 'audit-findings') &&
        id === auditId &&
        event.type === 'updated'
      ) {
        queryClient.invalidateQueries({ queryKey: ['audit-completion-progress', auditId] });
        queryClient.invalidateQueries({ queryKey: ['audit-completion-sections', auditId] });
        queryClient.invalidateQueries({ queryKey: ['audit-completion-responses', auditId] });
      }
    });
    return () => unsub();
  }, [auditId, queryClient]);

  return useQuery({
    queryKey: ['audit-completion-progress', auditId],
    enabled: !!auditId,
    queryFn: async (): Promise<AuditProgress | null> => {
      const { data, error } = await supabase
        .from('v_client_audit_progress')
        .select('*')
        .eq('audit_id', auditId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AuditProgress) || null;
    },
  });
}

/**
 * Per-section rollup keyed by section_id.
 */
export function useAuditSectionCompletion(auditId: string | undefined) {
  return useQuery({
    queryKey: ['audit-completion-sections', auditId],
    enabled: !!auditId,
    queryFn: async (): Promise<Record<string, SectionCompletion>> => {
      const { data, error } = await supabase
        .from('v_client_audit_section_completion')
        .select('*')
        .eq('audit_id', auditId);
      if (error) throw error;
      const map: Record<string, SectionCompletion> = {};
      for (const row of (data || []) as unknown as SectionCompletion[]) {
        map[row.section_id] = row;
      }
      return map;
    },
  });
}

/**
 * Per-response state keyed by response_id.
 */
export function useResponseCompletion(auditId: string | undefined) {
  return useQuery({
    queryKey: ['audit-completion-responses', auditId],
    enabled: !!auditId,
    queryFn: async (): Promise<Record<string, ResponseCompletion>> => {
      const { data, error } = await supabase
        .from('v_client_audit_response_completion')
        .select('*')
        .eq('audit_id', auditId);
      if (error) throw error;
      const map: Record<string, ResponseCompletion> = {};
      for (const row of (data || []) as unknown as ResponseCompletion[]) {
        map[row.response_id] = row;
      }
      return map;
    },
  });
}
