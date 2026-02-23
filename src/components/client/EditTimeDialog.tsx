import { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { Bell, UserMinus, Mic, MicOff } from 'lucide-react';
import type { TimeEntry } from '@/hooks/useTimeTracking';
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
  package_id: number;
  package_name: string;
  display_label: string;
  is_kickstart: boolean;
}

interface EditTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimeEntry | null;
  onSuccess?: () => void;
}

export function EditTimeDialog({ open, onOpenChange, entry, onSuccess }: EditTimeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isRecording, isSupported, interimTranscript, startRecording, stopRecording } = useSpeechToText();
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [date, setDate] = useState('');
  const [workType, setWorkType] = useState('general');
  const [notes, setNotes] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [scopeTag, setScopeTag] = useState<ScopeTag>('both');
  const [saving, setSaving] = useState(false);
  const [workTypes, setWorkTypes] = useState<WorkTypeOption[]>([]);
  const [activeInstances, setActiveInstances] = useState<PackageInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [notifyUserId, setNotifyUserId] = useState<string>('');
  const [vivacityStaff, setVivacityStaff] = useState<TeamMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

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

  // Fetch Vivacity staff and team members for selectors
  useEffect(() => {
    if (!open || !entry) return;
    (async () => {
      const { data: staffData } = await (supabase as any)
        .from('users')
        .select('user_uuid, first_name, last_name, avatar_url')
        .eq('disabled', false)
        .eq('user_type', 'Vivacity Team')
        .order('first_name')
        .limit(200);

      setVivacityStaff((staffData || []) as TeamMember[]);

      let tenantUsers: TeamMember[] = [];
      if (entry.tenant_id) {
        const { data: tuData } = await (supabase as any)
          .from('tenant_users')
          .select('user_uuid, users:user_uuid(user_uuid, first_name, last_name, avatar_url, disabled)')
          .eq('tenant_id', entry.tenant_id)
          .limit(200);
        if (tuData) {
          tenantUsers = tuData
            .map((tu: any) => tu.users)
            .filter((u: any) => u && !u.disabled)
            .map((u: any) => ({
              user_uuid: u.user_uuid,
              first_name: u.first_name,
              last_name: u.last_name,
              avatar_url: u.avatar_url,
            }));
        }
      }

      const allMembers = [...(staffData || []), ...tenantUsers] as TeamMember[];
      const seen = new Set<string>();
      const deduped = allMembers.filter(m => {
        if (seen.has(m.user_uuid) || m.user_uuid === user?.id) return false;
        seen.add(m.user_uuid);
        return true;
      });
      setTeamMembers(deduped);
    })();
  }, [open, entry, user?.id]);

  // Fetch active package instances
  useEffect(() => {
    if (!open || !entry) return;
    (async () => {
      // Fetch ALL package instances (including completed) to support historical time reallocation
      const { data: piData } = await supabase
        .from('package_instances')
        .select('id, package_id, start_date, end_date, is_active, is_complete')
        .eq('tenant_id', entry.tenant_id)
        .order('start_date', { ascending: false });

      if (!piData || piData.length === 0) {
        setActiveInstances([]);
        return;
      }

      const pkgIds = [...new Set(piData.map((pi) => Number(pi.package_id)).filter(Boolean))];
      const { data: pkgData } = pkgIds.length > 0
        ? await supabase.from('packages').select('id, name, package_type').in('id', pkgIds)
        : { data: [] };

      const pkgMap = new Map((pkgData || []).map((p: any) => [Number(p.id), p]));

      const instances: PackageInstance[] = piData.map((pi: any) => {
        const pkg = pkgMap.get(Number(pi.package_id));
        const name = pkg?.name || `Package #${pi.id}`;
        const startStr = pi.start_date ? format(new Date(pi.start_date + 'T00:00:00'), 'dd/MM/yyyy') : '?';
        const endStr = pi.end_date ? format(new Date(pi.end_date + 'T00:00:00'), 'dd/MM/yyyy') : 'current';
        const suffix = pi.is_complete ? ' (completed)' : '';
        return {
          id: pi.id,
          package_id: Number(pi.package_id),
          package_name: name,
          display_label: `${name} (${startStr} — ${endStr})${suffix}`,
          is_kickstart: (pkg?.package_type || '').toLowerCase() === 'kickstart',
        };
      });

      setActiveInstances(instances);

      // Auto-select the correct instance based on entry's package_id
      if (entry.package_id) {
        // Try to find instance matching the entry's package_id (could be instance ID or packages.id)
        const directMatch = instances.find(i => i.id === entry.package_id);
        const pkgMatch = instances.find(i => i.package_id === entry.package_id);
        if (directMatch) {
          setSelectedInstanceId(directMatch.id);
        } else if (pkgMatch) {
          setSelectedInstanceId(pkgMatch.id);
        } else if (instances.length === 1) {
          setSelectedInstanceId(instances[0].id);
        }
      } else if (instances.length === 1) {
        setSelectedInstanceId(instances[0].id);
      }
    })();
  }, [open, entry]);

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
      setSelectedInstanceId(null); // Will be resolved by instance-fetch effect
      setSelectedUserId(entry.user_id || user?.id || '');
      setNotifyUserId('');
    }
  }, [entry, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;

    const totalMinutes = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    if (totalMinutes <= 0) return;

    if (activeInstances.length > 1 && !selectedInstanceId) {
      toast({ title: 'Package required', description: 'Please select a package.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: updated, error } = await supabase
        .from('time_entries')
        .update({
          duration_minutes: totalMinutes,
          start_at: `${date}T00:00:00`,
          work_type: workType,
          notes: notes || null,
          is_billable: isBillable,
          scope_tag: scopeTag,
          package_id: selectedInstanceId,
          package_instance_id: selectedInstanceId,
          user_id: selectedUserId || entry.user_id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', entry.id)
        .select()
        .single();

      if (error) throw error;
      if (!updated) throw new Error('No rows updated — entry may have been deleted');

      // Log notify intent
      if (notifyUserId) {
        const notifyMember = teamMembers.find(m => m.user_uuid === notifyUserId);
        const durationStr = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
        const workLabel = workTypes.find(w => w.code === workType)?.label || workType;
        console.log('[EditTimeDialog] Notify requested', {
          notifyUserId,
          notifyName: notifyMember ? `${notifyMember.first_name} ${notifyMember.last_name}` : 'unknown',
          summary: `${durationStr} (${workLabel})`,
        });
      }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
          <DialogDescription>
            Update details for this time entry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Person selector */}
          <div className="space-y-2">
            <Label>Person</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select person..." />
              </SelectTrigger>
              <SelectContent>
                {/* Current user option (always present) */}
                {user?.id && (
                  <SelectItem value={user.id}>
                    <span className="font-medium">Me (current user)</span>
                  </SelectItem>
                )}
                {vivacityStaff
                  .filter(m => m.user_uuid !== user?.id)
                  .map(member => (
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

          {/* Package + Allocation side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Package (left) */}
            <div className="space-y-2">
              <Label>Package</Label>
              {activeInstances.length === 0 && (
                <Input value="No packages" readOnly className="bg-muted" />
              )}
              {activeInstances.length === 1 && (
                <Input value={activeInstances[0].display_label} readOnly className="bg-muted" />
              )}
              {activeInstances.length > 1 && (
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
                        {inst.display_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Allocation (right) */}
            <div className="space-y-2">
              <Label>Allocation</Label>
              <ScopeSelectorBadge value={scopeTag} onChange={setScopeTag} showSelector />
            </div>
          </div>

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
                    step="1"
                    value={minutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setMinutes(String(Math.max(0, Math.min(59, isNaN(val) ? 0 : val))));
                    }}
                    className="text-center"
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="edit-date">Date</Label>
            <Input
              id="edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Work Type */}
          <div className="space-y-2">
            <Label htmlFor="edit-work-type">Work Type</Label>
            <Select value={workType} onValueChange={setWorkType}>
              <SelectTrigger id="edit-work-type">
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

          {/* Notes with dictation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-notes">Notes</Label>
              {isSupported && (
                <Button
                  type="button"
                  variant={isRecording ? 'destructive' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs"
                  onClick={() => {
                    if (isRecording) {
                      stopRecording();
                    } else {
                      startRecording((text) => {
                        setNotes((prev) => (prev ? prev + ' ' + text : text));
                      });
                    }
                  }}
                >
                  {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {isRecording ? 'Stop' : 'Dictate'}
                </Button>
              )}
            </div>
            <Textarea
              id="edit-notes"
              placeholder="What did you work on?"
              value={isRecording && interimTranscript ? (notes ? notes + ' ' + interimTranscript : interimTranscript) : notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Billable toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-billable">Billable</Label>
            <Switch
              id="edit-billable"
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
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
