import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalDescription, AppModalBody, AppModalFooter } from '@/components/ui/app-modal';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

interface GovernancePublishDialogProps {
  versionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GovernancePublishDialog({ versionId, open, onOpenChange, onSuccess }: GovernancePublishDialogProps) {
  const [publishing, setPublishing] = useState(false);
  const [driftError, setDriftError] = useState<string | null>(null);

  const handlePublish = async () => {
    setPublishing(true);
    setDriftError(null);

    try {
      const { data, error } = await supabase.functions.invoke('import-sharepoint-template', {
        body: { action: 'publish', version_id: versionId },
      });

      if (error) throw error;

      if (data?.error) {
        if (data.drift_detected) {
          setDriftError(data.error);
        } else {
          toast.error(data.error);
        }
        return;
      }

      toast.success(`Version v${data.version_number} published successfully`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader>
          <AppModalTitle>Publish Template Version</AppModalTitle>
          <AppModalDescription>
            This will make this version the active published template and archive the previous version.
          </AppModalDescription>
        </AppModalHeader>
        <AppModalBody>
          {driftError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-medium">
                <AlertTriangle className="h-4 w-4" />
                Source File Has Changed
              </div>
              <p className="text-sm text-muted-foreground">
                {driftError}
              </p>
              <p className="text-sm text-muted-foreground">
                Please re-import the template from SharePoint before publishing.
              </p>
            </div>
          )}
          {!driftError && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                A drift check will verify the source file has not changed since import.
                If the source has been modified, you will need to re-import before publishing.
              </p>
              <p className="text-sm font-medium">
                Are you sure you want to publish this version?
              </p>
            </div>
          )}
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
            Cancel
          </Button>
          {!driftError && (
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Publish
                </>
              )}
            </Button>
          )}
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
