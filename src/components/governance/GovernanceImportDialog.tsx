import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalDescription, AppModalBody, AppModalFooter } from '@/components/ui/app-modal';
import { Folder, FileText, Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface SharePointItem {
  id: string;
  name: string;
  webUrl: string;
  isFolder: boolean;
  childCount: number;
  size: number;
  mimeType: string | null;
}

interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

interface ImportResult {
  fields_linked: number;
  detected_fields: Array<{ tag: string; field_id: number }>;
  invalid_tags: string[];
}

interface GovernanceImportDialogProps {
  documentId: number;
  documentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GovernanceImportDialog({ documentId, documentTitle, open, onOpenChange, onSuccess }: GovernanceImportDialogProps) {
  const [items, setItems] = useState<SharePointItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SharePointItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Root' }]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const browse = async (folderId?: string) => {
    setLoading(true);
    setSelectedFile(null);
    try {
      const { data, error } = await supabase.functions.invoke('import-sharepoint-template', {
        body: { action: 'browse', folder_id: folderId || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setItems(data.items || []);
      if (data.drive_id) setDriveId(data.drive_id);
      setInitialLoaded(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to browse SharePoint');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen && !initialLoaded) {
      browse();
    }
    if (!isOpen) {
      setImportResult(null);
    }
  };

  const navigateToFolder = (folder: SharePointItem) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    browse(folder.id);
  };

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    browse(crumb.id || undefined);
  };

  const handleImport = async () => {
    if (!selectedFile || !driveId) return;
    setImporting(true);
    setImportResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('import-sharepoint-template', {
        body: {
          action: 'import',
          document_id: documentId,
          source_drive_id: driveId,
          source_item_id: selectedFile.id,
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

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AppModal open={open} onOpenChange={handleOpen}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>Import Template from SharePoint</AppModalTitle>
          <AppModalDescription>
            Browse the Master Documents library and select a file to import as a new version of "{documentTitle}".
          </AppModalDescription>
        </AppModalHeader>
        <AppModalBody>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3 flex-wrap">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span>/</span>}
                <button
                  className="hover:text-primary hover:underline"
                  onClick={() => navigateToBreadcrumb(i)}
                  disabled={i === breadcrumbs.length - 1}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          {/* File list */}
          <div className="border rounded-lg max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No files or folders found
              </div>
            ) : (
              <div className="divide-y">
                {items
                  .sort((a, b) => {
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((item) => (
                    <button
                      key={item.id}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors ${
                        selectedFile?.id === item.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                      }`}
                      onClick={() => {
                        if (item.isFolder) {
                          navigateToFolder(item);
                        } else {
                          setSelectedFile(item);
                        }
                      }}
                    >
                      {item.isFolder ? (
                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate flex-1">{item.name}</span>
                      {!item.isFolder && (
                        <span className="text-xs text-muted-foreground shrink-0">{formatSize(item.size)}</span>
                      )}
                      {item.isFolder && (
                        <span className="text-xs text-muted-foreground shrink-0">{item.childCount} items</span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {selectedFile && !importResult && (
            <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm">
              <span className="font-medium">Selected:</span> {selectedFile.name}
              {selectedFile.mimeType && (
                <span className="text-muted-foreground ml-2">({selectedFile.mimeType})</span>
              )}
            </div>
          )}

          {/* Post-import merge field scan results */}
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
            <Button onClick={handleImport} disabled={!selectedFile || importing}>
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
