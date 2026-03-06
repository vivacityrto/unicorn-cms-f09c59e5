import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FolderOpen, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SharePointFileBrowser } from '@/components/documents/SharePointFileBrowser';

interface SharePointLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  onSelectLink: (url: string) => void;
}

export function SharePointLinkDialog({ open, onOpenChange, tenantId, onSelectLink }: SharePointLinkDialogProps) {
  const [customUrl, setCustomUrl] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['tenant-sharepoint-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_sharepoint_settings')
        .select('root_folder_url, manual_folder_url, setup_mode, provisioning_status, validation_status')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!tenantId,
  });

  const folderUrl = settings?.setup_mode === 'manual'
    ? settings?.manual_folder_url
    : settings?.root_folder_url;

  // For manual setup mode, a valid validation is sufficient (provisioning is not required)
  const isProvisioned = (
    settings?.provisioning_status === 'success' ||
    settings?.validation_status === 'valid'
  ) && !!folderUrl;

  const handleInsertFolderLink = () => {
    if (folderUrl) {
      onSelectLink(folderUrl);
      onOpenChange(false);
    }
  };

  const handleInsertCustomUrl = () => {
    if (customUrl.trim()) {
      onSelectLink(customUrl.trim());
      setCustomUrl('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            SharePoint - Insert Link
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading SharePoint settings...
          </div>
        ) : !isProvisioned ? (
          <div className="text-center py-8 text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No SharePoint folder provisioned for this client.</p>
            <p className="text-xs mt-1">Provision a folder from the client's SharePoint settings first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick insert root folder link */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleInsertFolderLink} className="gap-1.5 shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
                Insert Root Folder Link
              </Button>
              <span className="text-xs text-muted-foreground truncate flex-1">{folderUrl}</span>
            </div>

            {/* Paste a specific SharePoint URL */}
            <div className="space-y-1.5">
              <Label className="text-xs">Or paste a SharePoint file/folder URL:</Label>
              <div className="flex gap-2">
                <Input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://vivacityteam.sharepoint.com/..."
                  className="text-sm"
                />
                <Button size="sm" onClick={handleInsertCustomUrl} disabled={!customUrl.trim()}>
                  Insert
                </Button>
              </div>
            </div>

            {/* Browse SharePoint files */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Browse files and insert link:</p>
              <SharePointFileBrowser
                tenantId={tenantId}
                onSelectLink={(url) => {
                  onSelectLink(url);
                  onOpenChange(false);
                }}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
