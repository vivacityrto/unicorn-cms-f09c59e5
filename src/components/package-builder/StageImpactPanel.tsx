import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useStageImpact, useSyncStageToPackages } from '@/hooks/usePackageStageOverrides';
import { 
  Package, 
  RefreshCw, 
  FileStack, 
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface StageImpactPanelProps {
  stageId: number;
  stageName: string;
}

export function StageImpactPanel({ stageId, stageName }: StageImpactPanelProps) {
  const { packageCount, overrideCount, packages, loading, refetch } = useStageImpact(stageId);
  const { syncToPackages, syncing } = useSyncStageToPackages();
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [syncResult, setSyncResult] = useState<{ updated_count: number; skipped_count: number } | null>(null);

  const handleSync = async () => {
    try {
      const result = await syncToPackages(stageId);
      setSyncResult(result);
      setShowSyncConfirm(false);
      refetch();
    } catch (error) {
      // Error handled in hook
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Phase Impact
              </CardTitle>
              <CardDescription>
                How this phase is used across packages
              </CardDescription>
            </div>
            {packageCount > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowSyncConfirm(true)}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                )}
                Sync to Packages
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {packageCount === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>This phase is not used in any packages yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{packageCount}</div>
                  <div className="text-xs text-muted-foreground">Packages Using</div>
                </div>
                <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700">{overrideCount}</div>
                  <div className="text-xs text-amber-600">With Overrides</div>
                </div>
              </div>

              {/* Package list */}
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {packages.map(pkg => (
                    <div 
                      key={pkg.id}
                      className="flex items-center justify-between p-2 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{pkg.name}</span>
                        {pkg.hasOverrides ? (
                          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30">
                            <FileStack className="h-3 w-3 mr-1" />
                            Overrides
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Inherited
                          </Badge>
                        )}
                      </div>
                      <Link to={`/admin/packages/${pkg.id}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Sync result message */}
              {syncResult && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 inline-block mr-2 text-emerald-600" />
                  <span className="text-emerald-700">
                    Synced {syncResult.updated_count} package(s). 
                    {syncResult.skipped_count > 0 && ` ${syncResult.skipped_count} skipped due to overrides.`}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Confirmation Dialog */}
      <AlertDialog open={showSyncConfirm} onOpenChange={setShowSyncConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sync Phase to Packages
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will push the current phase template to all packages using this phase.
                </p>
                <div className="bg-muted p-3 rounded-lg space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span><strong>{packageCount - overrideCount}</strong> inherited packages will be updated</span>
                  </div>
                  {overrideCount > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span><strong>{overrideCount}</strong> packages with overrides will be partially updated (only non-overridden items)</span>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                'Sync Now'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
