// EOS Stuck Alerts Types

export type AlertType = 
  | 'cadence_stuck'
  | 'rock_stuck'
  | 'ids_stuck'
  | 'people_stuck'
  | 'quarterly_stuck';

export type AlertSeverity = 'informational' | 'attention_required' | 'intervention_required';

export type AlertStatus = 'new' | 'acknowledged' | 'actioned' | 'dismissed';

export type AlertDimension = 'cadence' | 'rocks' | 'ids' | 'people' | 'quarterly';

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  informational: 'Early Warning',
  attention_required: 'Attention Required',
  intervention_required: 'Intervention Required',
};

export const SEVERITY_COLORS: Record<AlertSeverity, { bg: string; text: string; border: string }> = {
  informational: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  attention_required: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  intervention_required: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/30',
  },
};

export const STATUS_LABELS: Record<AlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  actioned: 'In Progress',
  dismissed: 'Dismissed',
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  cadence_stuck: 'Meeting Cadence',
  rock_stuck: 'Rock Progress',
  ids_stuck: 'IDS Resolution',
  people_stuck: 'People System',
  quarterly_stuck: 'Quarterly Rhythm',
};

export interface EosAlert {
  id: string;
  tenant_id: number;
  alert_type: AlertType;
  severity: AlertSeverity;
  dimension: AlertDimension;
  source_entity_id?: string;
  source_entity_type?: string;
  message: string;
  details: {
    since?: string;
    why_it_matters?: string;
    suggested_action?: string;
    link?: string;
    entity_name?: string;
    days_stuck?: number;
    [key: string]: any;
  };
  status: AlertStatus;
  dismiss_reason?: string;
  dismissed_by?: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
  resolved_at?: string;
  last_notified_at?: string;
}

export interface AlertDetectionResult {
  shouldCreate: boolean;
  alert: Omit<EosAlert, 'id' | 'tenant_id' | 'created_at' | 'status'> | null;
}
