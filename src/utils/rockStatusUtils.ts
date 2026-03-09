/**
 * Rock Status Utilities
 * 
 * Status values are lowercase snake_case text stored in eos_rocks.status,
 * sourced from the dd_rock_status lookup table.
 * Values: not_started, on_track, at_risk, off_track, complete
 */

// Default status values (fallback when dd_rock_status hasn't loaded yet)
export const DB_ROCK_STATUS = {
  NOT_STARTED: 'not_started',
  ON_TRACK: 'on_track',
  AT_RISK: 'at_risk',
  OFF_TRACK: 'off_track',
  COMPLETE: 'complete',
} as const;

export type DbRockStatus = string;

// UI-friendly status values (now identical to DB values)
export type UiRockStatus = 'not_started' | 'on_track' | 'at_risk' | 'off_track' | 'complete';

// Status display configuration
export interface StatusConfig {
  value: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

// Fallback config used when dd_rock_status cache isn't available
const FALLBACK_STATUS_CONFIG: Record<UiRockStatus, StatusConfig> = {
  not_started: {
    value: 'not_started',
    label: 'Not Started',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-300',
  },
  on_track: {
    value: 'on_track',
    label: 'On Track',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300',
  },
  at_risk: {
    value: 'at_risk',
    label: 'At Risk',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-300',
  },
  off_track: {
    value: 'off_track',
    label: 'Off Track',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300',
  },
  complete: {
    value: 'complete',
    label: 'Complete',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300',
  },
};

// Keep for backward compat
export const ROCK_STATUS_CONFIG = FALLBACK_STATUS_CONFIG;

/**
 * Normalize any status string to a UiRockStatus.
 * Handles legacy PascalCase values and lowercase.
 */
export function dbToUiStatus(dbStatus: string | null | undefined): UiRockStatus {
  if (!dbStatus) return 'on_track';
  
  const lower = dbStatus.toLowerCase().replace(/-/g, '_');
  
  const mapping: Record<string, UiRockStatus> = {
    'not_started': 'not_started',
    'notstarted': 'not_started',
    'on_track': 'on_track',
    'ontrack': 'on_track',
    'at_risk': 'at_risk',
    'atrisk': 'at_risk',
    'off_track': 'off_track',
    'offtrack': 'off_track',
    'complete': 'complete',
    'completed': 'complete',
  };
  
  return mapping[lower] || 'on_track';
}

/**
 * Convert UI status to database status.
 * Now both are lowercase, so this is essentially a passthrough with normalization.
 */
export function uiToDbStatus(uiStatus: string | null | undefined): string {
  if (!uiStatus) return 'on_track';
  return dbToUiStatus(uiStatus);
}

/**
 * Get the status configuration for display
 */
export function getStatusConfig(status: string | null | undefined): StatusConfig {
  const uiStatus = dbToUiStatus(status);
  return FALLBACK_STATUS_CONFIG[uiStatus];
}

/**
 * Get all available status options for select dropdowns (fallback/static).
 * Prefer useRockStatusOptions() hook for dynamic data from dd_rock_status.
 */
export function getStatusOptions(): { value: string; label: string }[] {
  return [
    { value: 'not_started', label: 'Not Started' },
    { value: 'on_track', label: 'On Track' },
    { value: 'at_risk', label: 'At Risk' },
    { value: 'off_track', label: 'Off Track' },
    { value: 'complete', label: 'Complete' },
  ];
}
