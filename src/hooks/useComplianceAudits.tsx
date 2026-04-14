import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────

export interface ComplianceTemplate {
  id: string;
  name: string;
  framework: string;
  description: string | null;
  is_active: boolean;
}

export interface ComplianceAuditRow {
  id: string;
  tenant_id: number;
  template_id: string;
  auditor_user_id: string | null;
  status: string;
  audit_date: string | null;
  score_total: number | null;
  score_max: number | null;
  score_pct: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  template_name?: string;
  auditor_name?: string;
  open_caas?: number;
}

export interface ComplianceSection {
  id: string;
  template_id: string;
  title: string;
  sort_order: number;
}

export interface ComplianceQuestion {
  id: string;
  section_id: string;
  sort_order: number;
  clause: string | null;
  audit_statement: string;
  response_set: string;
  flagged_responses: string[];
  score_compliant: number;
  score_at_risk: number;
  score_non_compliant: number;
  evidence_to_sight: string | null;
  unicorn_documents: string | null;
  corrective_action: string | null;
  nc_map: string | null;
  is_active: boolean;
}

export interface ComplianceResponse {
  id: string;
  audit_id: string;
  question_id: string;
  response: string | null;
  score: number | null;
  is_flagged: boolean;
  notes: string | null;
  evidence_urls: string[] | null;
  responded_by: string | null;
  responded_at: string | null;
}

export interface ComplianceCAA {
  id: string;
  audit_id: string;
  response_id: string;
  description: string;
  responsible_person: string | null;
  due_date: string | null;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  evidence_urls: string[] | null;
  notes: string | null;
  created_by: string | null;
}

// ── Fetch Audits for a Tenant ────────────────────────────

export function useComplianceAuditList(tenantId: number | null) {
  const [audits, setAudits] = useState<ComplianceAuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAudits = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Fetch audits
      const { data: auditData, error } = await supabase
        .from('compliance_audits')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with template names, auditor names, open CAAs
      const enriched = await Promise.all(
        (auditData || []).map(async (audit: any) => {
          // Template name
          const { data: tpl } = await supabase
            .from('compliance_templates')
            .select('name')
            .eq('id', audit.template_id)
            .single();

          // Auditor name
          let auditorName = '—';
          if (audit.auditor_user_id) {
            const { data: user } = await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('user_uuid', audit.auditor_user_id)
              .single();
            auditorName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || '—' : '—';
          }

          // Open CAAs count
          const { count } = await supabase
            .from('compliance_corrective_actions')
            .select('id', { count: 'exact', head: true })
            .eq('audit_id', audit.id)
            .in('status', ['open', 'in_progress']);

          return {
            ...audit,
            template_name: tpl?.name || 'Unknown',
            auditor_name: auditorName,
            open_caas: count || 0,
          } as ComplianceAuditRow;
        })
      );

      setAudits(enriched);
    } catch (err: any) {
      toast({ title: 'Error loading audits', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  return { audits, loading, fetchAudits };
}

// ── Fetch Templates ─────────────────────────────────────

export async function fetchActiveTemplates(): Promise<ComplianceTemplate[]> {
  const { data, error } = await supabase
    .from('compliance_templates')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []) as ComplianceTemplate[];
}

// ── Create Audit + Pre-create Responses ─────────────────

export async function createAudit(params: {
  tenantId: number;
  templateId: string;
  auditDate: string;
  auditorUserId: string;
  notes: string;
  createdBy: string;
}): Promise<string> {
  // 1. Insert audit
  const { data: audit, error: auditErr } = await supabase
    .from('compliance_audits')
    .insert({
      tenant_id: params.tenantId,
      template_id: params.templateId,
      audit_date: params.auditDate,
      auditor_user_id: params.auditorUserId,
      notes: params.notes,
      status: 'draft',
      created_by: params.createdBy,
    })
    .select('id')
    .single();

  if (auditErr) throw auditErr;
  const auditId = audit.id;

  // 2. Get all sections for this template
  const { data: sections, error: secErr } = await supabase
    .from('compliance_template_sections')
    .select('id')
    .eq('template_id', params.templateId);

  if (secErr) throw secErr;

  // 3. Get all questions for these sections
  const sectionIds = (sections || []).map((s: any) => s.id);
  const { data: questions, error: qErr } = await supabase
    .from('compliance_template_questions')
    .select('id')
    .in('section_id', sectionIds)
    .eq('is_active', true);

  if (qErr) throw qErr;

  // 4. Bulk insert responses
  const responseRows = (questions || []).map((q: any) => ({
    audit_id: auditId,
    question_id: q.id,
    response: null,
    score: null,
    is_flagged: false,
    notes: null,
    evidence_urls: [],
  }));

  if (responseRows.length > 0) {
    const { error: respErr } = await supabase
      .from('compliance_audit_responses')
      .insert(responseRows);
    if (respErr) throw respErr;
  }

  return auditId;
}

// ── Fetch Audit Form Data ───────────────────────────────

export async function fetchAuditFormData(auditId: string) {
  // Fetch audit
  const { data: audit, error: aErr } = await supabase
    .from('compliance_audits')
    .select('*')
    .eq('id', auditId)
    .single();
  if (aErr) throw aErr;

  // Fetch template sections
  const { data: sections, error: sErr } = await supabase
    .from('compliance_template_sections')
    .select('*')
    .eq('template_id', audit.template_id)
    .order('sort_order');
  if (sErr) throw sErr;

  // Fetch questions for all sections
  const sectionIds = (sections || []).map((s: any) => s.id);
  const { data: questions, error: qErr } = await supabase
    .from('compliance_template_questions')
    .select('*')
    .in('section_id', sectionIds)
    .eq('is_active', true)
    .order('sort_order');
  if (qErr) throw qErr;

  // Fetch responses
  const { data: responses, error: rErr } = await supabase
    .from('compliance_audit_responses')
    .select('*')
    .eq('audit_id', auditId);
  if (rErr) throw rErr;

  // Fetch CAAs
  const { data: caas, error: cErr } = await supabase
    .from('compliance_corrective_actions')
    .select('*')
    .eq('audit_id', auditId);
  if (cErr) throw cErr;

  return {
    audit: audit as ComplianceAuditRow,
    sections: (sections || []) as ComplianceSection[],
    questions: (questions || []) as ComplianceQuestion[],
    responses: (responses || []) as ComplianceResponse[],
    caas: (caas || []) as ComplianceCAA[],
  };
}

// ── Save Response (autosave) ────────────────────────────

export async function saveResponse(params: {
  responseId: string;
  response: string | null;
  score: number | null;
  isFlagged: boolean;
  notes?: string | null;
  evidenceUrls?: string[];
  respondedBy: string;
}) {
  const { error } = await supabase
    .from('compliance_audit_responses')
    .update({
      response: params.response,
      score: params.score,
      is_flagged: params.isFlagged,
      notes: params.notes ?? null,
      evidence_urls: params.evidenceUrls ?? [],
      responded_by: params.respondedBy,
      responded_at: new Date().toISOString(),
    })
    .eq('id', params.responseId);
  if (error) throw error;
}

// ── Recalculate Score ───────────────────────────────────

export async function recalculateScore(auditId: string) {
  const { data: responses, error } = await supabase
    .from('compliance_audit_responses')
    .select('response, score')
    .eq('audit_id', auditId);
  if (error) throw error;

  let scoreTotal = 0;
  let scoreMax = 0;

  for (const r of (responses || []) as any[]) {
    if (!r.response || r.response === 'na' || r.response === 'not_applicable') continue;
    scoreTotal += r.score || 0;
    scoreMax += 2; // max per question is 2 (compliant/safe)
  }

  const scorePct = scoreMax > 0 ? Math.round((scoreTotal / scoreMax) * 100) : null;

  await supabase
    .from('compliance_audits')
    .update({ score_total: scoreTotal, score_max: scoreMax, score_pct: scorePct })
    .eq('id', auditId);

  return { scoreTotal, scoreMax, scorePct };
}

// ── Complete Audit ──────────────────────────────────────

export async function completeAudit(auditId: string): Promise<boolean> {
  // Validate all responses filled
  const { data: responses, error } = await supabase
    .from('compliance_audit_responses')
    .select('id, response')
    .eq('audit_id', auditId);
  if (error) throw error;

  const unanswered = (responses || []).filter((r: any) => !r.response);
  if (unanswered.length > 0) {
    toast({
      title: 'Cannot complete audit',
      description: `${unanswered.length} question(s) still unanswered.`,
      variant: 'destructive',
    });
    return false;
  }

  await recalculateScore(auditId);

  const { error: upErr } = await supabase
    .from('compliance_audits')
    .update({ status: 'complete', audit_date: new Date().toISOString().split('T')[0] })
    .eq('id', auditId);
  if (upErr) throw upErr;

  return true;
}

// ── Archive Audit ───────────────────────────────────────

export async function archiveAudit(auditId: string) {
  const { error } = await supabase
    .from('compliance_audits')
    .update({ status: 'archived' })
    .eq('id', auditId);
  if (error) throw error;
}

// ── Save / Update CAA ───────────────────────────────────

export async function upsertCAA(params: {
  auditId: string;
  responseId: string;
  description: string;
  responsiblePerson: string | null;
  dueDate: string | null;
  createdBy: string;
  existingCaaId?: string;
}): Promise<string> {
  if (params.existingCaaId) {
    const { error } = await supabase
      .from('compliance_corrective_actions')
      .update({
        description: params.description,
        responsible_person: params.responsiblePerson,
        due_date: params.dueDate,
      })
      .eq('id', params.existingCaaId);
    if (error) throw error;
    return params.existingCaaId;
  } else {
    const { data, error } = await supabase
      .from('compliance_corrective_actions')
      .insert({
        audit_id: params.auditId,
        response_id: params.responseId,
        description: params.description,
        responsible_person: params.responsiblePerson,
        due_date: params.dueDate,
        status: 'open',
        created_by: params.createdBy,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
}

// ── Update CAA Status ───────────────────────────────────

export async function updateCAAStatus(caaId: string, status: string, verifiedBy?: string) {
  const updates: any = { status };
  if (status === 'closed' && verifiedBy) {
    updates.verified_by = verifiedBy;
    updates.verified_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from('compliance_corrective_actions')
    .update(updates)
    .eq('id', caaId);
  if (error) throw error;
}

// ── Upload Evidence ─────────────────────────────────────

export async function uploadEvidence(file: File, auditId: string, questionId: string) {
  const ext = file.name.split('.').pop();
  const path = `${auditId}/${questionId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('compliance-evidence')
    .upload(path, file);
  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('compliance-evidence')
    .getPublicUrl(path);

  // For private buckets, use signed URL instead
  const { data: signedData } = await supabase.storage
    .from('compliance-evidence')
    .createSignedUrl(path, 3600);

  return signedData?.signedUrl || path;
}
