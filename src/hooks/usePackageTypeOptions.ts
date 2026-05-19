import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PackageTypeOption {
  code: string;
  label: string;
  sort_order: number;
}

// Module-level cache
let cachedOptions: PackageTypeOption[] | null = null;
let fetchPromise: Promise<PackageTypeOption[]> | null = null;

async function loadOptions(): Promise<PackageTypeOption[]> {
  if (cachedOptions) return cachedOptions;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('dd_package_type')
      .select('code, label, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Failed to load dd_package_type:', error);
      fetchPromise = null;
      return [];
    }

    cachedOptions = (data || []).map((row) => ({
      code: row.code,
      label: row.label,
      sort_order: row.sort_order,
    }));

    return cachedOptions;
  })();

  return fetchPromise;
}

export function usePackageTypeOptions() {
  const [options, setOptions] = useState<PackageTypeOption[]>(cachedOptions || []);
  const [loading, setLoading] = useState(!cachedOptions);

  useEffect(() => {
    let mounted = true;
    loadOptions().then((result) => {
      if (mounted) {
        setOptions(result);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { options, loading };
}

/** Get package type label for a code. Falls back to humanised title-case. */
export function getPackageTypeLabel(
  code: string | null | undefined,
  options?: PackageTypeOption[],
): string {
  if (!code) return '';
  if (options) {
    const found = options.find((o) => o.code === code);
    if (found) return found.label;
  }
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
