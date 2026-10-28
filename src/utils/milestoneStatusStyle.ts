import type { RockMilestoneStatus } from '@/types/eos';

/** Label and badge colours for a Rock milestone status, shared by the Rock panels. */
export const MILESTONE_STATUS: Record<RockMilestoneStatus, { label: string; className: string }> = {
  not_started: { label: 'Not started', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  blocked: { label: 'Blocked', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  complete: { label: 'Complete', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  off_track: { label: 'Off track', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  deferred: { label: 'Deferred', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};
