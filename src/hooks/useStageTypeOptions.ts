import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageTypeOption {
  value: string;
  label: string;
  color: string;
  is_milestone: boolean;
  sort_order: number;
}

const DEFAULT_COLOR = 'bg-muted text-muted-foreground';

// Module-level cache so multiple hook consumers share one fetch
let cachedStageTypes: StageTypeOption[] | null = null;
let fetchPromise: Promise<StageTypeOption[]> | null = null;

async function loadStageTypes(): Promise<StageTypeOption[]> {
  if (cachedStageTypes) return cachedStageTypes;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('dd_stage_types')
      .select('value, label, color, is_milestone, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Failed to load dd_stage_types:', error);
      fetchPromise = null;
      return [];
    }

    cachedStageTypes = (data || []).map((row) => ({
      value: row.value,
      label: row.label,
      color: row.color || DEFAULT_COLOR,
      is_milestone: row.is_milestone ?? false,
      sort_order: row.sort_order,
    }));

    return cachedStageTypes;
  })();

  return fetchPromise;
}

/** Invalidate the module-level cache (e.g. after adding a new type) */
export function invalidateStageTypeCache() {
  cachedStageTypes = null;
  fetchPromise = null;
}

export function useStageTypeOptions() {
  const [stageTypes, setStageTypes] = useState<StageTypeOption[]>(cachedStageTypes || []);
  const [loading, setLoading] = useState(!cachedStageTypes);

  useEffect(() => {
    let mounted = true;
    loadStageTypes().then((result) => {
      if (mounted) {
        setStageTypes(result);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { stageTypes, loading };
}

/** Get the color classes for a stage type value */
export function getStageTypeColor(value: string | null | undefined, stageTypes?: StageTypeOption[]): string {
  if (!value) return DEFAULT_COLOR;
  const found = stageTypes?.find((s) => s.value === value);
  return found?.color || DEFAULT_COLOR;
}

/** Get the display label for a stage type value */
export function getStageTypeLabel(value: string | null | undefined, stageTypes?: StageTypeOption[]): string {
  if (!value) return value || '';
  const found = stageTypes?.find((s) => s.value === value);
  return found?.label || value;
}
