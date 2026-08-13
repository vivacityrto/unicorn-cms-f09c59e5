import { useState, useEffect } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { NoteFormDialog } from '@/components/notes/NoteFormDialog';
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
import { Bell, UserMinus, Mic, MicOff } from 'lucide-react';
import { NotifyClientCheckbox } from './NotifyClientCheckbox';
import { notifyClientPrimaryContact } from '@/lib/notifyClient';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import type { ScopeTag } from '@/hooks/useTenantMemberships';

interface WorkTypeOption {
  code: string;
  label: string;
}

interface WorkSubTypeOption {
  code: string;
  label: string;
  category: string;
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
  package_slug: string | null;
  is_kickstart: boolean;
  start_date: string | null;
  total_minutes: number;
  included_minutes: number;
}

interface ParentTenantInfo {
  id: number;
  rto_id: string | null;
  rto_name: string | null;
  name: string | null;
}

const PARENT_DEFINED_CODE = 'parent_defined';
const KICKSTART_CODE = 'kickstart_tas';
const KICKSTART_TAS_MINUTES = 420;        // 7h per TAS
const KICKSTART_FLOOR_MINUTES = 1680;     // 28h consult floor
const KICKSTART_CAP_BY_SLUG: Record<string, number> = {
  '/package-m-sar': 1680, // 28h
  '/package-m-dr': 3780,  // 63h
};

function buildParentDefinedNote(parent: ParentTenantInfo | null): string {
  const label = parent
    ? `${parent.rto_id ?? parent.id} - ${parent.rto_name ?? parent.name ?? 'Parent Organisation'}`
    : 'Parent Organisation';
  return `Time entry is locked for Child packages. All time is administered/allocated/entered against parent: ${label}`;
}

function buildKickstartNote(tas: number): string {
  return `KickStart TAS — ${tas} TAS (${tas * 7}h)`;
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
  const { isRecording, isSupported, interimTranscript, startRecording, stopRecording } = useSpeechToText();
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
  const [workSubTypes, setWorkSubTypes] = useState<WorkSubTypeOption[]>([]);
  const [workSubType, setWorkSubType] = useState<string>('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [notifyUserId, setNotifyUserId] = useState<string>('');
  const [notifyClient, setNotifyClient] = useState(false);
  const [linkNote, setLinkNote] = useState(false);
  const [linkNoteMode, setLinkNoteMode] = useState<'existing' | 'new'>('existing');
  const [recentNotes, setRecentNotes] = useState<{ id: string; title: string | null; note_details: string; created_at: string }[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [pendingTimeEntryId, setPendingTimeEntryId] = useState<string | null>(null);
  const [parentTenant, setParentTenant] = useState<ParentTenantInfo | null>(null);
  const [kickstartUsedMinutes, setKickstartUsedMinutes] = useState(0);
  const [instanceTotalUsedMinutes, setInstanceTotalUsedMinutes] = useState(0);
  const [kickstartTas, setKickstartTas] = useState(1);
  const [kickstartNoteEdited, setKickstartNoteEdited] = useState(false);

  const isParentDefined = workType === PARENT_DEFINED_CODE;
  const isKickstart = workType === KICKSTART_CODE;
  const selectedInstance = activeInstances.find(i => i.id === selectedInstanceId) || null;

  const kickstartCap = selectedInstance?.package_slug
    ? KICKSTART_CAP_BY_SLUG[selectedInstance.package_slug] ?? 0
    : 0;
  const kickstartCapRemaining = Math.max(0, kickstartCap - kickstartUsedMinutes);
  const consultRoom = selectedInstance
    ? Math.max(0, selectedInstance.included_minutes - KICKSTART_FLOOR_MINUTES - instanceTotalUsedMinutes)
    : 0;
  const maxKickstartTas = selectedInstance && kickstartCap > 0
    ? Math.floor(Math.min(kickstartCapRemaining, consultRoom) / KICKSTART_TAS_MINUTES)
    : 0;
  const kickstartEligible = maxKickstartTas >= 1;


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

  // Fetch work sub types from dd_work_sub_type lookup
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('dd_work_sub_type')
        .select('code, label, category')
        .eq('is_active', true)
        .order('sort_order');
      if (data) setWorkSubTypes(data as WorkSubTypeOption[]);
    })();
  }, []);

  // Fetch team members for notify selector (Vivacity Team + tenant users)
  useEffect(() => {
    if (!open) return;
    (async () => {
      // Fetch Vivacity staff
      const { data: staffData } = await (supabase as any)
        .from('users')
        .select('user_uuid, first_name, last_name, avatar_url')
        .eq('disabled', false)
        .eq('user_type', 'Vivacity Team')
        .order('first_name')
        .limit(200);

      // Fetch tenant users via tenant_users junction
      let tenantUsers: TeamMember[] = [];
      if (tenantId) {
        const { data: tuData } = await (supabase as any)
          .from('tenant_users')
          .select('user_uuid, users:user_uuid(user_uuid, first_name, last_name, avatar_url, disabled)')
          .eq('tenant_id', tenantId)
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

      // Merge and deduplicate
      const allMembers = [...(staffData || []), ...tenantUsers] as TeamMember[];
      const seen = new Set<string>();
      const deduped = allMembers.filter(m => {
        if (seen.has(m.user_uuid) || m.user_uuid === user?.id) return false;
        seen.add(m.user_uuid);
        return true;
      });
      setTeamMembers(deduped);
    })();
  }, [open, user?.id, tenantId]);

  // Fetch active package instances & sync defaults when dialog opens
  useEffect(() => {
    if (open) {
      setScopeTag(defaultScopeTag);
      (async () => {
        const { data: piData } = await supabase
          .from('package_instances')
          .select('id, package_id, start_date, hours_included, hours_added, included_minutes')
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
          ? await supabase.from('packages').select('id, name, slug, package_type').in('id', pkgIds)
          : { data: [], error: null };

        console.log('[AddTimeDialog] packages lookup', { pkgIds, pkgData, pkgErr });
        const pkgMap = new Map((pkgData || []).map((p: any) => [Number(p.id), p]));

        const instances: PackageInstance[] = piData.map((pi: any) => {
          const pkg = pkgMap.get(Number(pi.package_id));
          const hoursMinutes = ((Number(pi.hours_included) || 0) + (Number(pi.hours_added) || 0)) * 60;
          const includedMinutes = Number(pi.included_minutes) || 0;
          const total = Math.max(hoursMinutes, includedMinutes);
          return {
            id: pi.id,
            package_id: Number(pi.package_id),
            package_name: pkg?.name || `Package #${pi.id}`,
            package_slug: pkg?.slug ?? null,
            is_kickstart: (pkg?.package_type || '').toLowerCase() === 'kickstart',
            start_date: pi.start_date ?? null,
            total_minutes: total,
            included_minutes: total,
          };
        });

        setActiveInstances(instances);
        if (instances.length > 0) {
          // instances is already sorted start_date DESC — pick most recent
          setSelectedInstanceId(instances[0].id);
          if (instances[0].is_kickstart) setIsBillable(false);
        } else {
          setSelectedInstanceId(null);
        }

      })();
    }
  }, [open, defaultScopeTag, tenantId]);

  // Fetch parent tenant (if this tenant is a child) — used by parent_defined work type
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: rel } = await (supabase as any)
        .from('tenant_relationships')
        .select('parent_tenant_id')
        .eq('child_tenant_id', tenantId)
        .limit(1)
        .maybeSingle();
      const parentId = rel?.parent_tenant_id ? Number(rel.parent_tenant_id) : null;
      if (!parentId) { setParentTenant(null); return; }
      const { data: parent } = await (supabase as any)
        .from('tenants')
        .select('id, rto_id, rto_name, name')
        .eq('id', parentId)
        .maybeSingle();
      if (parent) {
        setParentTenant({
          id: Number(parent.id),
          rto_id: parent.rto_id ?? null,
          rto_name: parent.rto_name ?? null,
          name: parent.name ?? null,
        });
      } else {
        setParentTenant(null);
      }
    })();
  }, [open, tenantId]);

  // When user selects "Parent Defined" work type, auto-fill from selected package + parent
  useEffect(() => {
    if (!isParentDefined || !selectedInstance) return;
    if (selectedInstance.start_date) {
      setDate(selectedInstance.start_date);
    }
    const mins = selectedInstance.total_minutes || 0;
    setHours(String(Math.floor(mins / 60)));
    setMinutes(String(mins % 60));
    setIsBillable(false);
    setWorkSubType('');
    setNotes(buildParentDefinedNote(parentTenant));
  }, [isParentDefined, selectedInstance, parentTenant]);

  // Fetch recent unlinked notes when the user toggles "Link a note" on
  useEffect(() => {
    if (!linkNote || !tenantId) return;
    (async () => {
      const { data } = await supabase
        .from('notes')
        .select('id, title, note_details, created_at')
        .eq('tenant_id', tenantId)
        .is('timeentry_id', null)
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentNotes((data || []) as any);
    })();
  }, [linkNote, tenantId]);


  // Fetch existing usage (kickstart_tas + total) for the selected package instance
  useEffect(() => {
    if (!open || !selectedInstanceId) {
      setKickstartUsedMinutes(0);
      setInstanceTotalUsedMinutes(0);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('duration_minutes, work_type')
        .eq('package_instance_id', selectedInstanceId);
      const rows = (data || []) as Array<{ duration_minutes: number | null; work_type: string | null }>;
      let total = 0;
      let kick = 0;
      for (const r of rows) {
        const m = Number(r.duration_minutes) || 0;
        total += m;
        if (r.work_type === KICKSTART_CODE) kick += m;
      }
      setKickstartUsedMinutes(kick);
      setInstanceTotalUsedMinutes(total);
    })();
  }, [open, selectedInstanceId]);

  // Kickstart auto-fill: force billable=true and seed notes/duration when TAS changes
  useEffect(() => {
    if (!isKickstart) return;
    setIsBillable(true);
    setWorkSubType('');
    const safeTas = Math.max(1, Math.min(kickstartTas, Math.max(1, maxKickstartTas)));
    setHours(String(safeTas * 7));
    setMinutes('0');
    if (!kickstartNoteEdited) {
      setNotes(buildKickstartNote(safeTas));
    }
  }, [isKickstart, kickstartTas, maxKickstartTas, kickstartNoteEdited]);





  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const totalMinutes = isKickstart
      ? kickstartTas * KICKSTART_TAS_MINUTES
      : (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    if (totalMinutes < 0) return;

    if (activeInstances.length > 1 && !selectedInstanceId) {
      toast({ title: 'Package required', description: 'Please select a package before adding time.', variant: 'destructive' });
      return;
    }

    if (isParentDefined) {
      if (!selectedInstanceId) {
        toast({ title: 'Package required', description: 'Select a package to mark as parent-shared.', variant: 'destructive' });
        return;
      }
      if (!parentTenant) {
        toast({ title: 'No parent organisation', description: 'This tenant has no parent relationship configured.', variant: 'destructive' });
        return;
      }
    }

    if (isKickstart) {
      if (!selectedInstanceId) {
        toast({ title: 'Package required', description: 'Select a M-SAR or M-DR membership package.', variant: 'destructive' });
        return;
      }
      if (!kickstartEligible || kickstartTas < 1 || kickstartTas > maxKickstartTas) {
        toast({ title: 'TAS limit exceeded', description: `Max ${maxKickstartTas} TAS available on this package.`, variant: 'destructive' });
        return;
      }
    }


    setSaving(true);
    try {
      // Insert directly into time_entries — allocation happens via DB trigger
      const { data: insertedEntry, error } = await supabase.from('time_entries').insert({
        tenant_id: tenantId,
        client_id: clientId,
        user_id: user.id,
        duration_minutes: totalMinutes,
        start_at: `${date}T00:00:00`,
        work_type: workType,
        work_sub_type: workSubType || null,
        notes: notes || null,
        is_billable: isBillable,
        scope_tag: scopeTag,
        source: 'manual',
        package_id: selectedInstanceId,
        package_instance_id: selectedInstanceId,
      } as any).select('id').single();

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

      // Send client notification email if requested
      if (notifyClient) {
        const workLabel = workTypes.find(w => w.code === workType)?.label || workType;
        const durationStr = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
        notifyClientPrimaryContact({
          tenantId,
          context: 'Time Logged',
          title: `${durationStr} — ${workLabel}`,
          description: notes || undefined,
        });
      }

      toast({
        title: 'Time added',
        description: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m logged${notifyUserId ? ' — notification sent' : ''}`,
      });

      const entryId = (insertedEntry as any)?.id ?? null;
      if (linkNote && entryId) {
        const opened = await handleLinkOrCreateNote(entryId);
        if (opened) {
          // NoteFormDialog will handle reset/success on close
          return;
        }
      }
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
    setWorkSubType('');
    setNotes('');
    setIsBillable(true);
    setScopeTag(defaultScopeTag);
    setSelectedInstanceId(null);
    setNotifyUserId('');
    setNotifyClient(false);
    setKickstartTas(1);
    setKickstartNoteEdited(false);
    setLinkNote(false);
    setLinkNoteMode('existing');
    setSelectedNoteId('');
    setRecentNotes([]);
    setPendingTimeEntryId(null);
  };

  // Returns true when a follow-up NoteFormDialog has been opened (caller must
  // not reset/close — the dialog's onOpenChange handles that).
  const handleLinkOrCreateNote = async (entryId: string): Promise<boolean> => {
    if (linkNoteMode === 'existing' && selectedNoteId) {
      await supabase.from('notes').update({ timeentry_id: entryId } as any).eq('id', selectedNoteId);
      return false;
    }
    if (linkNoteMode === 'new') {
      setPendingTimeEntryId(entryId);
      setShowNoteDialog(true);
      onOpenChange(false);
      return true;
    }
    return false;
  };


  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Time Entry</DialogTitle>
          <DialogDescription>
            Log time for this tenant. Allocation is handled automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Allocation removed — package selection handles this */}

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

          {/* Date + Duration side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                readOnly={isParentDefined}
                className={isParentDefined ? 'bg-muted' : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label>{isKickstart ? 'TAS' : 'Duration'}</Label>
              {isKickstart ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, maxKickstartTas)}
                    step={1}
                    value={kickstartTas}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      const safe = Math.max(1, Math.min(Math.max(1, maxKickstartTas), isNaN(v) ? 1 : v));
                      setKickstartTas(safe);
                    }}
                    className="text-center w-20"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">
                    × 7h = <strong>{kickstartTas * 7}h 0m</strong>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className={`text-center w-16 ${isParentDefined ? 'bg-muted' : ''}`}
                    readOnly={isParentDefined}
                  />
                  <span className="text-sm text-muted-foreground shrink-0">hrs</span>
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
                    className={`text-center w-16 ${isParentDefined ? 'bg-muted' : ''}`}
                    readOnly={isParentDefined}
                  />
                  <span className="text-sm text-muted-foreground shrink-0">min</span>
                </div>
              )}
            </div>

          </div>

          {/* Work Type — from dd_work_types lookup */}
          <div className="space-y-2">
            <Label htmlFor="work-type">Work Type</Label>
            <Select
              value={workType}
              onValueChange={(v) => {
                setWorkType(v);
                setWorkSubType('');
                if (v === KICKSTART_CODE) {
                  setKickstartTas(1);
                  setKickstartNoteEdited(false);
                }
              }}
            >
              <SelectTrigger id="work-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workTypes
                  .filter((type) => type.code !== KICKSTART_CODE || kickstartEligible)
                  .map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {isParentDefined && !parentTenant && (
              <p className="text-xs text-destructive">
                This tenant has no parent organisation configured. Set a parent relationship before using Parent Defined.
              </p>
            )}
            {isParentDefined && parentTenant && (
              <p className="text-xs text-muted-foreground">
                Shared package — locks this child's time entry. The parent organisation's time is not affected. Parent:{' '}
                <strong>{parentTenant.rto_id ?? parentTenant.id} - {parentTenant.rto_name ?? parentTenant.name}</strong>
              </p>
            )}
            {isKickstart && selectedInstance && (
              <p className="text-xs text-muted-foreground">
                1 TAS = 7h. Max <strong>{maxKickstartTas}</strong> TAS available on this package
                (cap {Math.floor(kickstartCap / 60)}h, used {Math.floor(kickstartUsedMinutes / 60)}h; 28h consult floor enforced).
              </p>
            )}
          </div>


          {/* Work Sub Type — filtered by category based on work type */}
          {(() => {
            const category = workType === 'consultation' ? 'consultation'
              : (workType === 'document_review' || workType === 'document_development') ? 'document'
              : workType === 'meeting' ? 'meeting'
              : null;
            if (!category) return null;
            const filtered = workSubTypes.filter(st => st.category === category);
            if (filtered.length === 0) return null;
            return (
              <div className="space-y-2">
                <Label htmlFor="work-sub-type">Work Sub Type</Label>
                <Select value={workSubType} onValueChange={setWorkSubType}>
                  <SelectTrigger id="work-sub-type">
                    <SelectValue placeholder="Select sub type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filtered.map((st) => (
                      <SelectItem key={st.code} value={st.code}>
                        {st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="notes">Description</Label>
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
              id="notes"
              placeholder="What did you work on?"
              value={isRecording && interimTranscript ? (notes ? notes + ' ' + interimTranscript : interimTranscript) : notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (isKickstart) setKickstartNoteEdited(true);
              }}
              rows={4}
            />
          </div>

          {/* Billable toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="billable">Billable</Label>
            <Switch
              id="billable"
              checked={isBillable}
              onCheckedChange={setIsBillable}
              disabled={isParentDefined || isKickstart}
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
                      {member.first_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Link a note to this time entry */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="link-note">Link a note</Label>
              <Switch
                id="link-note"
                checked={linkNote}
                onCheckedChange={(v) => { setLinkNote(v); setSelectedNoteId(''); }}
              />
            </div>
            {linkNote && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={linkNoteMode === 'existing' ? 'default' : 'outline'}
                    onClick={() => setLinkNoteMode('existing')}
                  >
                    Link existing
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={linkNoteMode === 'new' ? 'default' : 'outline'}
                    onClick={() => setLinkNoteMode('new')}
                  >
                    + New note
                  </Button>
                </div>

                {linkNoteMode === 'existing' && (
                  <Select value={selectedNoteId} onValueChange={setSelectedNoteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a note to link..." />
                    </SelectTrigger>
                    <SelectContent>
                      {recentNotes.length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          No unlinked notes found
                        </div>
                      )}
                      {recentNotes.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.title || (n.note_details || '').substring(0, 60)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {linkNoteMode === 'new' && (
                  <p className="text-xs text-muted-foreground">
                    After saving the time entry, a note form will open pre-linked to this entry and package.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <NotifyClientCheckbox checked={notifyClient} onCheckedChange={setNotifyClient} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || (isParentDefined && !parentTenant) || (isKickstart && !kickstartEligible)}>
                {saving ? 'Saving...' : 'Add Time'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

      {showNoteDialog && pendingTimeEntryId && (
        <NoteFormDialog
          open={showNoteDialog}
          onOpenChange={(v) => {
            if (!v) {
              setShowNoteDialog(false);
              setPendingTimeEntryId(null);
              resetForm();
              onSuccess?.();
            }
          }}
          mode="create"
          tenantId={tenantId}
          showDuration={true}
          showPackageSelector={false}
          hideLogTime={true}
          prelinkedTimeEntryId={pendingTimeEntryId}
          activePackages={selectedInstance ? [{
            instance_id: selectedInstance.id,
            package_id: selectedInstance.package_id,
            name: selectedInstance.package_name,
          }] : []}
          onSave={async (data) => {
            // Insert the note here, then link the prelinked time entry
            const { data: inserted, error } = await supabase
              .from('notes')
              .insert({
                tenant_id: tenantId,
                client_id: clientId,
                user_id: user?.id,
                title: data.title || null,
                note_details: data.content,
                note_type: data.noteType,
                priority: data.priority,
                status: data.status,
                is_pinned: data.isPinned,
                package_instance_id: data.packageInstanceId !== 'none' ? Number(data.packageInstanceId) : (selectedInstance?.id ?? null),
                timeentry_id: pendingTimeEntryId,
              } as any)
              .select('id')
              .single();
            if (error) throw error;
            const noteId = (inserted as any)?.id;
            if (noteId && pendingTimeEntryId) {
              await supabase.from('notes').update({ timeentry_id: pendingTimeEntryId } as any).eq('id', noteId);
            }
            setShowNoteDialog(false);
            setPendingTimeEntryId(null);
            resetForm();
            onSuccess?.();
          }}
        />
      )}
    </>
  );
}
