import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ClientBadgeProps {
  clientId?: string | null;
  className?: string;
}

export function ClientBadge({ clientId, className }: ClientBadgeProps) {
  const { data: client } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients_legacy')
        .select('companyname, contactname')
        .eq('id', clientId!)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (!clientId || !client) return null;

  return (
    <Badge variant="secondary" className={`gap-1 ${className}`}>
      <Building2 className="w-3 h-3" />
      {client.companyname || client.contactname}
    </Badge>
  );
}
