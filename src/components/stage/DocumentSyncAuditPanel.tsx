import { useState } from 'react';
import { useDocumentSyncAudit, PackageSyncStatus } from '@/hooks/useDocumentSyncAudit';
import { useStageVersions } from '@/hooks/useStageVersions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody 
} from '@/components/ui/app-modal';
import { 
  RefreshCw, CheckCircle2, AlertTriangle, 
  Package, ArrowUpCircle, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface DocumentSyncAuditPanelProps {
  stageId: number;
}

interface DocListDialogState {
  open: boolean;
  title: string;
  tenantName: string;
  packageName: string;
  docIds: number[];
  type: 'extra' | 'missing';
}

function useDocumentNames(docIds: number[], enabled: boolean) {
  return useQuery({
    queryKey: ['document-names', docIds],
    queryFn: async () => {
      if (!docIds.length) return [];
      const { data, error } = await supabase
        .from('documents')
        .select('id, title')
        .in('id', docIds);
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && docIds.length > 0,
  });
}

export function DocumentSyncAuditPanel({ stageId }: DocumentSyncAuditPanelProps) {
  const { audit, isLoading, refetch } = useDocumentSyncAudit(stageId);
  const { publishVersion, isPublishing } = useStageVersions(stageId);
  const [dialog, setDialog] = useState<DocListDialogState>({
    open: false, title: '', tenantName: '', packageName: '', docIds: [], type: 'missing',
  });

  const handleSyncAll = () => {
    publishVersion({ notes: 'Sync: push missing document instances to active packages' });
  };

  const openDocList = (pkg: PackageSyncStatus, type: 'extra' | 'missing') => {
    const docIds = type === 'extra' ? pkg.extraDocIds : pkg.missingDocIds;
    if (!docIds.length) return;
    setDialog({
      open: true,
      title: type === 'extra' ? 'Extra Documents' : 'Missing Documents',
      tenantName: pkg.tenantName,
      packageName: pkg.packageName,
      docIds,
      type,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!audit || audit.totalPackages === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4" />
            Document Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active packages use this stage.</p>
        </CardContent>
      </Card>
    );
  }

  const allInSync = audit.totalInSync === audit.totalPackages;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                Document Sync Status
              </CardTitle>
              <Badge variant={allInSync ? 'default' : 'destructive'} className="text-xs">
                {audit.totalInSync} / {audit.totalPackages} in sync
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {!allInSync && (
                <Button 
                  size="sm" 
                  onClick={handleSyncAll} 
                  disabled={isPublishing}
                  isLoading={isPublishing}
                >
                  Sync All Packages
                </Button>
              )}
            </div>
          </div>
          <CardDescription className="text-xs">
            {audit.templateDocCount} template documents · Comparing against {audit.totalPackages} active package{audit.totalPackages !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {allInSync ? (
            <Alert className="border-primary/20 bg-primary/5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                All active packages have matching document instances.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
              {/* Header row */}
              <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Tenant · Package</span>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="w-12 text-right">Has</span>
                  <span className="w-12 text-right">Extra</span>
                  <span className="w-14 text-right">Missing</span>
                  <span className="w-5" />
                </div>
              </div>
              {audit.packages.map((pkg) => (
                <PackageSyncRow key={pkg.stageInstanceId} pkg={pkg} onClickCount={openDocList} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DocListDialog dialog={dialog} onOpenChange={(open) => setDialog(prev => ({ ...prev, open }))} />
    </>
  );
}

function PackageSyncRow({ pkg, onClickCount }: { pkg: PackageSyncStatus; onClickCount: (pkg: PackageSyncStatus, type: 'extra' | 'missing') => void }) {
  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 rounded-md text-sm",
      pkg.inSync ? "bg-muted/20" : "bg-destructive/5 border border-destructive/20"
    )}>
      <div className="flex items-center gap-2 min-w-0">
        <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium truncate">{pkg.tenantName}</span>
        <span className="text-muted-foreground truncate">· {pkg.packageName}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-2">
        <span className="w-12 text-right text-xs tabular-nums">{pkg.instanceDocCount}</span>
        <button
          type="button"
          disabled={pkg.extraCount === 0}
          onClick={() => onClickCount(pkg, 'extra')}
          className={cn(
            "w-12 text-right text-xs tabular-nums rounded px-1 py-0.5 transition-colors",
            pkg.extraCount > 0 
              ? "text-amber-600 font-medium hover:bg-accent cursor-pointer" 
              : "text-muted-foreground cursor-default"
          )}
        >
          {pkg.extraCount}
        </button>
        <button
          type="button"
          disabled={pkg.missingCount === 0}
          onClick={() => onClickCount(pkg, 'missing')}
          className={cn(
            "w-14 text-right text-xs tabular-nums rounded px-1 py-0.5 transition-colors",
            pkg.missingCount > 0 
              ? "text-destructive font-medium hover:bg-destructive/10 cursor-pointer" 
              : "text-muted-foreground cursor-default"
          )}
        >
          {pkg.missingCount}
        </button>
        {pkg.inSync ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
        )}
      </div>
    </div>
  );
}

function DocListDialog({ dialog, onOpenChange }: { dialog: DocListDialogState; onOpenChange: (open: boolean) => void }) {
  const { data: docs, isLoading } = useDocumentNames(dialog.docIds, dialog.open);

  return (
    <AppModal open={dialog.open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>{dialog.title}</AppModalTitle>
          <p className="text-sm text-muted-foreground">
            {dialog.tenantName} · {dialog.packageName}
          </p>
          <p className="text-xs text-muted-foreground">
            {dialog.docIds.length} document{dialog.docIds.length !== 1 ? 's' : ''}
          </p>
        </AppModalHeader>
        <AppModalBody>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-1">
              {(docs || []).map(doc => (
                <li key={doc.id} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-muted/30">
                  <span className="text-muted-foreground text-xs tabular-nums shrink-0">#{doc.id}</span>
                  <span>{doc.title || 'Untitled'}</span>
                </li>
              ))}
              {/* Show IDs not found in documents table (for extra/orphaned) */}
              {dialog.type === 'extra' && dialog.docIds
                .filter(id => !(docs || []).some(d => d.id === id))
                .map(id => (
                  <li key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-muted/50 text-muted-foreground">
                    <span className="text-xs tabular-nums shrink-0">#{id}</span>
                    <span className="italic">Template removed</span>
                  </li>
                ))
              }
            </ul>
          )}
        </AppModalBody>
      </AppModalContent>
    </AppModal>
  );
}
