import { LinkedDocumentsList } from '@/components/documents/LinkedDocumentsList';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ClientSharePointDocumentsTabProps {
  tenantId: number;
  clientName: string;
}

export function ClientSharePointDocumentsTab({ tenantId, clientName }: ClientSharePointDocumentsTabProps) {
  const { data: settings } = useQuery({
    queryKey: ['tenant-sharepoint-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_sharepoint_settings')
        .select('root_folder_url, manual_folder_url, setup_mode, provisioning_status')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  const folderUrl = settings?.setup_mode === 'manual'
    ? settings?.manual_folder_url
    : settings?.root_folder_url;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">SharePoint & OneDrive Documents</h3>
          <p className="text-sm text-muted-foreground">
            Link documents from SharePoint or OneDrive to {clientName} for audit evidence and quick access.
          </p>
        </div>
        {settings?.provisioning_status === 'success' && folderUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={folderUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in SharePoint
            </a>
          </Button>
        )}
      </div>

      <LinkedDocumentsList
        clientId={tenantId}
        title={`Documents linked to ${clientName}`}
        showAddButton={true}
      />
    </div>
  );
}
