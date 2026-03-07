import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActionPriorityOption {
  code: number;
  value: string;
  label: string;
  sort_order: number;
}

// Module-level cache
let cachedPriorities: ActionPriorityOption[] | null = null;
let fetchPromise: Promise<ActionPriorityOption[]> | null = null;

async function loadPriorities(): Promise<ActionPriorityOption[]> {
  if (cachedPriorities) return cachedPriorities;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('dd_priority')
      .select('code, value, label, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Failed to load dd_priority:', error);
      fetchPromise = null;
      return [];
    }

    cachedPriorities = (data || []).map((row) => ({
      code: row.code,
      value: row.value,
      label: row.label,
      sort_order: row.sort_order,
    }));

    return cachedPriorities;
  })();

  return fetchPromise;
}

export function useActionPriorityOptions() {
  const [priorities, setPriorities] = useState<ActionPriorityOption[]>(cachedPriorities || []);
  const [loading, setLoading] = useState(!cachedPriorities);

  useEffect(() => {
    let mounted = true;
    loadPriorities().then((result) => {
      if (mounted) {
        setPriorities(result);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { priorities, loading };
}

/** Get priority label for a value */
export function getPriorityLabel(value: string, priorities?: ActionPriorityOption[]): string {
  if (priorities) {
    const found = priorities.find((p) => p.value === value);
    if (found) return found.label;
  }
  // Fallback
  return value.charAt(0).toUpperCase() + value.slice(1);
}
