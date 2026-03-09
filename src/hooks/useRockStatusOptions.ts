import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RockStatusOption {
  code: number;
  value: string;
  label: string;
  color: string;
  sort_order: number;
}

// Module-level cache
let cachedStatuses: RockStatusOption[] | null = null;
let fetchPromise: Promise<RockStatusOption[]> | null = null;

async function loadStatuses(): Promise<RockStatusOption[]> {
  if (cachedStatuses) return cachedStatuses;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('dd_rock_status')
      .select('code, value, label, color, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Failed to load dd_rock_status:', error);
      fetchPromise = null;
      return [];
    }

    cachedStatuses = (data || []).map((row) => ({
      code: row.code,
      value: row.value,
      label: row.label,
      color: row.color,
      sort_order: row.sort_order,
    }));

    return cachedStatuses;
  })();

  return fetchPromise;
}

export function useRockStatusOptions() {
  const [statuses, setStatuses] = useState<RockStatusOption[]>(cachedStatuses || []);
  const [loading, setLoading] = useState(!cachedStatuses);

  useEffect(() => {
    let mounted = true;
    loadStatuses().then((result) => {
      if (mounted) {
        setStatuses(result);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { statuses, loading };
}

/** Get status label for a value */
export function getRockStatusLabel(value: string, statuses?: RockStatusOption[]): string {
  if (statuses) {
    const found = statuses.find((s) => s.value === value);
    if (found) return found.label;
  }
  // Fallback
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Get status color class for a value */
export function getRockStatusColor(value: string, statuses?: RockStatusOption[]): string {
  if (statuses) {
    const found = statuses.find((s) => s.value === value);
    if (found) return found.color;
  }
  // Fallback defaults
  const defaults: Record<string, string> = {
    not_started: 'text-gray-600',
    on_track: 'text-green-600',
    at_risk: 'text-amber-600',
    off_track: 'text-red-600',
    complete: 'text-blue-600',
  };
  return defaults[value] || 'text-gray-600';
}
