// Types for EOS Quarterly Conversations

export type QCStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type QCVisibility = 'private' | 'hr_only';
export type QCScope = 'vivacity' | 'tenant';

export interface QCTemplate {
  id: string;
  tenant_id: number;
  name: string;
  description: string | null;
  sections: QCSection[];
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QCSection {
  key: string;
  title: string;
  prompts: QCPrompt[];
}

export interface QCPrompt {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'boolean' | 'rating' | 'list' | 'checklist';
  scale?: string[]; // For rating type
  required?: boolean;
}

export interface QuarterlyConversation {
  id: string;
  tenant_id: number | null;
  scope: QCScope;
  reviewee_id: string;
  manager_ids: string[];
  template_id: string | null;
  quarter_start: string;
  quarter_end: string;
  scheduled_at: string | null;
  completed_at: string | null;
  status: QCStatus;
  visibility: QCVisibility;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QCAnswer {
  id: string;
  qc_id: string;
  section_key: string;
  prompt_key: string;
  value_json: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QCFit {
  id: string;
  qc_id: string;
  gets_it: boolean | null;
  wants_it: boolean | null;
  capacity: boolean | null;
  notes: string | null;
  seat_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QCLink {
  id: string;
  qc_id: string;
  linked_type: 'rock' | 'issue' | 'todo';
  linked_id: string;
  created_at: string;
  created_by: string | null;
}

export interface QCSignoff {
  id: string;
  qc_id: string;
  signed_by: string;
  role: 'manager' | 'reviewee';
  signed_at: string;
}

export interface QCAttachment {
  id: string;
  qc_id: string;
  file_url: string;
  mime_type: string | null;
  created_at: string;
  created_by: string | null;
}

export interface QCFormData {
  reviewee_id: string;
  manager_ids: string[];
  template_id: string;
  quarter_start: string;
  quarter_end: string;
  scheduled_at?: string;
}

export interface QCLinkCreate {
  type: 'rock' | 'issue' | 'todo';
  title: string;
  description?: string;
  owner_id: string;
  due_date?: string;
  priority?: number;
}
