import { useState } from 'react';
import { useDocumentSyncAudit, PackageSyncStatus } from '@/hooks/useDocumentSyncAudit';
import { useStageVersions } from '@/hooks/useStageVersions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  RefreshCw, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, 
  FileText, Package, Loader2, ArrowUpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentSyncAuditPanelProps {
  stageId: number;
}

export function DocumentSyncAuditPanel({ stageId }: DocumentSyncAuditPanelProps) {
  const { audit, isLoading, refetch } = useDocumentSyncAudit(stageId);
  const { publishVersion, isPublishing } = useStageVersions(stageId);
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpandedPackages(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
  const outOfSync = audit.packages.filter(p => !p.inSync);

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
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {audit.packages.map((pkg) => (
                <PackageSyncRow
                  key={pkg.stageInstanceId}
                  pkg={pkg}
                  isExpanded={expandedPackages.has(pkg.stageInstanceId)}
                  onToggle={() => toggleExpanded(pkg.stageInstanceId)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function PackageSyncRow({ 
  pkg, isExpanded, onToggle 
}: { 
  pkg: PackageSyncStatus; isExpanded: boolean; onToggle: () => void;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
          "hover:bg-muted/50",
          pkg.inSync ? "bg-muted/20" : "bg-destructive/5 border border-destructive/20"
        )}>
          <div className="flex items-center gap-2 min-w-0">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium truncate">{pkg.tenantName}</span>
            <span className="text-muted-foreground truncate">· {pkg.packageName}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-xs text-muted-foreground">
              {pkg.instanceDocCount} / {pkg.templateDocCount}
            </span>
            {pkg.inSync ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-8 mt-1 mb-2 space-y-2">
          {pkg.missingDocs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-destructive mb-1">
                Missing in package ({pkg.missingDocs.length})
              </p>
              <div className="space-y-0.5">
                {pkg.missingDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{doc.title}</span>
                    {doc.category && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{doc.category}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {pkg.orphanedInstances.length > 0 && (
            <div>
              <p className="text-xs font-medium text-brand-macaron-700 mb-1">
                Orphaned instances ({pkg.orphanedInstances.length})
              </p>
              <div className="space-y-0.5">
                {pkg.orphanedInstances.map(inst => (
                  <div key={inst.instanceId} className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{inst.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
