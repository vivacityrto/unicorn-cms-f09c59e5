import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ActiveUsage {
  count: number;
  clients: { tenant_id: number; tenant_name: string }[];
}

export function useStageActiveUsage(stageId: number | null) {
  const [activeUsage, setActiveUsage] = useState<ActiveUsage>({ count: 0, clients: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stageId) {
      setActiveUsage({ count: 0, clients: [] });
      return;
    }

    const fetchActiveUsage = async () => {
      setLoading(true);
      try {
        // Get client packages that use this stage and are active
        const { data, error } = await (supabase as any)
          .from('client_package_stages')
          .select(`
            id,
            client_packages!inner(
              id,
              status,
              tenant_id,
              tenants(name)
            )
          `)
          .eq('stage_id', stageId)
          .in('client_packages.status', ['active', 'in_progress']);

        if (error) throw error;

        // Extract unique tenants
        const tenantsMap = new Map<number, string>();
        (data || []).forEach((row: any) => {
          const cp = row.client_packages;
          if (cp?.tenant_id && cp?.tenants?.name) {
            tenantsMap.set(cp.tenant_id, cp.tenants.name);
          }
        });

        const clients = Array.from(tenantsMap.entries()).map(([tenant_id, tenant_name]) => ({
          tenant_id,
          tenant_name
        }));

        setActiveUsage({
          count: data?.length || 0,
          clients
        });
      } catch (error) {
        console.error('Error fetching stage active usage:', error);
        setActiveUsage({ count: 0, clients: [] });
      } finally {
        setLoading(false);
      }
    };

    fetchActiveUsage();
  }, [stageId]);

  return { activeUsage, loading };
}
