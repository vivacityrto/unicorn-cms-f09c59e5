import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, ClipboardList } from 'lucide-react';
import { DocumentsHub } from '@/components/documents/DocumentsHub';
import { UploadDocumentDialog } from '@/components/documents/dialogs/UploadDocumentDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

export default function TenantDocumentsHub() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const parsedTenantId = tenantId ? parseInt(tenantId) : null;
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

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
        onClick={() => navigate(`/tenant/${tenantId}`)}
        className="gap-2 hover:bg-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Client
      </Button>

      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Documents Hub</h1>
          {tenant?.name && (
            <p className="text-sm text-muted-foreground">{tenant.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => setUploadDialogOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* Documents Hub - Staff View */}
      <DocumentsHub 
        tenantId={parsedTenantId} 
        isClientView={false}
        tenantName={tenant?.name}
      />

      {/* Upload Dialog */}
      <UploadDocumentDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        tenantId={parsedTenantId}
        direction="vivacity_to_client"
      />
    </div>
  );
}
