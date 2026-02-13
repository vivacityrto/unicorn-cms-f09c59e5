import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Merge, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';

interface TenantSummary {
  tenant_id: number;
  name: string;
  identifier_type?: string;
  identifier_value?: string;
}

interface MergeResult {
  success: boolean;
  target_tenant_id: number;
  source_tenant_id: number;
  target_name: string;
  source_name: string;
  impact: Record<string, number | string>;
}

interface TenantMergeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetTenant: TenantSummary;
  sourceTenant: TenantSummary;
  reason?: string;
  onComplete?: () => void;
}

export function TenantMergeWizard({
  open,
  onOpenChange,
  targetTenant,
  sourceTenant,
  reason = 'Identifier conflict merge',
  onComplete,
}: TenantMergeWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'confirm' | 'merging' | 'done'>('confirm');
  const [mergeReason, setMergeReason] = useState(reason);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMerge = async () => {
    setStep('merging');
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('merge_tenants', {
        p_target_tenant_id: targetTenant.tenant_id,
        p_source_tenant_id: sourceTenant.tenant_id,
        p_reason: mergeReason,
      });

      if (rpcError) throw rpcError;

      const result = data as unknown as MergeResult;
      setMergeResult(result);
      setStep('done');

      toast({
        title: 'Merge Complete',
        description: `"${sourceTenant.name}" has been merged into "${targetTenant.name}".`,
      });
    } catch (err: any) {
      setError(err.message || 'Merge failed');
      setStep('confirm');
      toast({
        title: 'Merge Failed',
        description: err.message || 'An error occurred during the merge.',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    if (step === 'done') {
      onComplete?.();
    }
    setStep('confirm');
    setMergeResult(null);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]" style={{ width: '560px', maxWidth: '90vw' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'done' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Merge className="h-5 w-5" />
            )}
            {step === 'done' ? 'Merge Complete' : 'Merge Tenants'}
          </DialogTitle>
          <DialogDescription>
            {step === 'done'
              ? 'The source tenant has been archived and all data moved to the target.'
              : 'All data from the source will be moved to the target. The source tenant will be archived.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Merge direction visual */}
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">Target (keep)</p>
              <p className="font-medium text-sm">{targetTenant.name}</p>
              {targetTenant.identifier_type && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {targetTenant.identifier_type.toUpperCase()}: <span className="font-mono">{targetTenant.identifier_value}</span>
                </p>
              )}
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive mb-1">Source (archive)</p>
              <p className="font-medium text-sm">{sourceTenant.name}</p>
              {sourceTenant.identifier_type && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sourceTenant.identifier_type.toUpperCase()}: <span className="font-mono">{sourceTenant.identifier_value}</span>
                </p>
              )}
            </div>
          </div>

          {step === 'confirm' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="merge-reason">Merge Reason</Label>
                <Textarea
                  id="merge-reason"
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  placeholder="Why are these tenants being merged?"
                  rows={2}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1.5">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  This action cannot be undone
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 ml-5 list-disc">
                  <li>All records from "{sourceTenant.name}" will be moved to "{targetTenant.name}"</li>
                  <li>Non-conflicting identifiers will be transferred</li>
                  <li>Conflicting identifiers will be stored as aliases</li>
                  <li>The source tenant will be archived permanently</li>
                </ul>
              </div>
            </>
          )}

          {step === 'merging' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Merging tenant data…</p>
            </div>
          )}

          {step === 'done' && mergeResult && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong>{mergeResult.source_name}</strong> has been merged into{' '}
                <strong>{mergeResult.target_name}</strong>.
              </p>
              {Object.keys(mergeResult.impact).length > 0 && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Records Moved</p>
                  {Object.entries(mergeResult.impact).map(([table, count]) => (
                    <div key={table} className="flex justify-between text-xs">
                      <span className="font-mono text-muted-foreground">{table}</span>
                      <span className={typeof count === 'number' ? 'text-foreground' : 'text-destructive'}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleMerge}
                disabled={!mergeReason.trim()}
              >
                <Merge className="h-4 w-4 mr-2" />
                Confirm Merge
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
