import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActionStatusOption {
  code: number;
  value: string;
  label: string;
  sort_order: number;
}

// Module-level cache
let cachedStatuses: ActionStatusOption[] | null = null;
let fetchPromise: Promise<ActionStatusOption[]> | null = null;

async function loadStatuses(): Promise<ActionStatusOption[]> {
  if (cachedStatuses) return cachedStatuses;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('dd_action_status')
      .select('code, value, label, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Failed to load dd_action_status:', error);
      fetchPromise = null;
      return [];
    }

    cachedStatuses = (data || []).map((row) => ({
      code: row.code,
      value: row.value,
      label: row.label,
      sort_order: row.sort_order,
    }));

    return cachedStatuses;
  })();

  return fetchPromise;
}

export function useActionStatusOptions() {
  const [statuses, setStatuses] = useState<ActionStatusOption[]>(cachedStatuses || []);
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
export function getActionStatusLabel(value: string, statuses?: ActionStatusOption[]): string {
  if (statuses) {
    const found = statuses.find((s) => s.value === value);
    if (found) return found.label;
  }
  // Fallback
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
