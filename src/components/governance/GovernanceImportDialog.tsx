import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalDescription, AppModalBody, AppModalFooter } from '@/components/ui/app-modal';
import { Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { SharePointTemplateBrowser, type SelectedTemplate } from '@/components/documents/SharePointTemplateBrowser';

interface ImportResult {
  fields_linked: number;
  detected_fields: Array<{ tag: string; field_id: number }>;
  invalid_tags: string[];
}

interface GovernanceImportDialogProps {
  documentId: number;
  documentTitle: string;
  frameworkType?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Map framework_type values to expected SharePoint subfolder names
const FRAMEWORK_FOLDER_MAP: Record<string, string> = {
  rto: 'RTO',
  gto: 'GTO',
  cricos: 'CRICOS',
};

export function GovernanceImportDialog({ documentId, documentTitle, frameworkType, open, onOpenChange, onSuccess }: GovernanceImportDialogProps) {
  const [importing, setImporting] = useState(false);
  const [selection, setSelection] = useState<SelectedTemplate | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const autoNavigateToFolder = frameworkType
    ? FRAMEWORK_FOLDER_MAP[frameworkType.toLowerCase()] || 'Other'
    : 'Other';

  const handleOpen = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setImportResult(null);
      setSelection(null);
    }
  };

  const handleImport = async () => {
    if (!selection) return;
    setImporting(true);
    setImportResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('import-sharepoint-template', {
        body: {
          action: 'import',
          document_id: documentId,
          source_drive_id: selection.driveId,
          source_item_id: selection.file.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Imported v${data.version_number} — ${data.file_name}`);

      setImportResult({
        fields_linked: data.fields_linked ?? 0,
        detected_fields: data.detected_fields ?? [],
        invalid_tags: data.invalid_tags ?? [],
      });

      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={handleOpen}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>Master Documents — Select Template File</AppModalTitle>
          <AppModalDescription>
            Browse the Master Documents library and select a file to link as a new version of "{documentTitle}".
          </AppModalDescription>
        </AppModalHeader>
        <AppModalBody>
          {!importResult && (
            <SharePointTemplateBrowser
              initialFilter={documentTitle || ''}
              autoNavigateToFolder={autoNavigateToFolder}
              onSelectionChange={setSelection}
            />
          )}

          {importResult && (
            <div className="mt-3 space-y-2">
              {importResult.fields_linked > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-green-800 dark:text-green-300">
                      {importResult.fields_linked} merge field{importResult.fields_linked !== 1 ? 's' : ''} detected and linked
                    </span>
                    <p className="text-green-700 dark:text-green-400 mt-0.5">
                      {importResult.detected_fields.map(f => `{{${f.tag}}}`).join(', ')}
                    </p>
                  </div>
                </div>
              )}
              {importResult.invalid_tags.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-amber-800 dark:text-amber-300">
                      {importResult.invalid_tags.length} unrecognised tag{importResult.invalid_tags.length !== 1 ? 's' : ''} found
                    </span>
                    <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                      {importResult.invalid_tags.map(t => `{{${t}}}`).join(', ')}
                    </p>
                  </div>
                </div>
              )}
              {importResult.fields_linked === 0 && importResult.invalid_tags.length === 0 && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  No merge field patterns detected in this template.
                </div>
              )}
            </div>
          )}
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button onClick={handleImport} disabled={!selection || importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Selected File
                </>
              )}
            </Button>
          )}
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
