/**
 * Standardised React Query configuration for Unicorn 2.0
 * 
 * This file provides consistent staleTime values across all hooks.
 * Import these constants instead of using raw numbers.
 * 
 * Usage:
 * ```ts
 * import { QUERY_STALE_TIMES } from '@/lib/queryConfig';
 * 
 * useQuery({
 *   queryKey: ['myData'],
 *   queryFn: fetchData,
 *   staleTime: QUERY_STALE_TIMES.LIST,
 * });
 * ```
 */

/**
 * Standardised staleTime values for different data types.
 * 
 * Guidelines for choosing the right staleTime:
 * 
 * - STATIC: Data that never changes during a session (enums, frameworks, options)
 * - REFERENCE: Lookup data that rarely changes (timezones, feature flags)
 * - PROFILE: User/tenant profiles that change infrequently
 * - LIST: Lists of records that may be updated by other users
 * - DASHBOARD: Aggregated metrics and summaries
 * - REALTIME: Data that updates frequently (timers, notifications, live feeds)
 * - ACTIVE: Highly volatile data (active timers, live meeting state)
 */
export const QUERY_STALE_TIMES = {
  /**
   * Data that never changes during a session.
   * Examples: enum options, compliance frameworks, status lists, dropdown options
   */
  STATIC: Infinity,

  /**
   * Reference data that rarely changes.
   * Examples: timezones, feature flags, configuration settings
   * Refreshes every hour.
   */
  REFERENCE: 1000 * 60 * 60, // 1 hour

  /**
   * User and tenant profile data.
   * Examples: user profiles, tenant settings, team member lists
   * Refreshes every 5 minutes.
   */
  PROFILE: 1000 * 60 * 5, // 5 minutes

  /**
   * Lists of records that may be updated by other users.
   * Examples: document lists, package lists, task lists, notes
   * Refreshes every 2 minutes.
   */
  LIST: 1000 * 60 * 2, // 2 minutes

  /**
   * Dashboard metrics and aggregated data.
   * Examples: analytics, summaries, charts
   * Refreshes every minute.
   */
  DASHBOARD: 1000 * 60, // 1 minute

  /**
   * Data that updates frequently.
   * Examples: time entries, package usage, stage analytics
   * Refreshes every 30 seconds.
   */
  REALTIME: 1000 * 30, // 30 seconds

  /**
   * Highly volatile data requiring near-instant updates.
   * Examples: active timers, live meeting state, typing indicators
   * Refreshes every 10 seconds.
   */
  ACTIVE: 1000 * 10, // 10 seconds
} as const;

/**
 * Common query configuration presets for different scenarios.
 * 
 * Usage:
 * ```ts
 * useQuery({
 *   queryKey: ['options'],
 *   queryFn: fetchOptions,
 *   ...QUERY_PRESETS.STATIC,
 * });
 * ```
 */
export const QUERY_PRESETS = {
  /**
   * For static enum/option data that never changes.
   * Data persists indefinitely in cache.
   */
  STATIC: {
    staleTime: QUERY_STALE_TIMES.STATIC,
    gcTime: Infinity,
  },

  /**
   * For reference data that rarely changes.
   * Data cached for 24 hours before garbage collection.
   */
  REFERENCE: {
    staleTime: QUERY_STALE_TIMES.REFERENCE,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  },

  /**
   * For profile data.
   * Data cached for 1 hour before garbage collection.
   */
  PROFILE: {
    staleTime: QUERY_STALE_TIMES.PROFILE,
    gcTime: 1000 * 60 * 60, // 1 hour
  },

  /**
   * For list data that updates moderately.
   * Data cached for 30 minutes before garbage collection.
   */
  LIST: {
    staleTime: QUERY_STALE_TIMES.LIST,
    gcTime: 1000 * 60 * 30, // 30 minutes
  },

  /**
   * For dashboard/analytics data.
   * Data cached for 15 minutes before garbage collection.
   */
  DASHBOARD: {
    staleTime: QUERY_STALE_TIMES.DASHBOARD,
    gcTime: 1000 * 60 * 15, // 15 minutes
  },

  /**
   * For frequently updating data.
   * Data cached for 5 minutes before garbage collection.
   */
  REALTIME: {
    staleTime: QUERY_STALE_TIMES.REALTIME,
    gcTime: 1000 * 60 * 5, // 5 minutes
  },

  /**
   * For highly volatile data.
   * Data cached for 2 minutes before garbage collection.
   */
  ACTIVE: {
    staleTime: QUERY_STALE_TIMES.ACTIVE,
    gcTime: 1000 * 60 * 2, // 2 minutes
  },
} as const;

export type QueryStaleTimeKey = keyof typeof QUERY_STALE_TIMES;
export type QueryPresetKey = keyof typeof QUERY_PRESETS;
