export interface AuditSection {
  id: string;
  audit_id: string;
  template_section_id: string | null;
  standard_code: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  score_total: number | null;
  score_max: number | null;
  risk_level: string | null;
  section_summary: string | null;
  created_at: string;
}

export interface AuditResponse {
  id: string;
  audit_id: string;
  section_id: string | null;
  question_id: string | null;
  question_text: string | null;
  rating: 'compliant' | 'at_risk' | 'non_compliant' | 'not_applicable' | 'not_sighted' | null;
  notes: string | null;
  evidence_urls: string[];
  is_flagged: boolean;
  score: number | null;
  ai_suggested_rating: string | null;
  ai_suggested_notes: string | null;
  ai_confidence: number | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  response_id: string | null;
  section_id: string | null;
  summary: string;
  detail: string | null;
  standard_reference: string | null;
  impact: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  is_auto_generated: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AuditAction {
  id: string;
  audit_id: string;
  finding_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'complete' | 'deferred' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string | null;
  created_at: string;
}

export interface AuditDocument {
  id: string;
  audit_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  document_type: string;
  qualification_code: string | null;
  qualification_title: string | null;
  ai_status: 'pending' | 'processing' | 'complete' | 'error' | 'skipped';
  ai_findings: AiFinding[] | null;
  ai_risk_summary: string | null;
  ai_recommendations: AiRecommendation[] | null;
  ai_processed_at: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AiFinding {
  standard_code: string;
  clause: string;
  finding: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  evidence_cited: string;
}

export interface AiRecommendation {
  action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  standard_reference: string;
  rationale: string;
}

export interface TemplateQuestion {
  id: string;
  section_id: string;
  clause: string;
  audit_statement: string;
  response_set: string;
  flagged_responses: string[];
  score_compliant: number;
  score_at_risk: number;
  score_non_compliant: number;
  evidence_to_sight: string | null;
  corrective_action: string | null;
  nc_map: string | null;
  sort_order: number;
  is_active: boolean;
}

export const RATING_OPTIONS_FULL = [
  { value: 'compliant', label: 'Compliant', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'at_risk', label: 'At Risk', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'non_compliant', label: 'Non-Compliant', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'not_applicable', label: 'N/A', color: 'bg-gray-100 text-gray-600 border-gray-300' },
  { value: 'not_sighted', label: 'Not Sighted', color: 'bg-gray-100 text-gray-600 border-gray-300' },
] as const;

export const RATING_OPTIONS_SAFE = [
  { value: 'compliant', label: 'Compliant', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'at_risk', label: 'At Risk', color: 'bg-amber-100 text-amber-800 border-amber-300' },
] as const;

export const DOCUMENT_TYPES = [
  { value: 'tas', label: 'TAS (Training and Assessment Strategy)' },
  { value: 'policy', label: 'Policy / Procedure' },
  { value: 'student_file', label: 'Student File (sample)' },
  { value: 'evidence', label: 'Assessment Evidence' },
  { value: 'other', label: 'Other' },
] as const;

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

export const ACTION_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;
