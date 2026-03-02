import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderOpen, ExternalLink, AlertCircle, CheckCircle2, FolderPlus, FolderSearch } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SharePointFileBrowser } from '@/components/documents/SharePointFileBrowser';

interface SharePointFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
}

export function SharePointFolderDialog({ open, onOpenChange, tenantId }: SharePointFolderDialogProps) {
  const { toast } = useToast();
  const [provisioning, setProvisioning] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: ['tenant-basic', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenants')
        .select('name, rto_id, status')
        .eq('id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!tenantId,
  });

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ['tenant-sharepoint-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_sharepoint_settings')
        .select('root_folder_url, manual_folder_url, setup_mode, provisioning_status, root_name, is_enabled, validation_status')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!tenantId,
  });

  const folderUrl = settings?.setup_mode === 'manual'
    ? settings?.manual_folder_url
    : settings?.root_folder_url;

  const isProvisioned = settings?.provisioning_status === 'success' && !!folderUrl;
  const isValid = settings?.validation_status === 'valid';

  // Build expected folder name
  const expectedFolderName = tenant?.rto_id
    ? `${tenant.rto_id} - ${tenant.name}`
    : `KS-${tenant?.name || ''}`;

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-tenant-sharepoint-folder', {
        body: { tenant_id: tenantId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Folder provisioned', description: `SharePoint folder created for ${tenant?.name}.` });
      refetch();
    } catch (err: any) {
      toast({ title: 'Provisioning failed', description: err.message, variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setShowBrowser(false); }}>
      <DialogContent className={showBrowser ? "sm:max-w-4xl max-h-[85vh] overflow-y-auto" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            SharePoint Client Folder
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Tenant info */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Client</span>
                <span className="text-sm">{tenant?.name || '—'}</span>
              </div>
              {tenant?.rto_id && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">RTO ID</span>
                  <span className="text-sm">{tenant.rto_id}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Expected folder</span>
                <span className="text-sm font-mono text-muted-foreground">{expectedFolderName}</span>
              </div>
            </div>

            {/* Status */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                {isProvisioned ? (
                  <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Provisioned
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-orange-500/40 bg-orange-50 text-orange-800">
                    <AlertCircle className="h-3 w-3" />
                    Not provisioned
                  </Badge>
                )}
              </div>
              {settings?.root_name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Folder name</span>
                  <span className="text-sm">{settings.root_name}</span>
                </div>
              )}
              {settings?.setup_mode && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Setup mode</span>
                  <Badge variant="secondary" className="text-xs">{settings.setup_mode}</Badge>
                </div>
              )}
            </div>

            {/* Actions */}
            {isProvisioned && folderUrl ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button className="flex-1" variant="outline" asChild>
                    <a href={folderUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in SharePoint
                    </a>
                  </Button>
                  <Button
                    className="flex-1"
                    variant={showBrowser ? 'secondary' : 'default'}
                    onClick={() => setShowBrowser(!showBrowser)}
                  >
                    <FolderSearch className="h-4 w-4 mr-2" />
                    {showBrowser ? 'Hide Browser' : 'Browse Files'}
                  </Button>
                </div>
                {showBrowser && (
                  <div className="mt-4">
                    <SharePointFileBrowser tenantId={tenantId} />
                  </div>
                )}
              </div>
            ) : (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No SharePoint folder is linked to this client. You can provision one now.
                  </AlertDescription>
                </Alert>
                <Button
                  className="w-full"
                  onClick={handleProvision}
                  disabled={provisioning || tenant?.status !== 'active'}
                >
                  {provisioning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FolderPlus className="h-4 w-4 mr-2" />
                  )}
                  Provision SharePoint Folder
                </Button>
                {tenant?.status !== 'active' && (
                  <p className="text-xs text-muted-foreground text-center">
                    Provisioning is only available for active tenants.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
