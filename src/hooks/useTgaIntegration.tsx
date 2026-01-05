import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// Types
export interface TGACacheItem {
  id: string;
  tenant_id: number;
  product_code: string;
  product_type: 'qualification' | 'unit' | 'skillset' | 'accredited_course';
  title: string;
  status: string | null;
  training_package: string | null;
  release_version: string | null;
  superseded_by: string | null;
  fetched_at: string;
  source_hash: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TGAImportJob {
  id: string;
  tenant_id: number;
  codes: string[];
  status: 'queued' | 'running' | 'done' | 'failed';
  rows_upserted: number;
  results: Record<string, unknown>[] | null;
  error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HealthCheckResult {
  tables_exist: boolean;
  rls_enabled: boolean;
  total_cached: number;
  sample_codes_requested: number;
  sample_codes_found: number;
  stale_count: number;
  checked_at: string;
}

export interface ProbeResult {
  code: string;
  found: boolean;
  mapped: {
    product_code: string;
    product_type: string;
    title: string;
    status: string | null;
    training_package: string | null;
    release_version: string | null;
    superseded_by: string | null;
  } | null;
  raw: Record<string, unknown> | null;
  error: string | null;
}

export interface SyncResult {
  success: boolean;
  rows_upserted: number;
  results: Array<{
    code: string;
    action: 'inserted' | 'updated' | 'unchanged' | 'error';
    error?: string;
  }>;
}

export function useTgaIntegration(tenantId: number | null) {
  const { session, isSuperAdmin, hasTenantAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [healthCheck, setHealthCheck] = useState<HealthCheckResult | null>(null);
  const [cachedItems, setCachedItems] = useState<TGACacheItem[]>([]);
  const [jobs, setJobs] = useState<TGAImportJob[]>([]);

  const canManage = isSuperAdmin() || (tenantId ? hasTenantAdmin(tenantId) : false);

  // Fetch cached items for the tenant
  const fetchCachedItems = useCallback(async () => {
    if (!tenantId) return;
    
    try {
      const { data, error } = await supabase
        .from('tga_cache')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('fetched_at', { ascending: false });

      if (error) throw error;
      setCachedItems((data || []) as TGACacheItem[]);
    } catch (error) {
      console.error('Error fetching TGA cache:', error);
      toast.error('Failed to fetch cached items');
    }
  }, [tenantId]);

  // Fetch import jobs
  const fetchJobs = useCallback(async () => {
    if (!tenantId || !canManage) return;
    
    try {
      const { data, error } = await supabase
        .from('tga_import_jobs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setJobs((data || []) as TGAImportJob[]);
    } catch (error) {
      console.error('Error fetching TGA jobs:', error);
    }
  }, [tenantId, canManage]);

  // Run health check
  const runHealthCheck = useCallback(async (sampleCodes: string[] = []) => {
    if (!tenantId || !canManage) {
      toast.error('Admin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('tga_health_check', {
          p_tenant_id: tenantId,
          p_sample_codes: sampleCodes,
        });

      if (error) throw error;
      
      const result = data as unknown as HealthCheckResult;
      setHealthCheck(result);
      toast.success('Health check completed');
      return result;
    } catch (error) {
      console.error('Health check error:', error);
      toast.error('Health check failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId, canManage]);

  // Queue sync job via RPC
  const queueSync = useCallback(async (codes: string[]) => {
    if (!tenantId || !canManage) {
      toast.error('Admin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('tga_queue_sync', {
          p_tenant_id: tenantId,
          p_codes: codes,
        });

      if (error) throw error;
      
      toast.success(`Sync queued for ${codes.length} codes`);
      await fetchJobs();
      return data;
    } catch (error) {
      console.error('Queue sync error:', error);
      toast.error('Failed to queue sync');
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId, canManage, fetchJobs]);

  // Probe a code (no DB writes)
  const probeCode = useCallback(async (code: string): Promise<ProbeResult | null> => {
    if (!tenantId || !canManage || !session?.access_token) {
      toast.error('Admin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('tga-integration', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: null,
      });

      // Since we need GET with query params, use fetch directly
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://yxkgdalkbrriasiyyrwk.supabase.co'}/functions/v1/tga-integration?probe=1&code=${encodeURIComponent(code)}&tenant_id=${tenantId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Probe failed');
      }

      const result = await response.json() as ProbeResult;
      
      if (result.found) {
        toast.success(`Found: ${result.mapped?.title || code}`);
      } else {
        toast.warning(`Not found: ${code}`);
      }
      
      return result;
    } catch (error) {
      console.error('Probe error:', error);
      toast.error(`Probe failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId, canManage, session]);

  // Sync codes immediately via edge function
  const syncCodes = useCallback(async (codes: string[], jobId?: string): Promise<SyncResult | null> => {
    if (!tenantId || !canManage || !session?.access_token) {
      toast.error('Admin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('tga-integration', {
        body: {
          tenant_id: tenantId,
          codes,
          job_id: jobId,
        },
      });

      if (error) throw error;
      
      const result = data as SyncResult;
      
      if (result.success) {
        toast.success(`Synced ${result.rows_upserted} items`);
        await fetchCachedItems();
        await fetchJobs();
      }
      
      return result;
    } catch (error) {
      console.error('Sync error:', error);
      toast.error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId, canManage, session, fetchCachedItems, fetchJobs]);

  return {
    loading,
    canManage,
    healthCheck,
    cachedItems,
    jobs,
    fetchCachedItems,
    fetchJobs,
    runHealthCheck,
    queueSync,
    probeCode,
    syncCodes,
  };
}