import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ClientBadgeProps {
  clientId?: number | string | null;
  className?: string;
}

export function ClientBadge({ clientId, className }: ClientBadgeProps) {
  const isNumericId = typeof clientId === 'number';

  // Query tenants for numeric IDs (rocks use tenant references)
  const { data: tenant } = useQuery({
    queryKey: ['tenant-name', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', clientId as number)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId && isNumericId,
  });

  // Query clients_legacy for string IDs (issues still use legacy references)
  const { data: legacyClient } = useQuery({
    queryKey: ['client-legacy-name', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients_legacy')
        .select('companyname, contactname')
        .eq('id', clientId as string)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId && !isNumericId,
  });

  const displayName = isNumericId 
    ? tenant?.name 
    : (legacyClient?.companyname || legacyClient?.contactname);

  if (!clientId || !displayName) return null;

  return (
    <Badge variant="secondary" className={`gap-1 ${className}`}>
      <Building2 className="w-3 h-3" />
      {displayName}
    </Badge>
  );
}
