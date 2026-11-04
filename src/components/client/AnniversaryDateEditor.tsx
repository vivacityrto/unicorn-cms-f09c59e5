import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Calendar as CalendarIcon, Loader2, Pencil, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { ClientPackage } from '@/hooks/useClientManagement';
import {
  assessAnniversaryChange,
  defaultAnniversary,
  isCustomPeriod,
  MIN_REASON_LENGTH,
} from '@/features/packages/anniversaryOverride';

interface AnniversaryDateEditorProps {
  pkg: ClientPackage;
  /** Only SuperAdmins may change the date (the server enforces this too). */
  canEdit: boolean;
  onSaved?: () => void;
}

const fmt = (d: Date) => format(d, 'd MMM yyyy');

/**
 * The package card's anniversary / current-period date, with a SuperAdmin
 * override. The date is the END of the package's hours window, so the dialog
 * previews the period length and renewal-due effect before saving, and the
 * change is applied by set_package_anniversary_date() (audited, keeps the open
 * renewal period and stored hours in step).
 */
export function AnniversaryDateEditor({ pkg, canEdit, onSaved }: AnniversaryDateEditorProps) {
  const [open, setOpen] = useState(false);
  const [proposed, setProposed] = useState<Date | undefined>();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const showsPeriod = !!(pkg.start_renewal_date && pkg.last_renewed_date);
  const periodStart = useMemo(
    () => parseISO(pkg.start_renewal_date ?? pkg.membership_started_at),
    [pkg.start_renewal_date, pkg.membership_started_at],
  );
  const current = pkg.next_renewal_date ? parseISO(pkg.next_renewal_date) : null;

  const assessment = useMemo(
    () =>
      current
        ? assessAnniversaryChange({ periodStart, currentAnniversary: current, proposed })
        : null,
    [periodStart, current, proposed],
  );

  if (!current) return null;

  const custom = isCustomPeriod(periodStart, current);
  const standard = defaultAnniversary(periodStart);
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;
  const canSave = !!assessment?.valid && reasonOk && !saving;

  const label = showsPeriod
    ? `Current period ${fmt(periodStart)} – ${fmt(current)}`
    : `Anniversary ${fmt(current)}`;

  const openDialog = () => {
    setProposed(current);
    setReason('');
    setOpen(true);
  };

  const handleSave = async () => {
    if (!proposed || !canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_package_anniversary_date', {
        p_instance_id: parseInt(pkg.id, 10),
        p_new_date: format(proposed, 'yyyy-MM-dd'),
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast.success(`Anniversary updated to ${fmt(proposed)}`);
      setOpen(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update the anniversary date');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
        {custom && (
          <Badge
            variant="outline"
            className="ml-1 h-5 px-1.5 text-[10px] border-amber-500/50 text-amber-600"
            title={`Not a standard one-year period (standard would be ${fmt(standard)})`}
          >
            Custom
          </Badge>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            aria-label="Edit anniversary date"
            onClick={(e) => {
              e.stopPropagation();
              openDialog();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Edit anniversary date</DialogTitle>
            <DialogDescription>
              <strong>{pkg.package_name}</strong> — the anniversary is the end of the current hours
              period. Changing it moves the period and recalculates hours used.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period start</span>
                <span className="font-medium">{fmt(periodStart)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current anniversary</span>
                <span className="font-medium">{fmt(current)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Standard (one year)</span>
                <span className="font-medium">{fmt(standard)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>New anniversary date</Label>
              <div className="flex gap-2">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('flex-1 justify-start text-left font-normal', !proposed && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {proposed ? format(proposed, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={proposed}
                      defaultMonth={proposed ?? current}
                      onSelect={(d) => {
                        setProposed(d);
                        setPickerOpen(false);
                      }}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProposed(standard)}
                  disabled={saving}
                  title={`Reset to one year after the period start (${fmt(standard)})`}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Standard
                </Button>
              </div>

              {assessment?.error && (
                <p className="text-sm text-destructive">{assessment.error}</p>
              )}
              {assessment && assessment.periodDays !== null && !assessment.error && (
                <p className="text-sm text-muted-foreground">
                  New period length: <span className="font-medium text-foreground">{assessment.periodDays} days</span>
                </p>
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
              <Label htmlFor={`anniv-reason-${pkg.id}`}>Reason (recorded in the audit log)</Label>
              <Textarea
                id={`anniv-reason-${pkg.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Client agreed an extended first term to 4 Nov 2027"
                rows={3}
                disabled={saving}
              />
              {reason.length > 0 && !reasonOk && (
                <p className="text-xs text-muted-foreground">
                  At least {MIN_REASON_LENGTH} characters.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save anniversary date'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
