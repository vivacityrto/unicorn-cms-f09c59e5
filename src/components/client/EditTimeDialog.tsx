import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { ScopeSelectorBadge } from './ScopeSelectorBadge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TimeEntry } from '@/hooks/useTimeTracking';
import type { ScopeTag } from '@/hooks/useTenantMemberships';

interface WorkTypeOption {
  code: string;
  label: string;
}

interface EditTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimeEntry | null;
  onSuccess?: () => void;
}

export function EditTimeDialog({ open, onOpenChange, entry, onSuccess }: EditTimeDialogProps) {
  const { toast } = useToast();
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [date, setDate] = useState('');
  const [workType, setWorkType] = useState('general');
  const [notes, setNotes] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [scopeTag, setScopeTag] = useState<ScopeTag>('both');
  const [saving, setSaving] = useState(false);
  const [workTypes, setWorkTypes] = useState<WorkTypeOption[]>([]);

  // Fetch work types
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('dd_work_types')
        .select('code, label')
        .eq('is_active', true)
        .order('sort_order');
      if (data) setWorkTypes(data as WorkTypeOption[]);
    })();
  }, []);

  // Populate form when entry changes
  useEffect(() => {
    if (entry && open) {
      const h = Math.floor(entry.duration_minutes / 60);
      const m = entry.duration_minutes % 60;
      setHours(h.toString());
      setMinutes(m.toString());
      setDate(
        entry.start_at
          ? format(new Date(entry.start_at), 'yyyy-MM-dd')
          : format(new Date(entry.created_at), 'yyyy-MM-dd')
      );
      setWorkType(entry.work_type);
      setNotes(entry.notes || '');
      setIsBillable(entry.is_billable);
      setScopeTag((entry.scope_tag as ScopeTag) || 'both');
    }
  }, [entry, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;

    const totalMinutes = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    if (totalMinutes <= 0) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          duration_minutes: totalMinutes,
          start_at: `${date}T00:00:00`,
          work_type: workType,
          notes: notes || null,
          is_billable: isBillable,
          scope_tag: scopeTag,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', entry.id);

      if (error) throw error;

      toast({ title: 'Time entry updated' });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader>
          <AppModalTitle>Edit Time Entry</AppModalTitle>
        </AppModalHeader>
        <form onSubmit={handleSubmit}>
          <AppModalBody className="space-y-4">
            {/* Scope */}
            <div className="space-y-2">
              <Label>Allocation</Label>
              <ScopeSelectorBadge value={scopeTag} onChange={setScopeTag} showSelector />
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="text-center"
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="45"
                    step="15"
                    value={minutes}
                    onChange={(e) => {
                      const val = Math.round(parseInt(e.target.value) / 15) * 15;
                      setMinutes(String(Math.max(0, Math.min(45, isNaN(val) ? 0 : val))));
                    }}
                    className="text-center"
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {/* Work Type */}
            <div className="space-y-2">
              <Label>Work Type</Label>
              <Select value={workType} onValueChange={setWorkType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workTypes.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Billable */}
            <div className="flex items-center justify-between">
              <Label>Billable</Label>
              <Switch checked={isBillable} onCheckedChange={setIsBillable} />
            </div>
          </AppModalBody>
          <AppModalFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </AppModalFooter>
        </form>
      </AppModalContent>
    </AppModal>
  );
}
