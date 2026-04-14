export type AuditReferenceSource =
  | 'iauditor'
  | 'asqa'
  | 'sta'
  | 'external_consultant'
  | 'internal'
  | 'other';

export type AuditReferenceOutcome =
  | 'compliant'
  | 'substantially_compliant'
  | 'conditions_imposed'
  | 'non_compliant'
  | 'refer_to_regulator'
  | 'pending'
  | 'unknown';

export interface AiKeyFinding {
  standard: string;
  finding: string;
  risk_level: string;
}

export interface AiCondition {
  condition: string;
  due_date?: string;
}

export interface ClientAuditReference {
  id: string;
  subject_tenant_id: number;
  source: AuditReferenceSource;
  source_label: string | null;
  audit_type: string | null;
  audit_date: string | null;
  audit_outcome: AuditReferenceOutcome | null;
  auditor_name: string | null;
  standards_framework: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  ai_status: 'none' | 'pending' | 'processing' | 'complete' | 'error';
  ai_summary: string | null;
  ai_key_findings: AiKeyFinding[] | null;
  ai_conditions: AiCondition[] | null;
  ai_processed_at: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  client_name?: string;
}

export const SOURCE_CONFIG: Record<AuditReferenceSource, { label: string; color: string }> = {
  iauditor: { label: 'iAuditor', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  asqa: { label: 'ASQA', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  sta: { label: 'State TA', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300' },
  external_consultant: { label: 'Consultant', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
  internal: { label: 'Internal', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

export const OUTCOME_CONFIG: Record<AuditReferenceOutcome, { label: string; color: string }> = {
  compliant: { label: 'Compliant', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  substantially_compliant: { label: 'Substantially Compliant', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300' },
  conditions_imposed: { label: 'Conditions Imposed', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
  non_compliant: { label: 'Non-Compliant', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  refer_to_regulator: { label: 'Refer to Regulator', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  unknown: { label: 'Unknown', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

export const SOURCE_OPTIONS: { value: AuditReferenceSource; label: string }[] = [
  { value: 'iauditor', label: 'iAuditor / SafetyCulture' },
  { value: 'asqa', label: 'ASQA Audit' },
  { value: 'sta', label: 'State Training Authority' },
  { value: 'external_consultant', label: 'External Consultant' },
  { value: 'internal', label: 'Internal Audit (prior system)' },
  { value: 'other', label: 'Other' },
];

export const OUTCOME_OPTIONS: { value: AuditReferenceOutcome; label: string }[] = [
  { value: 'compliant', label: 'Compliant' },
  { value: 'substantially_compliant', label: 'Substantially Compliant' },
  { value: 'conditions_imposed', label: 'Conditions Imposed' },
  { value: 'non_compliant', label: 'Non-Compliant' },
  { value: 'refer_to_regulator', label: 'Refer to Regulator' },
  { value: 'pending', label: 'Pending / Unknown' },
];
