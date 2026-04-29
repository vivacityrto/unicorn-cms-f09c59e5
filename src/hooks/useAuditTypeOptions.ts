import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AuditTypeOption {
  value: string;
  label: string;
  sort_order: number;
}

// Module-level cache
let cachedTypes: AuditTypeOption[] | null = null;
let fetchPromise: Promise<AuditTypeOption[]> | null = null;

async function loadTypes(): Promise<AuditTypeOption[]> {
  if (cachedTypes) return cachedTypes;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('dd_audit_type')
      .select('code, value, label, sort_order')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Failed to load dd_audit_type:', error);
      fetchPromise = null;
      return [];
    }

    cachedTypes = (data || []).map((row) => ({
      value: row.value,
      label: row.label,
      sort_order: row.sort_order,
    }));

    return cachedTypes;
  })();

  return fetchPromise;
}

export function useAuditTypeOptions() {
  const [auditTypes, setAuditTypes] = useState<AuditTypeOption[]>(cachedTypes || []);
  const [loading, setLoading] = useState(!cachedTypes);

  useEffect(() => {
    let mounted = true;
    loadTypes().then((result) => {
      if (mounted) {
        setAuditTypes(result);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { auditTypes, loading };
}
