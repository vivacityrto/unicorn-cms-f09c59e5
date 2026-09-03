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
        // Step 1: client_package_stages → client_packages (active)
        const { data: cpsRows, error: cpsError } = await (supabase as any)
          .from('client_package_stages')
          .select('id, client_packages!inner(id, status, tenant_id)')
          .eq('stage_id', stageId)
          .in('client_packages.status', ['active', 'in_progress']);

        if (cpsError) throw cpsError;

        const tenantIds = Array.from(new Set(
          (cpsRows || [])
            .map((r: any) => r.client_packages?.tenant_id)
            .filter((v: any) => v != null)
        )) as number[];

        // Step 2: fetch tenant names separately (no FK relationship between client_packages and tenants)
        const tenantNameMap = new Map<number, string>();
        if (tenantIds.length > 0) {
          const { data: tenantsData, error: tErr } = await (supabase as any)
            .from('tenants')
            .select('tenant_id, name')
            .in('tenant_id', tenantIds);
          if (tErr) throw tErr;
          (tenantsData || []).forEach((t: any) => tenantNameMap.set(t.tenant_id, t.name));
        }

        const clients = tenantIds.map(id => ({
          tenant_id: id,
          tenant_name: tenantNameMap.get(id) || `Tenant #${id}`,
        }));

        setActiveUsage({
          count: cpsRows?.length || 0,
          clients,
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
