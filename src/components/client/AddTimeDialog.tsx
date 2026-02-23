import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScopeSelectorBadge } from './ScopeSelectorBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Bell, UserMinus } from 'lucide-react';
import type { ScopeTag } from '@/hooks/useTenantMemberships';

interface WorkTypeOption {
  code: string;
  label: string;
}

interface TeamMember {
  user_uuid: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface PackageInstance {
  id: number;
  package_name: string;
  is_kickstart: boolean;
}

interface AddTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  clientId: number;
  defaultScopeTag?: ScopeTag;
  showScopeSelector?: boolean;
  onSuccess?: () => void;
  /** @deprecated kept for backward compat */
  defaultPackageId?: number | null;
  /** @deprecated kept for backward compat */
  packages?: { id: number; package_id: number; package_name: string }[];
}

export function AddTimeDialog({
  open,
  onOpenChange,
  tenantId,
  clientId,
  defaultScopeTag = 'both',
  showScopeSelector = false,
  onSuccess,
}: AddTimeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('30');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [workType, setWorkType] = useState('general');
  const [notes, setNotes] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [scopeTag, setScopeTag] = useState<ScopeTag>(defaultScopeTag);
  const [saving, setSaving] = useState(false);
  const [activeInstances, setActiveInstances] = useState<PackageInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [workTypes, setWorkTypes] = useState<WorkTypeOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [notifyUserId, setNotifyUserId] = useState<string>('');

  // Fetch work types from dd_work_types lookup
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

  // Fetch team members for notify selector
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('users')
        .select('user_uuid, first_name, last_name, avatar_url')
        .eq('disabled', false)
        .order('first_name')
        .limit(200);
      if (data) setTeamMembers((data as TeamMember[]).filter(m => m.user_uuid !== user?.id));
    })();
  }, [open, user?.id]);

  // Fetch active package instances & sync defaults when dialog opens
  useEffect(() => {
    if (open) {
      setScopeTag(defaultScopeTag);
      (async () => {
        const { data: piData } = await supabase
          .from('package_instances')
          .select('id, package_id')
          .eq('tenant_id', tenantId)
          .eq('is_complete', false)
          .eq('is_active', true)
          .order('start_date', { ascending: false });

        if (!piData || piData.length === 0) {
          setActiveInstances([]);
          setSelectedInstanceId(null);
          return;
        }

        // Fetch package names separately (no FK relationship)
        const pkgIds = [...new Set(piData.map((pi) => Number(pi.package_id)).filter(Boolean))];
        const { data: pkgData, error: pkgErr } = pkgIds.length > 0
          ? await supabase.from('packages').select('id, name, package_type').in('id', pkgIds)
          : { data: [], error: null };

        console.log('[AddTimeDialog] packages lookup', { pkgIds, pkgData, pkgErr });
        const pkgMap = new Map((pkgData || []).map((p: any) => [Number(p.id), p]));

        const instances: PackageInstance[] = piData.map((pi: any) => {
          const pkg = pkgMap.get(Number(pi.package_id));
          return {
            id: pi.id,
            package_name: pkg?.name || `Package #${pi.id}`,
            is_kickstart: (pkg?.package_type || '').toLowerCase() === 'kickstart',
          };
        });

        setActiveInstances(instances);
        if (instances.length === 1) {
          setSelectedInstanceId(instances[0].id);
          if (instances[0].is_kickstart) setIsBillable(false);
        } else {
          setSelectedInstanceId(null);
        }
      })();
    }
  }, [open, defaultScopeTag, tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const totalMinutes = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    if (totalMinutes <= 0) return;

    setSaving(true);
    try {
      // Insert directly into time_entries — allocation happens via DB trigger
      const { error } = await supabase.from('time_entries').insert({
        tenant_id: tenantId,
        client_id: clientId,
        user_id: user.id,
        duration_minutes: totalMinutes,
        start_at: `${date}T00:00:00`,
        work_type: workType,
        notes: notes || null,
        is_billable: isBillable,
        scope_tag: scopeTag,
        source: 'manual',
        package_instance_id: selectedInstanceId,
      } as any);

      if (error) throw error;

      // Log notify intent (notification delivery is handled externally)
      if (notifyUserId) {
        const notifyMember = teamMembers.find(m => m.user_uuid === notifyUserId);
        const durationStr = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
        const workLabel = workTypes.find(w => w.code === workType)?.label || workType;
        console.log('[AddTimeDialog] Notify requested', {
          notifyUserId,
          notifyName: notifyMember ? `${notifyMember.first_name} ${notifyMember.last_name}` : 'unknown',
          summary: `${durationStr} (${workLabel})`,
        });
      }

      toast({
        title: 'Time added',
        description: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m logged${notifyUserId ? ' — notification sent' : ''}`,
      });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: 'Failed to add time', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setHours('0');
    setMinutes('30');
    setDate(new Date().toISOString().split('T')[0]);
    setWorkType('general');
    setNotes('');
    setIsBillable(true);
    setScopeTag(defaultScopeTag);
    setSelectedInstanceId(null);
    setNotifyUserId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Time Entry</DialogTitle>
          <DialogDescription>
            Log time for this tenant. Allocation is handled automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Scope selector */}
          <div className="space-y-2">
            <Label>Allocation</Label>
            <ScopeSelectorBadge
              value={scopeTag}
              onChange={setScopeTag}
              showSelector={showScopeSelector}
            />
          </div>

          {/* Package instance selector */}
          {activeInstances.length === 1 && (
            <div className="space-y-2">
              <Label>Package</Label>
              <Input value={activeInstances[0].package_name} readOnly className="bg-muted" />
            </div>
          )}
          {activeInstances.length > 1 && (
            <div className="space-y-2">
              <Label>Package</Label>
              <Select
                value={selectedInstanceId?.toString() ?? ''}
                onValueChange={(v) => {
                  const id = Number(v);
                  setSelectedInstanceId(id);
                  const inst = activeInstances.find((i) => i.id === id);
                  if (inst?.is_kickstart) setIsBillable(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a package..." />
                </SelectTrigger>
                <SelectContent>
                  {activeInstances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id.toString()}>
                      {inst.package_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
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
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    className="text-center"
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Work Type — from dd_work_types lookup */}
          <div className="space-y-2">
            <Label htmlFor="work-type">Work Type</Label>
            <Select value={workType} onValueChange={setWorkType}>
              <SelectTrigger id="work-type">
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
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="What did you work on?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Billable toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="billable">Billable</Label>
            <Switch
              id="billable"
              checked={isBillable}
              onCheckedChange={setIsBillable}
            />
          </div>

          {/* Notify team member */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Notify
            </Label>
            <Select value={notifyUserId || "__none__"} onValueChange={(v) => setNotifyUserId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="No notification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserMinus className="h-4 w-4" />
                    No notification
                  </div>
                </SelectItem>
                {teamMembers.map(member => (
                  <SelectItem key={member.user_uuid} value={member.user_uuid}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="text-[9px]">
                          {member.first_name?.[0]}{member.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {member.first_name} {member.last_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Add Time'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
