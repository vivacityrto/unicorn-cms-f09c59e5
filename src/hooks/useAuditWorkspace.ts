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

      // Server-side idempotency guard: the caller's own "already initialized"
      // check is local component state, which resets on every fresh mount and
      // can't protect against a stale/empty read of the sections query firing
      // this mutation again - that previously duplicated a whole audit's
      // sections (and any responses already entered against them) each time
      // it re-fired. Re-check for existing rows here, where it's authoritative.
      const { count: existingCount, error: existingErr } = await supabase
        .from('client_audit_sections' as any)
        .select('id', { count: 'exact', head: true })
        .eq('audit_id', auditId);
      if (existingErr) throw existingErr;
      if (existingCount && existingCount > 0) return;

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

// ─── Template Framework (for Quality Area mapping in QuestionGuidance) ───
export function useAuditTemplateFramework(templateId: string | null | undefined) {
  return useQuery({
    queryKey: ['audit-template-framework', templateId],
    enabled: !!templateId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_templates' as any)
        .select('framework')
        .eq('id', templateId)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.framework ?? null) as string | null;
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
      // Atomic upsert on (audit_id, question_id) — a prior check-then-insert/update
      // pattern here raced under near-simultaneous saves (e.g. a debounced note
      // save landing next to a rating click) and could silently fork a question
      // into duplicate rows. See docs/audit-log/entries/2026-08-11-audit-response-duplicate-race.md.
      const { error } = await supabase
        .from('client_audit_responses' as any)
        .upsert(
          {
            audit_id: response.audit_id,
            section_id: response.section_id,
            question_id: response.question_id,
            rating: response.rating,
            notes: response.notes,
            score: response.score,
            is_flagged: response.is_flagged ?? false,
            responded_by: response.responded_by,
            responded_at: new Date().toISOString(),
          } as any,
          { onConflict: 'audit_id,question_id' },
        );
      if (error) throw error;
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
      // Strip server-managed fields. finding_code is auto-generated by DB trigger;
      // standard_reference is legacy and replaced by regulatory_reference.
      const { finding_code: _fc, standard_reference: _sr, ...payload } = finding as any;
      const { error } = await supabase
        .from('client_audit_findings' as any)
        .insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-findings', auditId] });
      toast.success('Finding added');
    },
  });

  const updateFinding = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<AuditFinding>) => {
      const { error } = await supabase
        .from('client_audit_findings' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-findings', auditId] });
      toast.success('Finding updated');
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

  return { ...query, createFinding, updateFinding, deleteFinding };
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
      // risk_rating is derived server-side from finding priorities — never write it from the client.
      const { risk_rating: _rr, ...safeUpdates } = updates as any;
      const { error } = await supabase
        .from('client_audits' as any)
        .update(safeUpdates as any)
        .eq('id', auditId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-audit', auditId] });
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error?.message || 'Unknown error'}`);
    },
  });
}

// ─── Status Transition ───
export function useAuditStatusTransition(auditId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ status, audit }: { status: string; audit: ClientAudit }) => {
      if (!auditId) throw new Error('No audit ID');

      let syncCount = 0;
      if (status === 'complete') {
        // Sync corrective actions to the client action plan BEFORE marking
        // the audit complete, not after. If this RPC fails, the mutation
        // throws and the status update below never runs — an auditor
        // closing out an audit with real findings must not be able to reach
        // "complete" while those actions silently failed to reach the
        // client's action plan. (sync_audit_actions_to_client_items is
        // idempotent per audit, so retrying "Mark Complete" after a failure
        // here is safe.)
        const { data, error: syncError } = await supabase
          .rpc('sync_audit_actions_to_client_items', { p_audit_id: auditId } as any);
        if (syncError) throw syncError;
        syncCount = (data as number) || 0;
      }

      const updates: any = { status };
      if (status === 'complete') updates.closed_at = new Date().toISOString();

      const { error } = await supabase
        .from('client_audits' as any)
        .update(updates)
        .eq('id', auditId);
      if (error) throw error;

      if (status === 'complete') {
        try {
          await supabase.from('client_timeline_events' as any).insert({
            tenant_id: audit.subject_tenant_id,
            client_id: String(audit.subject_tenant_id),
            event_type: 'audit_completed',
            title: `Audit completed: ${audit.title}`,
            entity_type: 'client_audit',
            entity_id: auditId,
            source: 'unicorn',
            // metadata is jsonb — pass the object directly. JSON.stringify()
            // here previously stored it as a jsonb *string* scalar instead of
            // a queryable object (harmless today since this insert always
            // failed before the client_id/CHECK-constraint fixes above, so no
            // real row with this shape has ever existed).
            metadata: {
              risk_rating: audit.risk_rating,
              score_pct: audit.score_pct,
            },
          } as any);
        } catch (err) {
          // Non-critical (a missing Timeline entry, not client-facing data) —
          // logged so drift like a missing event_type in the CHECK constraint
          // is at least visible in the console instead of fully invisible.
          console.error('audit_completed timeline event failed', err);
        }
      }

      return { syncCount };
    },
    onSuccess: ({ syncCount }, { status }) => {
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
    onError: (err: any, { status }) => {
      if (status === 'complete') {
        toast.error(
          `Could not mark the audit complete (${err?.message || 'unknown error'}). The audit was not marked complete — please retry.`,
        );
      } else {
        toast.error(`Failed to update status: ${err?.message || 'Unknown error'}`);
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
  // Destructured because `updateAudit` (the mutation object) is a fresh
  // object every render, but `.mutate` itself is a stable function
  // reference — using the object directly in `calculate`'s deps would make
  // `calculate` (and the effect below that calls it) re-run every render.
  const { mutate: updateAuditMutate } = updateAudit;
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
      updateAuditMutate({
        score_total: scoreTotal,
        score_max: scoreMax,
        score_pct: scorePct,
      } as any);
    }, 1000);
  }, [responses, questions, auditId, updateAuditMutate]);

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
        .eq('is_vivacity_internal', true)
        .eq('is_system_account', false);
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

// ─── Findings without action items (Critical/High) ───
export interface FindingWithoutAction {
  finding_id: string;
  audit_id: string;
  finding_code: string | null;
  summary: string;
  priority: 'critical' | 'high';
  section_id: string | null;
  section_title: string | null;
  section_code_prefix: string | null;
}

export function useFindingsWithoutActions(auditId: string | undefined) {
  return useQuery({
    queryKey: ['audit-findings-without-actions', auditId],
    enabled: !!auditId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_client_audit_findings_without_actions' as any)
        .select('*')
        .eq('audit_id', auditId);
      if (error) throw error;
      const rows = (data || []) as unknown as FindingWithoutAction[];
      // Sort: critical first then high, then by finding_code asc
      return rows.sort((a, b) => {
        const pa = a.priority === 'critical' ? 1 : 2;
        const pb = b.priority === 'critical' ? 1 : 2;
        if (pa !== pb) return pa - pb;
        return (a.finding_code || '').localeCompare(b.finding_code || '');
      });
    },
  });
}
