import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Folder, FileText, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';

export interface SharePointItem {
  id: string;
  name: string;
  webUrl: string;
  isFolder: boolean;
  childCount: number;
  size: number;
  mimeType: string | null;
}

export interface SelectedTemplate {
  file: SharePointItem;
  driveId: string;
  folderName: string;
}

interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

interface Props {
  initialFilter?: string;
  autoNavigateToFolder?: string | null;
  onSelectionChange: (sel: SelectedTemplate | null) => void;
}

export function SharePointTemplateBrowser({
  initialFilter = '',
  autoNavigateToFolder = null,
  onSelectionChange,
}: Props) {
  const [items, setItems] = useState<SharePointItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SharePointItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Root' }]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [filterText, setFilterText] = useState(initialFilter);
  const [hideImported, setHideImported] = useState(false);
  const [importedItemIds, setImportedItemIds] = useState<Set<string>>(new Set());
  const autoNavigatedRef = useRef(false);

  const fetchImportedItemIds = async () => {
    try {
      const { data, error } = await supabase
        .from('document_versions')
        .select('source_drive_item_id')
        .not('source_drive_item_id', 'is', null);
      if (error) throw error;
      const ids = new Set<string>((data || []).map((row) => row.source_drive_item_id as string));
      setImportedItemIds(ids);
    } catch (err: any) {
      console.error('Failed to load imported item IDs:', err.message);
    }
  };

  const browse = async (folderId?: string) => {
    setLoading(true);
    setSelectedFile(null);
    onSelectionChange(null);
    try {
      const { data, error } = await supabase.functions.invoke('import-sharepoint-template', {
        body: { action: 'browse', folder_id: folderId || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setItems(data.items || []);
      if (data.drive_id) setDriveId(data.drive_id);
      setInitialLoaded(true);
      await fetchImportedItemIds();
      return data.items || [];
    } catch (err: any) {
      toast.error(err.message || 'Failed to browse SharePoint');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Initial load on mount
  useEffect(() => {
    browse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-navigate to target folder once, after initial root load
  useEffect(() => {
    if (autoNavigatedRef.current || !autoNavigateToFolder || !initialLoaded || items.length === 0) return;
    if (breadcrumbs.length !== 1) return; // only from root
    const target = items.find(
      (item) => item.isFolder && item.name.toLowerCase() === autoNavigateToFolder.toLowerCase(),
    );
    if (target) {
      autoNavigatedRef.current = true;
      setBreadcrumbs((prev) => [...prev, { id: target.id, name: target.name }]);
      browse(target.id);
    } else {
      autoNavigatedRef.current = true;
    }
  }, [initialLoaded, items, autoNavigateToFolder, breadcrumbs.length]);

  const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name || 'Root';

  const navigateToFolder = (folder: SharePointItem) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    browse(folder.id);
  };

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index];
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    browse(crumb.id || undefined);
  };

  const handleSelectFile = (file: SharePointItem) => {
    setSelectedFile(file);
    if (driveId) {
      onSelectionChange({ file, driveId, folderName: currentFolderName });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredItems = items
    .filter((item) => {
      if (!filterText.trim()) return true;
      if (item.isFolder) return true;
      return item.name.toLowerCase().includes(filterText.toLowerCase());
    })
    .filter((item) => {
      if (!hideImported || item.isFolder) return true;
      return !importedItemIds.has(item.id);
    })
    .sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div>
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

      {/* Filter input */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter files by name..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {filterText && (
          <button
            onClick={() => setFilterText('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* File list */}
      <div className="border rounded-lg max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {filterText ? 'No files match your filter' : 'No files or folders found'}
          </div>
        ) : (
          <div className="divide-y">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors ${
                  selectedFile?.id === item.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                }`}
                onClick={() => {
                  if (item.isFolder) navigateToFolder(item);
                  else handleSelectFile(item);
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

      {selectedFile && (
        <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm">
          <span className="font-medium">Selected:</span> {selectedFile.name}
          {selectedFile.mimeType && (
            <span className="text-muted-foreground ml-2">({selectedFile.mimeType})</span>
          )}
        </div>
      )}
    </div>
  );
}
