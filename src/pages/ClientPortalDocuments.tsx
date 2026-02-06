import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DocumentsHub } from '@/components/documents/DocumentsHub';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

export default function ClientPortalDocuments() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const parsedTenantId = tenantId ? parseInt(tenantId) : null;

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', parsedTenantId],
    queryFn: async () => {
      if (!parsedTenantId) return null;
      const { data, error } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', parsedTenantId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!parsedTenantId,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!parsedTenantId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Invalid tenant ID</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Back Button */}
      <Button 
        variant="ghost" 
        onClick={() => navigate(-1)}
        className="gap-2 hover:bg-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        {tenant?.name && (
          <p className="text-sm text-muted-foreground">{tenant.name}</p>
        )}
      </div>

      {/* Documents Hub - Client View */}
      <DocumentsHub 
        tenantId={parsedTenantId} 
        isClientView={true}
        tenantName={tenant?.name}
      />
    </div>
  );
}
