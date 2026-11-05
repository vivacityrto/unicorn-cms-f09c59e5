import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Pin } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { pinnedNotesKey } from '@/lib/notePin';
import type { ClientPackage } from '@/hooks/useClientManagement';
import {
  assessAllowanceAdjustment,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from '@/features/packages/allowanceAdjustment';

interface AdjustAllowanceDialogProps {
  pkg: ClientPackage | null;
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const fmt = (h: number) => `${Math.round(h * 100) / 100}`;

/**
 * SuperAdmin action to add (or take away) hours on a package. Applied by
 * adjust_package_allowance(), which also keeps the open renewal period in step,
 * writes an audit row and pins a note on the package explaining why its hours
 * differ from the standard allowance.
 */
export function AdjustAllowanceDialog({
  pkg,
  tenantId,
  open,
  onOpenChange,
  onSaved,
}: AdjustAllowanceDialogProps) {
  const queryClient = useQueryClient();
  const [deltaInput, setDeltaInput] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const assessment = useMemo(
    () =>
      pkg
        ? assessAllowanceAdjustment({
            currentHours: pkg.hours_included,
            usedHours: pkg.hours_used,
            deltaInput,
          })
        : null,
    [pkg, deltaInput],
  );

  if (!pkg) return null;

  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;
  const canSave = !!assessment?.valid && reasonOk && !saving;

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    if (!next) {
      setDeltaInput('');
      setReason('');
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    if (!canSave || assessment?.deltaHours == null) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('adjust_package_allowance', {
        p_instance_id: parseInt(pkg.id, 10),
        p_hours_delta: assessment.deltaHours,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast.success(`Hours updated to ${fmt(assessment.newTotalHours ?? 0)} h`);
      await queryClient.invalidateQueries({ queryKey: pinnedNotesKey(tenantId) });
      setDeltaInput('');
      setReason('');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to adjust the package hours');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Adjust package hours</DialogTitle>
          <DialogDescription>
            <strong>{pkg.package_name}</strong> — add hours to this package's allowance, or take
            some away to correct a mistake. The change is audited and pinned on the package.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current allowance</span>
              <span className="font-medium">{fmt(pkg.hours_included)} h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Used so far</span>
              <span className="font-medium">{fmt(pkg.hours_used)} h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">New allowance</span>
              <span className="font-medium">
                {assessment?.newTotalHours != null && !assessment.error
                  ? `${fmt(assessment.newTotalHours)} h`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`allowance-delta-${pkg.id}`}>Hours to add (negative to remove)</Label>
            <Input
              id={`allowance-delta-${pkg.id}`}
              inputMode="decimal"
              value={deltaInput}
              onChange={(e) => setDeltaInput(e.target.value)}
              placeholder="e.g. 161"
              disabled={saving}
              autoComplete="off"
            />
            {assessment?.error && <p className="text-sm text-destructive">{assessment.error}</p>}
            {assessment?.valid && assessment.daysLabel && (
              <p className="text-sm text-muted-foreground">{assessment.daysLabel}</p>
            )}
            {assessment?.warnings.map((w) => (
              <div
                key={w.code}
                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`allowance-reason-${pkg.id}`}>
              Why are the hours different? (pinned on the package)
            </Label>
            <Textarea
              id={`allowance-reason-${pkg.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
              placeholder="e.g. Client bought 24 consult days as one pool, replacing 24 separate packages"
              rows={3}
              disabled={saving}
            />
            {reason.length > 0 && !reasonOk && (
              <p className="text-xs text-muted-foreground">At least {MIN_REASON_LENGTH} characters.</p>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Pin className="h-3 w-3" />
              This text is shown on the package card to everyone who can see it.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save hours'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
