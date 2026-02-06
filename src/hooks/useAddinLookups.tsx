import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClientOption {
  id: number;
  name: string;
}

export interface PackageOption {
  id: number;
  name: string;
  client_id?: number | null;
}

export interface UserOption {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export function useAddinLookups(tenantId?: number | null) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLookups() {
      if (!tenantId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        // Load clients (tenants that are not system tenants)
        const { data: clientsData } = await supabase
          .from('tenants')
          .select('id, name')
          .neq('is_system_tenant', true)
          .order('name');

        if (clientsData) {
          // Cast to avoid deep type inference
          const typedClients = clientsData as unknown as ClientOption[];
          setClients(typedClients);
        }

        // Load all packages with client_id for filtering
        const { data: packagesData } = await supabase
          .from('packages')
          .select('id, name, client_id')
          .order('name');

        if (packagesData) {
          const typedPackages = packagesData as unknown as { id: number; name: string; client_id: number | null }[];
          setPackages(typedPackages.map(p => ({
            id: p.id,
            name: p.name,
            client_id: p.client_id,
          })));
        }

        // Load tenant users - build query step by step
        let query = supabase.from('tenant_users').select('user_id');
        // Apply the tenant filter
        query = query.eq('tenant_id', tenantId);
        // Apply the status filter - use match to avoid chaining issues
        const { data: tuData } = await query.match({ status: 'active' });
        
        if (tuData && tuData.length > 0) {
          const typedTuData = tuData as unknown as { user_id: string }[];
          const userIds = typedTuData.map(tu => tu.user_id);
          
          const { data: usersData } = await supabase
            .from('users')
            .select('user_uuid, email, first_name, last_name')
            .in('user_uuid', userIds);

          if (usersData) {
            setUsers(usersData as unknown as UserOption[]);
          }
        }
      } catch (error) {
        console.error('[useAddinLookups] Error loading lookups:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadLookups();
  }, [tenantId]);

  return {
    clients,
    packages,
    users,
    isLoading,
  };
}
