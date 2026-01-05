import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// Types
export interface TGASyncStatus {
  is_syncing: boolean;
  current_job_id: string | null;
  last_full_sync_at: string | null;
  last_delta_sync_at: string | null;
  last_health_check_at: string | null;
  connection_status: 'unknown' | 'connected' | 'error';
  counts: {
    products: number;
    units: number;
    organisations: number;
  };
  last_job: {
    id: string;
    job_type: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    records_fetched: number;
    records_inserted: number;
    records_updated: number;
    error_message: string | null;
  } | null;
}

export interface TGASyncJob {
  id: string;
  job_type: 'full' | 'delta' | 'products' | 'units' | 'organisations';
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  delta_since: string | null;
  records_fetched: number;
  records_inserted: number;
  records_updated: number;
  records_unchanged: number;
  records_failed: number;
  error_message: string | null;
  created_at: string;
}

export interface TGATrainingProduct {
  id: string;
  code: string;
  title: string;
  product_type: string;
  training_package_code: string | null;
  status: string | null;
  is_current: boolean;
  fetched_at: string;
}

export interface TGAUnit {
  id: string;
  code: string;
  title: string;
  training_package_code: string | null;
  status: string | null;
  is_current: boolean;
  nominal_hours: number | null;
  fetched_at: string;
}

export interface TGAOrganisation {
  id: string;
  code: string;
  legal_name: string;
  trading_name: string | null;
  status: string | null;
  state: string | null;
  fetched_at: string;
}

export interface ProbeResult {
  code: string;
  type: string;
  found: boolean;
  data: Record<string, unknown> | null;
  raw: string;
  error: string | null;
}

export function useTgaSync() {
  const { session, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TGASyncStatus | null>(null);
  const [jobs, setJobs] = useState<TGASyncJob[]>([]);
  const [products, setProducts] = useState<TGATrainingProduct[]>([]);
  const [units, setUnits] = useState<TGAUnit[]>([]);
  const [organisations, setOrganisations] = useState<TGAOrganisation[]>([]);

  const canManage = isSuperAdmin();

  // Fetch sync status
  const fetchStatus = useCallback(async () => {
    if (!canManage) return;
    
    try {
      const { data, error } = await supabase.rpc('tga_sync_status');
      if (error) throw error;
      setStatus(data as unknown as TGASyncStatus);
    } catch (error) {
      console.error('Error fetching TGA status:', error);
    }
  }, [canManage]);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    if (!canManage) return;
    
    try {
      const { data, error } = await supabase
        .from('tga_sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setJobs((data || []) as TGASyncJob[]);
    } catch (error) {
      console.error('Error fetching TGA jobs:', error);
    }
  }, [canManage]);

  // Fetch products
  const fetchProducts = useCallback(async (search?: string, limit = 100) => {
    try {
      let query = supabase
        .from('tga_training_products')
        .select('id, code, title, product_type, training_package_code, status, is_current, fetched_at')
        .order('code', { ascending: true })
        .limit(limit);

      if (search) {
        query = query.or(`code.ilike.%${search}%,title.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setProducts((data || []) as TGATrainingProduct[]);
      return data;
    } catch (error) {
      console.error('Error fetching TGA products:', error);
      return [];
    }
  }, []);

  // Fetch units
  const fetchUnits = useCallback(async (search?: string, limit = 100) => {
    try {
      let query = supabase
        .from('tga_units')
        .select('id, code, title, training_package_code, status, is_current, nominal_hours, fetched_at')
        .order('code', { ascending: true })
        .limit(limit);

      if (search) {
        query = query.or(`code.ilike.%${search}%,title.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setUnits((data || []) as TGAUnit[]);
      return data;
    } catch (error) {
      console.error('Error fetching TGA units:', error);
      return [];
    }
  }, []);

  // Fetch organisations
  const fetchOrganisations = useCallback(async (search?: string, limit = 100) => {
    try {
      let query = supabase
        .from('tga_organisations')
        .select('id, code, legal_name, trading_name, status, state, fetched_at')
        .order('code', { ascending: true })
        .limit(limit);

      if (search) {
        query = query.or(`code.ilike.%${search}%,legal_name.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrganisations((data || []) as TGAOrganisation[]);
      return data;
    } catch (error) {
      console.error('Error fetching TGA organisations:', error);
      return [];
    }
  }, []);

  // Test connection
  const testConnection = useCallback(async () => {
    if (!canManage || !session?.access_token) {
      toast.error('SuperAdmin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('tga-sync', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: null,
        method: 'GET',
      });

      // Use fetch for GET with query params
      const response = await fetch(
        `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/tga-sync?action=test`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Connection test failed');
      }

      const result = await response.json();
      
      if (result.success) {
        toast.success('TGA connection successful');
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }

      await fetchStatus();
      return result;
    } catch (error) {
      console.error('Connection test error:', error);
      toast.error('Connection test failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [canManage, session, fetchStatus]);

  // Probe a code
  const probeCode = useCallback(async (code: string, type: 'training' | 'organisation' = 'training'): Promise<ProbeResult | null> => {
    if (!canManage || !session?.access_token) {
      toast.error('SuperAdmin access required');
      return null;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/tga-sync?action=probe&code=${encodeURIComponent(code)}&type=${type}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Probe failed');
      }

      const result = await response.json() as ProbeResult;
      
      if (result.found) {
        toast.success(`Found: ${(result.data as Record<string, string>)?.title || code}`);
      } else {
        toast.warning(`Not found: ${code}`);
      }

      return result;
    } catch (error) {
      console.error('Probe error:', error);
      toast.error('Probe failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [canManage, session]);

  // Trigger full sync
  const triggerFullSync = useCallback(async () => {
    if (!canManage) {
      toast.error('SuperAdmin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('tga_sync_full');
      if (error) throw error;

      const result = data as { job_id: string; status: string };
      toast.success('Full sync queued');

      // Trigger the edge function to process
      if (result.job_id && session?.access_token) {
        supabase.functions.invoke('tga-sync', {
          body: {
            job_id: result.job_id,
            job_type: 'full',
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then(() => {
          fetchStatus();
          fetchJobs();
        });
      }

      await fetchStatus();
      await fetchJobs();
      return result;
    } catch (error) {
      console.error('Full sync error:', error);
      toast.error(error instanceof Error ? error.message : 'Sync failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [canManage, session, fetchStatus, fetchJobs]);

  // Trigger delta sync
  const triggerDeltaSync = useCallback(async (since?: Date) => {
    if (!canManage) {
      toast.error('SuperAdmin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('tga_sync_delta', {
        p_since: since?.toISOString() || null,
      });
      if (error) throw error;

      const result = data as { job_id: string; status: string; since: string };
      toast.success('Delta sync queued');

      // Trigger the edge function to process
      if (result.job_id && session?.access_token) {
        supabase.functions.invoke('tga-sync', {
          body: {
            job_id: result.job_id,
            job_type: 'delta',
            delta_since: result.since,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then(() => {
          fetchStatus();
          fetchJobs();
        });
      }

      await fetchStatus();
      await fetchJobs();
      return result;
    } catch (error) {
      console.error('Delta sync error:', error);
      toast.error(error instanceof Error ? error.message : 'Sync failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [canManage, session, fetchStatus, fetchJobs]);

  // Sync specific codes
  const syncCodes = useCallback(async (codes: string[]) => {
    if (!canManage || !session?.access_token) {
      toast.error('SuperAdmin access required');
      return null;
    }

    setLoading(true);
    try {
      // Create a job
      const { data: jobData, error: jobError } = await supabase
        .from('tga_sync_jobs')
        .insert({
          job_type: 'products',
          status: 'queued',
          created_by: session.user?.id,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Trigger sync
      const { data, error } = await supabase.functions.invoke('tga-sync', {
        body: {
          job_id: jobData.id,
          job_type: 'products',
          codes,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      toast.success(`Synced ${codes.length} codes`);
      await fetchStatus();
      await fetchJobs();
      return data;
    } catch (error) {
      console.error('Sync codes error:', error);
      toast.error('Sync failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [canManage, session, fetchStatus, fetchJobs]);

  // Run health check via RPC
  const runHealthCheck = useCallback(async () => {
    if (!canManage) {
      toast.error('SuperAdmin access required');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('tga_health_check');
      if (error) throw error;

      toast.success('Health check completed');
      await fetchStatus();
      return data;
    } catch (error) {
      console.error('Health check error:', error);
      toast.error('Health check failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [canManage, fetchStatus]);

  // Auto-refresh status
  useEffect(() => {
    if (canManage) {
      fetchStatus();
      fetchJobs();
    }
  }, [canManage, fetchStatus, fetchJobs]);

  return {
    loading,
    canManage,
    status,
    jobs,
    products,
    units,
    organisations,
    fetchStatus,
    fetchJobs,
    fetchProducts,
    fetchUnits,
    fetchOrganisations,
    testConnection,
    probeCode,
    triggerFullSync,
    triggerDeltaSync,
    syncCodes,
    runHealthCheck,
  };
}