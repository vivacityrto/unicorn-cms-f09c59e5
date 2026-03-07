import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FolderOpen,
  FileText,
  ArrowLeft,
  Home,
  Download,
  Loader2,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSharePointBrowser, type SharePointItem } from '@/hooks/useSharePointBrowser';
import { formatDateTime } from '@/lib/utils';

interface SharePointFileBrowserProps {
  tenantId: number;
  onSelectLink?: (url: string, fileName?: string) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function SharePointFileBrowser({ tenantId, onSelectLink }: SharePointFileBrowserProps) {
  const { profile } = useAuth();
  const [settingsStatus, setSettingsStatus] = useState<{
    loaded: boolean;
    enabled: boolean;
    valid: boolean;
    rootName: string | null;
  }>({ loaded: false, enabled: false, valid: false, rootName: null });

  // Check if SharePoint is configured for this tenant
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('tenant_sharepoint_settings')
        .select('is_enabled, validation_status, root_name')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      setSettingsStatus({
        loaded: true,
        enabled: data?.is_enabled ?? false,
        valid: data?.validation_status === 'valid',
        rootName: data?.root_name ?? null,
      });
    };

    fetchSettings();
  }, [tenantId]);

  if (!settingsStatus.loaded) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!settingsStatus.enabled || !settingsStatus.valid) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              SharePoint folder not configured. Contact your consultant to set up document access.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return <FileBrowserContent tenantId={tenantId} rootName={settingsStatus.rootName} onSelectLink={onSelectLink} />;
}

function FileBrowserContent({
  tenantId,
  rootName,
  onSelectLink,
}: {
  tenantId: number;
  rootName: string | null;
  onSelectLink?: (url: string, fileName?: string) => void;
}) {
  const {
    items,
    isRoot,
    folderStack,
    isLoading,
    error,
    downloading,
    navigateToFolder,
    navigateBack,
    navigateToRoot,
    downloadFile,
    refetch,
  } = useSharePointBrowser(tenantId, { useSharedFolder: !!onSelectLink });

  // Sort: folders first, then files, both alphabetical
  const sortedItems = [...items].sort((a, b) => {
    if (a.is_folder && !b.is_folder) return -1;
    if (!a.is_folder && b.is_folder) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {rootName || 'SharePoint Documents'}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        {/* Breadcrumb */}
        {!isRoot && (
          <div className="flex items-center gap-1 text-sm mt-2">
            <Button variant="ghost" size="sm" onClick={navigateToRoot} className="h-6 px-2">
              <Home className="h-3 w-3 mr-1" />
              {rootName || 'Root'}
            </Button>
            {folderStack.slice(1).map((folder, idx) => (
              <span key={idx} className="flex items-center gap-1 text-muted-foreground">
                <ChevronRight className="h-3 w-3" />
                <span className="text-sm">{folder.name}</span>
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : 'Failed to load files'}
            </AlertDescription>
          </Alert>
        )}

        {/* Back button */}
        {!isRoot && (
          <Button
            variant="ghost"
            size="sm"
            onClick={navigateBack}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading files...
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">This folder is empty</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  onNavigate={navigateToFolder}
                  onDownload={downloadFile}
                  downloading={downloading}
                  onSelectLink={onSelectLink}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function FileRow({
  item,
  onNavigate,
  onDownload,
  downloading,
  onSelectLink,
}: {
  item: SharePointItem;
  onNavigate: (id: string, name: string) => void;
  onDownload: (id: string, name: string) => Promise<void>;
  downloading: string | null;
  onSelectLink?: (url: string, fileName?: string) => void;
}) {
  const isDownloading = downloading === item.id;

  return (
    <TableRow className={item.is_folder ? 'cursor-pointer hover:bg-muted/50' : ''}>
      <TableCell
        onClick={item.is_folder ? () => onNavigate(item.id, item.name) : undefined}
      >
        <div className="flex items-center gap-2">
          {item.is_folder ? (
            <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className={`text-sm ${item.is_folder ? 'font-medium text-primary' : ''}`}>
            {item.name}
          </span>
          {item.is_folder && item.child_count > 0 && (
            <span className="text-xs text-muted-foreground">
              ({item.child_count} items)
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.is_folder ? '—' : formatFileSize(item.size)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDateTime(item.last_modified)}
      </TableCell>
      <TableCell>
        {!item.is_folder && onSelectLink ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectLink(item.web_url)}
            title="Insert link"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ) : !item.is_folder ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDownload(item.id, item.name)}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
