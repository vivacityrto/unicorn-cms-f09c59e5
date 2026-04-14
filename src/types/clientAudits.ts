export type AuditType = 'compliance_health_check' | 'mock_audit' | 'due_diligence';
export type AuditStatus = 'draft' | 'in_progress' | 'review' | 'complete' | 'archived';
export type AuditRisk = 'low' | 'medium' | 'high' | 'critical';
export type AuditAiStatus = 'none' | 'pending' | 'processing' | 'complete' | 'error';

export interface ClientAudit {
  id: string;
  audit_type: AuditType;
  subject_tenant_id: number;
  title: string | null;
  status: AuditStatus;
  risk_rating: AuditRisk | null;
  score_pct: number | null;
  score_total: number | null;
  score_max: number | null;
  conducted_at: string | null;
  closed_at: string | null;
  next_audit_due: string | null;
  lead_auditor_id: string | null;
  assisted_by_id: string | null;
  report_prepared_by_id: string | null;
  training_products: string[];
  template_id: string | null;
  snapshot_rto_name: string | null;
  snapshot_rto_number: string | null;
  snapshot_cricos_code: string | null;
  snapshot_site_address: string | null;
  snapshot_ceo: string | null;
  snapshot_phone: string | null;
  snapshot_email: string | null;
  snapshot_website: string | null;
  snapshot_other_contacts: string | null;
  executive_summary: string | null;
  overall_finding: string | null;
  ai_analysis_status: AuditAiStatus;
  report_generated_at: string | null;
  report_pdf_path: string | null;
  doc_number: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditDashboardRow extends ClientAudit {
  client_name: string;
  client_type: string | null;
  rto_number: string | null;
  lead_auditor_name: string | null;
  lead_auditor_avatar: string | null;
  created_by_name: string | null;
  finding_count: number;
  action_count: number;
  open_action_count: number;
  document_count: number;
}

export const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  compliance_health_check: 'CHC',
  mock_audit: 'Mock Audit',
  due_diligence: 'Due Diligence',
};

export const AUDIT_STATUS_LABELS: Record<AuditStatus, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  review: 'In Review',
  complete: 'Complete',
  archived: 'Archived',
};

export const AUDIT_RISK_LABELS: Record<AuditRisk, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
};
