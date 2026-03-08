import { useState, useEffect } from 'react';
import { format, addYears, parseISO, subYears } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Clock, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ClientPackage } from '@/hooks/useClientManagement';

interface RenewalConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: ClientPackage;
  tenantId: number;
  onSuccess: () => void;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  return m > 0 ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

export function RenewalConfirmDialog({ open, onOpenChange, pkg, tenantId, onSuccess }: RenewalConfirmDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [carryOverChoice, setCarryOverChoice] = useState<'carry' | 'forfeit' | null>(null);

  // Burndown data
  const [remainingMinutes, setRemainingMinutes] = useState(0);
  const [includedMinutes, setIncludedMinutes] = useState(0);
  const [cappedCarryOver, setCappedCarryOver] = useState(0);
  const [isCapped, setIsCapped] = useState(false);
  const [nullStatusCount, setNullStatusCount] = useState(0);

  // Renewal dates
  const currentRenewal = (pkg as any).next_renewal_date
    ? parseISO((pkg as any).next_renewal_date)
    : addYears(parseISO(pkg.membership_started_at), 1);
  const periodStart = subYears(currentRenewal, 1);
  const newRenewalDate = addYears(currentRenewal, 1);

  useEffect(() => {
    if (!open) return;
    setCarryOverChoice(null);
    setLoading(true);

    const fetchData = async () => {
      try {
        const instanceId = parseInt(pkg.id, 10);

        // Fetch burndown, included_minutes, and null-status stages in parallel
        const [burndownResult, instanceResult, nullStagesResult] = await Promise.all([
          (supabase as any)
            .from('v_package_burndown')
            .select('remaining_minutes, included_minutes')
            .eq('package_instance_id', instanceId)
            .maybeSingle(),
          (supabase as any)
            .from('package_instances')
            .select('included_minutes')
            .eq('id', instanceId)
            .single(),
          (supabase as any)
            .from('stage_instances')
            .select('id')
            .eq('packageinstance_id', instanceId)
            .is('status_id', null),
        ]);

        const remaining = burndownResult.data?.remaining_minutes ?? 0;
        const included = instanceResult.data?.included_minutes ?? 0;
        const carry = Math.max(0, Math.min(remaining, included));

        setRemainingMinutes(remaining);
        setIncludedMinutes(included);
        setCappedCarryOver(carry);
        setIsCapped(remaining > included && included > 0);
        setNullStatusCount(nullStagesResult.data?.length ?? 0);
        if (carry <= 0) {
          setCarryOverChoice('forfeit');
        }
      } catch (err) {
        console.error('Error fetching renewal data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, pkg]);

  const handleConfirm = async () => {
    if (!carryOverChoice) {
      toast.error('Please select a carry-over option before confirming.');
      return;
    }
    setProcessing(true);

    try {
      const instanceId = parseInt(pkg.id, 10);

      // 1. Update next_renewal_date
      const { error: renewError } = await (supabase as any)
        .from('package_instances')
        .update({ next_renewal_date: format(newRenewalDate, 'yyyy-MM-dd'), last_renewed_date: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', instanceId);
      if (renewError) throw renewError;

      // 2. Optionally insert carry-over negative time entry
      if (carryOverChoice === 'carry' && cappedCarryOver > 0) {
        const { error: timeError } = await supabase
          .from('time_entries')
          .insert({
            tenant_id: tenantId,
            client_id: tenantId,
            package_id: instanceId,
            user_id: profile?.user_uuid,
            duration_minutes: -cappedCarryOver,
            work_type: 'carry_over',
            is_billable: true,
            source: 'system',
            start_at: format(currentRenewal, "yyyy-MM-dd'T'00:00:00"),
            notes: `Carry-over of ${formatMinutes(cappedCarryOver)} from ${format(periodStart, 'dd MMM yyyy')} – ${format(currentRenewal, 'dd MMM yyyy')}.${isCapped ? ` Capped at package inclusion of ${formatMinutes(includedMinutes)}.` : ''}`,
          } as any);
        if (timeError) throw timeError;
      }

      // 3. Reset recurring staff tasks
      // Fetch stage_instances for this package instance
      const { data: stageInstances } = await (supabase as any)
        .from('stage_instances')
        .select('id')
        .eq('packageinstance_id', instanceId);

      if (stageInstances && stageInstances.length > 0) {
        const stageInstanceIds = stageInstances.map((si: any) => si.id);

        // Fetch task instances with their staff_task is_recurring flag
        const { data: taskInstances } = await (supabase as any)
          .from('staff_task_instances')
          .select('id, stafftask_id')
          .in('stageinstance_id', stageInstanceIds);

        if (taskInstances && taskInstances.length > 0) {
          const staffTaskIds = [...new Set(taskInstances.map((t: any) => t.stafftask_id).filter(Boolean))] as number[];

          if (staffTaskIds.length > 0) {
            const { data: staffTasks } = await supabase
              .from('staff_tasks')
              .select('id, is_recurring')
              .in('id', staffTaskIds);

            const recurringIds = new Set(
              (staffTasks || []).filter((st: any) => st.is_recurring).map((st: any) => st.id)
            );

            const tasksToReset = taskInstances
              .filter((ti: any) => ti.stafftask_id && recurringIds.has(ti.stafftask_id))
              .map((ti: any) => ti.id);

            if (tasksToReset.length > 0) {
              await (supabase as any)
                .from('staff_task_instances')
                .update({ status: 'not_started', status_id: 0, completion_date: null })
                .in('id', tasksToReset);
            }
          }
        }
      }

      // 4. Audit log
      const auditDetails = {
        remaining_minutes: remainingMinutes,
        carried_minutes: carryOverChoice === 'carry' ? cappedCarryOver : 0,
        included_minutes: includedMinutes,
        cap_applied: isCapped,
        from_period: format(periodStart, 'yyyy-MM-dd'),
        to_period: format(currentRenewal, 'yyyy-MM-dd'),
        new_renewal_date: format(newRenewalDate, 'yyyy-MM-dd'),
      };

      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: carryOverChoice === 'carry' ? 'renewal_time_carry_over' : 'renewal_time_forfeit',
        entity_type: 'package_instances',
        entity_id: pkg.id,
        details: auditDetails,
      });

      // 5. Create renewal note
      const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown' : 'Unknown';
      const renewedAt = new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
      const carryText = carryOverChoice === 'carry' && cappedCarryOver > 0
        ? `${formatMinutes(cappedCarryOver)} carried over to the new period${isCapped ? ` (capped at package inclusion of ${formatMinutes(includedMinutes)})` : ''}.`
        : 'No time carried over (forfeited).';

      // Look up legacy client_id
      const { data: clientRow } = await (supabase as any)
        .from('v_client_to_tenant')
        .select('client_id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const legacyClientId = clientRow?.client_id || String(tenantId);

      const { error: noteError } = await supabase.rpc('rpc_create_client_note', {
        p_tenant_id: tenantId,
        p_client_id: legacyClientId,
        p_note_type: 'general',
        p_title: `Package Renewed: ${pkg.package_name}`,
        p_content: `<p><strong>${pkg.package_name}</strong> was renewed by ${userName} on ${renewedAt}.</p><p>Previous period: ${format(periodStart, 'dd MMM yyyy')} – ${format(currentRenewal, 'dd MMM yyyy')}.</p><p>New renewal date: ${format(newRenewalDate, 'dd MMM yyyy')}.</p><p>${carryText}</p>`,
        p_tags: ['renewal'],
        p_related_entity_type: 'package_instances',
        p_related_entity_id: pkg.id,
        p_is_pinned: false,
      });
      if (noteError) {
        console.error('Failed to create renewal note:', noteError);
        toast.error('Renewal succeeded but failed to create the renewal note.');
      }

      toast.success(
        `${pkg.package_name} renewed — next renewal ${format(newRenewalDate, 'dd MMM yyyy')}${carryOverChoice === 'carry' && cappedCarryOver > 0 ? ` (${formatMinutes(cappedCarryOver)} carried over)` : ''}`
      );
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error('Renewal error:', err);
      toast.error(err.message || 'Failed to renew package');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Renew Package
          </DialogTitle>
          <DialogDescription>
            Renew <strong>{pkg.package_name}</strong> for another year.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {nullStatusCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">
                  There {nullStatusCount === 1 ? 'is' : 'are'} {nullStatusCount} Stage{nullStatusCount === 1 ? '' : 's'} with no status selected. All stages must have a status selected.
                </p>
              </div>
            )}
            {/* Current period info */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Period</span>
                <span className="font-medium">
                  {format(periodStart, 'dd MMM yyyy')} — {format(currentRenewal, 'dd MMM yyyy')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">New Renewal Date</span>
                <span className="font-medium flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" />
                  {format(newRenewalDate, 'dd MMM yyyy')}
                </span>
              </div>
            </div>

            <Separator />

            {/* Unused time */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Unused Consultation Time</span>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Remaining Balance</span>
                  <Badge variant="secondary">{formatMinutes(remainingMinutes)}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Package Inclusion</span>
                  <span>{formatMinutes(includedMinutes)}</span>
                </div>
                {isCapped && (
                  <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded p-2 mt-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Balance exceeds package inclusion. Carry-over is capped at {formatMinutes(includedMinutes)} (only included time can be carried forward — no compounding of carry-over).
                    </span>
                  </div>
                )}
                {cappedCarryOver > 0 && (
                  <div className="flex items-center justify-between text-sm font-medium pt-1 border-t">
                    <span>Eligible Carry-Over</span>
                    <Badge variant="outline" className="text-primary border-primary/30">
                      {formatMinutes(cappedCarryOver)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Carry-over options */}
              {cappedCarryOver > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCarryOverChoice('carry')}
                    className={`rounded-lg border-2 p-3 text-left transition-colors ${
                      carryOverChoice === 'carry'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <span className="font-medium text-sm">Carry Over</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Credit {formatMinutes(cappedCarryOver)} to the next period
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCarryOverChoice('forfeit')}
                    className={`rounded-lg border-2 p-3 text-left transition-colors ${
                      carryOverChoice === 'forfeit'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <span className="font-medium text-sm">Forfeit</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Unused time will not carry over
                    </p>
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No unused consultation time to carry over.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={processing || loading || nullStatusCount > 0 || (cappedCarryOver > 0 && !carryOverChoice)}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Renewing…
              </>
            ) : (
              'Confirm Renewal'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
