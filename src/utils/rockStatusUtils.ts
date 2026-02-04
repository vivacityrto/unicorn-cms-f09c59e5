/**
 * Rock Status Utilities
 * 
 * The database uses PascalCase enum values: Not_Started, On_Track, At_Risk, Off_Track, Complete
 * The UI uses lowercase for display logic: not_started, on_track, at_risk, off_track, complete
 * 
 * These utilities ensure consistent conversion between the two formats.
 */

// Database enum values (exact strings stored in PostgreSQL)
export const DB_ROCK_STATUS = {
  NOT_STARTED: 'Not_Started',
  ON_TRACK: 'On_Track',
  AT_RISK: 'At_Risk',
  OFF_TRACK: 'Off_Track',
  COMPLETE: 'Complete',
} as const;

export type DbRockStatus = typeof DB_ROCK_STATUS[keyof typeof DB_ROCK_STATUS];

// UI-friendly status values (lowercase for internal logic)
export type UiRockStatus = 'not_started' | 'on_track' | 'at_risk' | 'off_track' | 'complete';

// Status display configuration
export interface StatusConfig {
  value: DbRockStatus;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const ROCK_STATUS_CONFIG: Record<UiRockStatus, StatusConfig> = {
  not_started: {
    value: DB_ROCK_STATUS.NOT_STARTED,
    label: 'Not Started',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-300',
  },
  on_track: {
    value: DB_ROCK_STATUS.ON_TRACK,
    label: 'On Track',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300',
  },
  at_risk: {
    value: DB_ROCK_STATUS.AT_RISK,
    label: 'At Risk',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-300',
  },
  off_track: {
    value: DB_ROCK_STATUS.OFF_TRACK,
    label: 'Off Track',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300',
  },
  complete: {
    value: DB_ROCK_STATUS.COMPLETE,
    label: 'Complete',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300',
  },
};

/**
 * Convert database status to UI status (lowercase)
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
 * Convert UI status to database status (PascalCase)
 */
export function uiToDbStatus(uiStatus: string | null | undefined): DbRockStatus {
  if (!uiStatus) return DB_ROCK_STATUS.ON_TRACK;
  
  const lower = uiStatus.toLowerCase().replace(/-/g, '_');
  
  const mapping: Record<string, DbRockStatus> = {
    'not_started': DB_ROCK_STATUS.NOT_STARTED,
    'notstarted': DB_ROCK_STATUS.NOT_STARTED,
    'on_track': DB_ROCK_STATUS.ON_TRACK,
    'ontrack': DB_ROCK_STATUS.ON_TRACK,
    'at_risk': DB_ROCK_STATUS.AT_RISK,
    'atrisk': DB_ROCK_STATUS.AT_RISK,
    'off_track': DB_ROCK_STATUS.OFF_TRACK,
    'offtrack': DB_ROCK_STATUS.OFF_TRACK,
    'complete': DB_ROCK_STATUS.COMPLETE,
    'completed': DB_ROCK_STATUS.COMPLETE,
  };
  
  return mapping[lower] || DB_ROCK_STATUS.ON_TRACK;
}

/**
 * Get the status configuration for display
 */
export function getStatusConfig(status: string | null | undefined): StatusConfig {
  const uiStatus = dbToUiStatus(status);
  return ROCK_STATUS_CONFIG[uiStatus];
}

/**
 * Get all available status options for select dropdowns
 */
export function getStatusOptions(): { value: DbRockStatus; label: string }[] {
  return [
    { value: DB_ROCK_STATUS.NOT_STARTED, label: 'Not Started' },
    { value: DB_ROCK_STATUS.ON_TRACK, label: 'On Track' },
    { value: DB_ROCK_STATUS.AT_RISK, label: 'At Risk' },
    { value: DB_ROCK_STATUS.OFF_TRACK, label: 'Off Track' },
    { value: DB_ROCK_STATUS.COMPLETE, label: 'Complete' },
  ];
}
