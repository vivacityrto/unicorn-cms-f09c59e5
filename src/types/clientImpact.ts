// Client Impact Report Types
// These are client-facing summaries derived from EOS data
// No EOS terminology should be exposed through these types

export type ReportStatus = 'on_track' | 'needs_attention' | 'at_risk';
export type ItemSection = 'improvements' | 'risks' | 'process_enhancements' | 'forward_focus';
export type ItemStatus = 'completed' | 'mitigated' | 'closed' | 'in_progress' | 'identified';

export interface ClientImpactReport {
  id: string;
  tenant_id: number;
  client_id?: string | null;
  reporting_period: string;
  period_start: string;
  period_end: string;
  executive_summary?: string | null;
  overall_status: ReportStatus;
  focus_areas?: string[] | null;
  is_published: boolean;
  published_at?: string | null;
  published_by?: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface ClientImpactItem {
  id: string;
  report_id: string;
  tenant_id: number;
  section: ItemSection;
  category?: string | null;
  title: string;
  description?: string | null;
  client_benefit?: string | null;
  status?: ItemStatus | null;
  completed_date?: string | null;
  source_type?: string | null; // Internal only - not shown to clients
  source_id?: string | null;   // Internal only - not shown to clients
  display_order: number;
  created_at: string;
}

// Client-friendly display helpers
export const REPORT_STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; bgColor: string }> = {
  on_track: { label: 'On Track', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-50 dark:bg-green-950/30' },
  needs_attention: { label: 'Needs Attention', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-50 dark:bg-amber-950/30' },
  at_risk: { label: 'At Risk', color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-50 dark:bg-red-950/30' },
};

export const ITEM_STATUS_CONFIG: Record<ItemStatus, { label: string; color: string }> = {
  completed: { label: 'Completed', color: 'text-green-600' },
  mitigated: { label: 'Mitigated', color: 'text-blue-600' },
  closed: { label: 'Closed', color: 'text-slate-600' },
  in_progress: { label: 'In Progress', color: 'text-amber-600' },
  identified: { label: 'Identified', color: 'text-purple-600' },
};

export const SECTION_CONFIG: Record<ItemSection, { label: string; description: string }> = {
  improvements: { label: 'Key Improvements Delivered', description: 'Changes and enhancements completed this period' },
  risks: { label: 'Risks Identified and Addressed', description: 'Potential issues identified and how they were managed' },
  process_enhancements: { label: 'Process & Service Enhancements', description: 'Improvements to how we work together' },
  forward_focus: { label: 'Forward Focus', description: 'Areas of attention for the upcoming period' },
};

export const CATEGORY_OPTIONS = [
  'Compliance',
  'Delivery Quality',
  'Communication',
  'Timeliness',
  'Risk Reduction',
  'Process Improvement',
  'Service Enhancement',
  'Documentation',
] as const;
