import { useDocumentSyncAudit, PackageSyncStatus } from '@/hooks/useDocumentSyncAudit';
import { useStageVersions } from '@/hooks/useStageVersions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  RefreshCw, CheckCircle2, AlertTriangle, 
  Package, ArrowUpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentSyncAuditPanelProps {
  stageId: number;
}

export function DocumentSyncAuditPanel({ stageId }: DocumentSyncAuditPanelProps) {
  const { audit, isLoading, refetch } = useDocumentSyncAudit(stageId);
  const { publishVersion, isPublishing } = useStageVersions(stageId);

  const handleSyncAll = () => {
    publishVersion({ notes: 'Sync: push missing document instances to active packages' });
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
              <PackageSyncRow key={pkg.stageInstanceId} pkg={pkg} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PackageSyncRow({ pkg }: { pkg: PackageSyncStatus }) {
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
        <span className={cn(
          "w-12 text-right text-xs tabular-nums",
          pkg.extraCount > 0 && "text-amber-600 font-medium"
        )}>{pkg.extraCount}</span>
        <span className={cn(
          "w-14 text-right text-xs tabular-nums",
          pkg.missingCount > 0 && "text-destructive font-medium"
        )}>{pkg.missingCount}</span>
        {pkg.inSync ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
        )}
      </div>
    </div>
  );
}
