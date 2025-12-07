export interface Audit {
  id: number;
  tenant_id: number;
  client_id: string;
  created_by: string;
  status: 'draft' | 'in_progress' | 'complete';
  audit_title: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditSection {
  id: number;
  audit_id: number;
  standard_code: string;
  title: string;
  order_index: number;
  created_at: string;
}

export interface AuditQuestionBank {
  id: number;
  standard_code: string;
  quality_area: string;
  performance_indicator: string;
  question_text: string;
  rating_scale: string[];
  evidence_prompt: string;
  risk_tags: string[];
  version: number;
  active: boolean;
}

export interface AuditQuestion {
  id: number;
  audit_section_id: number;
  bank_id: number;
  question_text: string;
  rating_scale: any;
  evidence_prompt: string;
  order_index: number;
}

export interface AuditResponse {
  id: number;
  audit_question_id: number;
  rating: 'compliant' | 'partially_compliant' | 'non_compliant' | 'not_applicable';
  notes?: string;
  risk_level: 'high' | 'medium' | 'low' | 'none';
  tags: string[];
  evidence_files: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditFinding {
  id: number;
  audit_id: number;
  question_id?: number;
  summary: string;
  impact: string;
  priority: 'high' | 'medium' | 'low';
  auto_generated: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditAction {
  id: number;
  audit_id: number;
  finding_id?: number;
  assigned_to: string;
  due_date: string;
  status: 'open' | 'in_progress' | 'done';
  description: string;
  task_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditReport {
  audit: {
    audit_id: number;
    status: string;
    audit_title: string;
    started_at?: string;
    completed_at?: string;
  };
  sections: Array<{
    section_id: number;
    title: string;
    standard_code: string;
    questions: Array<{
      question_id: number;
      question_text: string;
      response?: {
        rating: string;
        notes?: string;
        risk_level: string;
        evidence_files: string[];
      };
    }>;
  }>;
  findings: Array<{
    finding_id: number;
    summary: string;
    impact: string;
    priority: string;
    created_at: string;
  }>;
  actions: Array<{
    action_id: number;
    description: string;
    assigned_to: string;
    due_date: string;
    status: string;
  }>;
  risk_summary: {
    high_count: number;
    medium_count: number;
    low_count: number;
    total_findings: number;
  };
}
