import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TenantScopeItem {
  id: string;
  code: string;
  title: string;
  scope_type: 'qualification' | 'unit' | 'skillset' | 'accreditedCourse';
  status: string;
  is_superseded: boolean;
  superseded_by: string | null;
  last_refreshed_at: string;
  tga_data: Record<string, unknown> | null;
}

export interface ScopeSyncStatus {
  qualifications: number;
  units: number;
  skillsets: number;
  courses: number;
  total: number;
  last_synced_at: string | null;
}

/**
 * Fetch scope items from the unified tenant_rto_scope table
 */
export function useTenantRtoScope(tenantId: number | undefined, scopeType?: string) {
  return useQuery({
    queryKey: ['tenant-rto-scope', tenantId, scopeType],
    queryFn: async (): Promise<TenantScopeItem[]> => {
      if (!tenantId) return [];

      const { data, error } = await supabase.rpc('get_tenant_scope_items', {
        p_tenant_id: tenantId,
        p_scope_type: scopeType || null
      });

      if (error) {
        console.error('Failed to fetch scope items:', error);
        throw error;
      }
      
      return (data as unknown as TenantScopeItem[]) || [];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get scope sync status (counts by type)
 */
export function useScopeSyncStatus(tenantId: number | undefined) {
  return useQuery({
    queryKey: ['scope-sync-status', tenantId],
    queryFn: async (): Promise<ScopeSyncStatus | null> => {
      if (!tenantId) return null;

      const { data, error } = await supabase.rpc('get_tenant_scope_sync_status', {
        p_tenant_id: tenantId
      });

      if (error) {
        console.error('Failed to fetch scope sync status:', error);
        throw error;
      }
      
      // Parse JSONB result
      const result = typeof data === 'object' && data !== null ? data as unknown as ScopeSyncStatus : null;
      return result;
    },
    enabled: !!tenantId,
  });
}

/**
 * Trigger a full TGA sync using the REST API
 */
export function useTgaRestSync(tenantId: number, rtoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('tga-rto-sync', {
        body: { tenantId, rtoId }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Sync failed');
      
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Sync complete: ${data.total_scope_items} scope items`, {
        description: `Quals: ${data.scope_counts?.qualification || 0}, Units: ${data.scope_counts?.unit || 0}`
      });
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['tenant-rto-scope', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['scope-sync-status', tenantId] });
    },
    onError: (error: Error) => {
      toast.error('Sync failed', { description: error.message });
    }
  });
}

/**
 * Preview RTO data before syncing
 */
export function useTgaPreview() {
  return useMutation({
    mutationFn: async (rtoId: string) => {
      const { data, error } = await supabase.functions.invoke('tga-rto-preview', {
        body: { rtoId }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Preview failed');
      
      return data.data;
    },
    onError: (error: Error) => {
      toast.error('Preview failed', { description: error.message });
    }
  });
}

/**
 * Fetch scope items for a specific component type
 */
export function useTgaFetchScope() {
  return useMutation({
    mutationFn: async ({ rtoId, componentType }: { rtoId: string; componentType: string }) => {
      const { data, error } = await supabase.functions.invoke('tga-fetch-scope', {
        body: { rto_id: rtoId, component_type: componentType }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Fetch failed');
      
      return data;
    }
  });
}
