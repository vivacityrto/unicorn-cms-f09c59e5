import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useCallback, useEffect, useRef } from 'react';
import type { AuditSection, AuditResponse, AuditFinding, AuditAction, AuditDocument, TemplateQuestion } from '@/types/auditWorkspace';
import type { ClientAudit } from '@/types/clientAudits';

// ─── Audit Sections ───
export function useAuditSections(auditId: string | undefined) {
  return useQuery({
    queryKey: ['audit-sections', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audit_sections' as any)
        .select('*')
        .eq('audit_id', auditId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AuditSection[];
    },
  });
}

export function useInitializeSections(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ templateId }: { templateId: string | null }) => {
      if (!auditId) throw new Error('No audit ID');

      if (templateId) {
        // Template-driven: load template sections
        const { data: tplSections, error: tplErr } = await supabase
          .from('compliance_template_sections' as any)
          .select('*')
          .eq('template_id', templateId)
          .order('sort_order', { ascending: true });
        if (tplErr) throw tplErr;

        if (tplSections && tplSections.length > 0) {
          const inserts = (tplSections as any[]).map((s, i) => ({
            audit_id: auditId,
            template_section_id: s.id,
            standard_code: s.title,
            title: s.title,
            sort_order: s.sort_order ?? i,
            audit_phase: s.audit_phase || 'document_review',
          }));

          const { error } = await supabase
            .from('client_audit_sections' as any)
            .insert(inserts as any);
          if (error) throw error;
        }
      } else {
        // Freeform SRTO 2025: create 8 standard groups
        const standards = Array.from({ length: 8 }, (_, i) => ({
          audit_id: auditId,
          standard_code: `Standard ${i + 1}`,
          title: `Standard ${i + 1}`,
          sort_order: i + 1,
        }));

        const { error } = await supabase
          .from('client_audit_sections' as any)
          .insert(standards as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-sections', auditId] });
    },
  });
}

// ─── Template Questions ───
export function useAuditQuestions(templateSectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['audit-questions', templateSectionId],
    enabled: !!templateSectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_template_questions' as any)
        .select('*')
        .eq('section_id', templateSectionId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TemplateQuestion[];
    },
  });
}

// ─── Responses ───
export function useAuditResponses(auditId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['audit-responses', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audit_responses' as any)
        .select('*')
        .eq('audit_id', auditId);
      if (error) throw error;
      return (data || []) as unknown as AuditResponse[];
    },
  });

  const upsertResponse = useMutation({
    mutationFn: async (response: {
      audit_id: string;
      section_id: string;
      question_id: string;
      rating?: string | null;
      notes?: string | null;
      score?: number | null;
      is_flagged?: boolean;
      responded_by: string;
    }) => {
      // Check if response exists
      const { data: existing } = await supabase
        .from('client_audit_responses' as any)
        .select('id')
        .eq('audit_id', response.audit_id)
        .eq('question_id', response.question_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('client_audit_responses' as any)
          .update({
            rating: response.rating,
            notes: response.notes,
            score: response.score,
            is_flagged: response.is_flagged ?? false,
            responded_by: response.responded_by,
            responded_at: new Date().toISOString(),
          } as any)
          .eq('id', (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('client_audit_responses' as any)
          .insert({
            audit_id: response.audit_id,
            section_id: response.section_id,
            question_id: response.question_id,
            rating: response.rating,
            notes: response.notes,
            score: response.score,
            is_flagged: response.is_flagged ?? false,
            responded_by: response.responded_by,
            responded_at: new Date().toISOString(),
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-responses', auditId] });
    },
  });

  return { ...query, upsertResponse };
}

// ─── Findings ───
export function useAuditFindings(auditId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['audit-findings', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audit_findings' as any)
        .select('*')
        .eq('audit_id', auditId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AuditFinding[];
    },
  });

  const createFinding = useMutation({
    mutationFn: async (finding: Partial<AuditFinding> & { audit_id: string }) => {
      const { error } = await supabase
        .from('client_audit_findings' as any)
        .insert(finding as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-findings', auditId] });
      toast.success('Finding added');
    },
  });

  const deleteFinding = useMutation({
    mutationFn: async (findingId: string) => {
      const { error } = await supabase
        .from('client_audit_findings' as any)
        .delete()
        .eq('id', findingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-findings', auditId] });
      toast.success('Finding deleted');
    },
  });

  return { ...query, createFinding, deleteFinding };
}

// ─── Actions ───
export function useAuditActions(auditId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['audit-actions', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audit_actions' as any)
        .select('*')
        .eq('audit_id', auditId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AuditAction[];
    },
  });

  const createAction = useMutation({
    mutationFn: async (action: Partial<AuditAction> & { audit_id: string }) => {
      const { error } = await supabase
        .from('client_audit_actions' as any)
        .insert(action as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-actions', auditId] });
      toast.success('Action created');
    },
  });

  const updateAction = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<AuditAction>) => {
      const { error } = await supabase
        .from('client_audit_actions' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-actions', auditId] });
    },
  });

  const deleteAction = useMutation({
    mutationFn: async (actionId: string) => {
      const { error } = await supabase
        .from('client_audit_actions' as any)
        .delete()
        .eq('id', actionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-actions', auditId] });
      toast.success('Action deleted');
    },
  });

  return { ...query, createAction, updateAction, deleteAction };
}

// ─── Documents ───
export function useAuditDocuments(auditId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['audit-documents', auditId],
    enabled: !!auditId,
    refetchInterval: (query) => {
      const docs = query.state.data as AuditDocument[] | undefined;
      if (docs?.some(d => d.ai_status === 'processing')) return 3000;
      return false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audit_documents' as any)
        .select('*')
        .eq('audit_id', auditId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AuditDocument[];
    },
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ file, documentType, qualificationCode }: {
      file: File;
      documentType: string;
      qualificationCode?: string;
    }) => {
      if (!auditId) throw new Error('No audit ID');
      const filePath = `${auditId}/${crypto.randomUUID()}_${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from('audit-documents')
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase
        .from('client_audit_documents' as any)
        .insert({
          audit_id: auditId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          document_type: documentType,
          qualification_code: qualificationCode || null,
          ai_status: 'pending',
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
        } as any);
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-documents', auditId] });
      toast.success('Document uploaded');
    },
    onError: (err: any) => {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      await supabase.storage.from('audit-documents').remove([filePath]);
      const { error } = await supabase
        .from('client_audit_documents' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-documents', auditId] });
      toast.success('Document deleted');
    },
  });

  return { ...query, uploadDocument, deleteDocument };
}

// ─── Update Audit ───
export function useUpdateAudit(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<ClientAudit>) => {
      if (!auditId) throw new Error('No audit ID');
      const { error } = await supabase
        .from('client_audits' as any)
        .update(updates as any)
        .eq('id', auditId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
    },
  });
}

// ─── Status Transition ───
export function useAuditStatusTransition(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ status, audit }: { status: string; audit: ClientAudit }) => {
      if (!auditId) throw new Error('No audit ID');
      const updates: any = { status };
      if (status === 'complete') updates.closed_at = new Date().toISOString();

      const { error } = await supabase
        .from('client_audits' as any)
        .update(updates)
        .eq('id', auditId);
      if (error) throw error;

      let syncCount = 0;
      if (status === 'complete') {
        // Sync audit actions to client action items
        try {
          const { data } = await supabase
            .rpc('sync_audit_actions_to_client_items', { p_audit_id: auditId } as any);
          syncCount = (data as number) || 0;
        } catch {}

        try {
          await supabase.from('client_timeline_events' as any).insert({
            tenant_id: audit.subject_tenant_id,
            event_type: 'audit_completed',
            title: `Audit completed: ${audit.title}`,
            entity_type: 'client_audit',
            entity_id: auditId,
            source: 'internal',
            metadata: JSON.stringify({
              risk_rating: audit.risk_rating,
              score_pct: audit.score_pct,
            }),
          } as any);
        } catch {}
      }

      return syncCount;
    },
    onSuccess: (syncCount, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
      queryClient.invalidateQueries({ queryKey: ['client-audits-dashboard'] });
      if (status === 'complete' && syncCount > 0) {
        toast.success(`Audit marked complete. ${syncCount} corrective action${syncCount > 1 ? 's' : ''} added to client action plan.`);
      } else if (status === 'complete') {
        toast.success('Audit marked complete. No open actions to sync.');
      } else {
        toast.success('Status updated');
      }
    },
  });
}

// ─── Score Calculation ───
export function useAuditScore(
  auditId: string | undefined,
  responses: AuditResponse[] | undefined,
  questions: TemplateQuestion[] | undefined
) {
  const updateAudit = useUpdateAudit(auditId);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const calculate = useCallback(() => {
    if (!responses || !questions || !auditId) return;

    const answered = responses.filter(
      r => r.rating && !['not_applicable', 'not_sighted'].includes(r.rating)
    );
    const scoreTotal = answered.reduce((sum, r) => sum + (r.score ?? 0), 0);
    const scoreMax = answered.reduce((sum, r) => {
      const q = questions.find(q => q.id === r.question_id);
      return sum + (q?.score_compliant ?? 2);
    }, 0);
    const scorePct = scoreMax > 0 ? Math.round((scoreTotal / scoreMax) * 100) : null;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      updateAudit.mutate({
        score_total: scoreTotal,
        score_max: scoreMax,
        score_pct: scorePct,
      } as any);
    }, 1000);
  }, [responses, questions, auditId]);

  useEffect(() => {
    calculate();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [calculate]);
}

// ─── Section Summary & Risk Level ───
export function useUpdateSectionSummary(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sectionId, summary }: { sectionId: string; summary: string }) => {
      const { error } = await supabase
        .from('client_audit_sections' as any)
        .update({ section_summary: summary } as any)
        .eq('id', sectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-sections', auditId] });
    },
  });
}

export function useUpdateSectionRiskLevel(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sectionId, riskLevel }: { sectionId: string; riskLevel: string }) => {
      const { error } = await supabase
        .from('client_audit_sections' as any)
        .update({ risk_level: riskLevel } as any)
        .eq('id', sectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-sections', auditId] });
    },
  });
}

// ─── Internal Users for dropdowns ───
export function useInternalUsers() {
  return useQuery({
    queryKey: ['internal-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users' as any)
        .select('user_uuid, first_name, last_name, avatar_url')
        .eq('is_vivacity_internal', true);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        user_uuid: string;
        first_name: string;
        last_name: string;
        avatar_url: string | null;
      }>;
    },
  });
}
