import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { buildActivateUrlFromActionLink } from '@/lib/recoveryLink';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { 
  UserPlus, 
  Shield, 
  User as UserIcon, 
  UserCheck,
  Mail, 
  Clock,
  Phone,
  MoreVertical,
  Trash2,
  Pencil,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { TenantInviteDialog } from './TenantInviteDialog';
import { useRBAC } from '@/hooks/useRBAC';
import { useUserCapacity, useInvalidateUserCapacity } from '@/hooks/useUserCapacity';
import { CapacityPill } from './users/CapacityPill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type RelationshipRole,
  RELATIONSHIP_ROLE_OPTIONS,
  relationshipRoleLabel,
  legacyTenantUserPatch,
  isUniqueViolation,
} from '@/lib/roles/relationshipRole';
import {
  type PositionTypeOption,
  positionTypeLabel,
} from '@/lib/roles/positionType';

interface TenantUser {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  mobile_phone: string | null;
  job_title: string | null;
  disabled: boolean;
  last_sign_in_at: string | null;
  created_at: string;
}

interface TenantMemberInfo {
  user_id: string;
  role: string;
  created_at: string;
  primary_contact?: boolean | null;
  secondary_contact?: boolean | null;
  relationship_role?: RelationshipRole | null;
  position_type?: string | null;
  users: TenantUser;
}

interface PendingInvite {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface TenantUsersTabProps {
  tenantId: number;
  tenantName: string;
  onCountChange?: (count: number) => void;
}

export function TenantUsersTab({ tenantId, tenantName, onCountChange }: TenantUsersTabProps) {
  const { profile, isSuperAdmin, hasTenantAdmin } = useAuth();
  const { isVivacityTeam } = useRBAC();
  const navigate = useNavigate();
  const [members, setMembers] = useState<TenantMemberInfo[]>([]);
  const [positionTypeOptions, setPositionTypeOptions] = useState<PositionTypeOption[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<TenantMemberInfo | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [updatingPositionType, setUpdatingPositionType] = useState<string | null>(null);
  const [ghostUserIds, setGhostUserIds] = useState<Set<string>>(new Set());
  const [activatingUserId, setActivatingUserId] = useState<string | null>(null);

  // RBAC: Check permissions using helper functions
  const canManageUsers = isSuperAdmin() || hasTenantAdmin(tenantId) || isVivacityTeam;
  const canChangeRoles = isSuperAdmin() || hasTenantAdmin(tenantId) || isVivacityTeam;
  // Only Vivacity staff can activate ghost accounts — never expose in client portal.
  const canActivateGhosts = isSuperAdmin() || isVivacityTeam;

  const capacity = useUserCapacity(tenantId);
  const invalidateCapacity = useInvalidateUserCapacity();

  // Edit drawer state
  const [editingMember, setEditingMember] = useState<TenantMemberInfo | null>(null);
  const [editForm, setEditForm] = useState({ job_title: '', phone: '', role: '', position_type: '', disabled: false });
  const [drawerStats, setDrawerStats] = useState<{ totalLogins: number; lastLogin: string | null }>({ totalLogins: 0, lastLogin: null });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchMembers();
    fetchPendingInvites();
    fetchPositionTypeOptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const fetchPositionTypeOptions = async () => {
    const { data, error } = await supabase
      .from('dd_position_type')
      .select('value, label, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) {
      console.error('dd_position_type fetch error:', error);
      return;
    }
    setPositionTypeOptions(data || []);
  };

  // Detect ghost users (rows in public.users with no auth.users row) so staff
  // can offer one-click activation. Only Vivacity staff see the result.
  useEffect(() => {
    if (!canActivateGhosts || members.length === 0) {
      setGhostUserIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        members.map(async (m) => {
          const { data, error } = await supabase.rpc('is_ghost_user', { p_user_uuid: m.user_id });
          if (error) return null;
          return data === true ? m.user_id : null;
        }),
      );
      if (!cancelled) {
        setGhostUserIds(new Set(results.filter((x): x is string => !!x)));
      }
    })();
    return () => { cancelled = true; };
  }, [members, canActivateGhosts]);

  const handleActivateGhost = async (member: TenantMemberInfo) => {
    if (!canActivateGhosts) return;
    setActivatingUserId(member.user_id);
    try {
      const { data, error } = await supabase.functions.invoke('activate-ghost-user', {
        body: { user_uuid: member.user_id, tenant_id: tenantId },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.detail || 'Activation failed');
        return;
      }
      setGhostUserIds((prev) => {
        const n = new Set(prev);
        n.delete(member.user_id);
        return n;
      });
      if (data.email_sent) {
        toast.success(`Account activated — welcome email sent to ${data.email}`);
      } else if (data.action_link) {
        toast.success(`Account activated for ${data.email} — welcome email could not be sent`, {
          action: {
            label: 'Copy link',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(data.action_link);
                toast.success('Link copied — paste it into Teams or email to the user directly.');
              } catch {
                toast.message('Copy manually', { description: data.action_link });
              }
            },
          },
        });
      } else {
        toast.success(`Account activated for ${data.email} — welcome email could not be sent`);
      }
    } catch (err: any) {
      console.error('activate-ghost-user failed', err);
      toast.error(err?.message || 'Activation failed');
    } finally {
      setActivatingUserId(null);
    }
  };

  // Per-row in-flight tracker for password reset / recovery link actions.
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<'reset' | 'recovery' | null>(null);

  const mapAuthActionError = (code?: string, fallback = "Couldn't complete that action — please try again") => {
    switch (code) {
      case 'AUTH_USER_NOT_FOUND':
        return null; // handled separately with toast.info
      case 'INSUFFICIENT_PERMISSIONS':
        return "You don't have permission to do that";
      case 'CROSS_TENANT_NOT_ALLOWED':
        return 'This user belongs to a different tenant';
      case 'USER_NOT_FOUND':
      case 'MAILGUN_NOT_CONFIGURED':
      case 'LINK_GENERATION_FAILED':
        return fallback;
      default:
        return fallback;
    }
  };

  const handleSendPasswordReset = async (member: TenantMemberInfo) => {
    setActionUserId(member.user_id);
    setActionKind('reset');
    try {
      const { data, error } = await supabase.functions.invoke('send-password-reset', {
        body: { user_uuid: member.user_id },
      });
      // supabase-js sets `error` on any non-2xx; the JSON body lives on error.context.
      let payload: any = data;
      if (error && (error as any).context?.json) {
        try { payload = await (error as any).context.json(); } catch { /* ignore */ }
      } else if (error && (error as any).context?.text) {
        try { payload = JSON.parse(await (error as any).context.text()); } catch { /* ignore */ }
      }
      if (payload?.ok) {
        toast.success(`Password reset email sent to ${payload.email}`);
        return;
      }
      if (payload?.code === 'AUTH_USER_NOT_FOUND') {
        toast.info("This user hasn't activated their account yet — use Activate account instead");
        return;
      }
      if (error && !payload?.code) {
        toast.error("Couldn't send reset email — please try again");
        return;
      }
      toast.error(mapAuthActionError(payload?.code, "Couldn't send reset email — please try again") ?? "Couldn't send reset email — please try again");
    } catch (err: any) {
      console.error('send-password-reset failed', err);
      toast.error("Couldn't send reset email — please try again");
    } finally {
      setActionUserId(null);
      setActionKind(null);
    }
  };

  const handleCopyRecoveryLink = async (member: TenantMemberInfo) => {
    if (!isSuperAdmin()) return;
    setActionUserId(member.user_id);
    setActionKind('recovery');
    try {
      const { data, error } = await supabase.functions.invoke('generate-recovery-link', {
        body: { user_uuid: member.user_id },
      });
      let payload: any = data;
      if (error && (error as any).context?.json) {
        try { payload = await (error as any).context.json(); } catch { /* ignore */ }
      } else if (error && (error as any).context?.text) {
        try { payload = JSON.parse(await (error as any).context.text()); } catch { /* ignore */ }
      }
      if (payload?.ok && payload.action_link) {
        let activateUrl: string;
        try {
          activateUrl = buildActivateUrlFromActionLink(payload.action_link, payload.email);
        } catch {
          toast.error("Couldn't generate recovery link — please try again");
          return;
        }
        try {
          await navigator.clipboard.writeText(activateUrl);
          toast.success('Recovery link copied');
        } catch {
          toast.message('Copy manually', { description: activateUrl });
        }
        return;
      }
      if (payload?.code === 'AUTH_USER_NOT_FOUND') {
        toast.info("This user hasn't activated their account yet — use Activate account instead");
        return;
      }
      if (error && !payload?.code) {
        toast.error("Couldn't generate recovery link — please try again");
        return;
      }
      toast.error(mapAuthActionError(payload?.code, "Couldn't generate recovery link — please try again") ?? "Couldn't generate recovery link — please try again");
    } catch (err: any) {
      console.error('generate-recovery-link failed', err);
      toast.error("Couldn't generate recovery link — please try again");
    } finally {
      setActionUserId(null);
      setActionKind(null);
    }
  };

  // ───────── Bulk state-aware actions ─────────
  type AccountState = 'ghost' | 'invited' | 'active' | 'disabled';
  type BulkAction = 'activate' | 'reset';
  type BulkOutcome = 'sent' | 'skipped' | 'failed' | 'aborted';
  interface BulkResultRow {
    user_uuid: string;
    email: string | null;
    action: BulkAction;
    outcome: BulkOutcome;
    reason?: string;
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState<null | BulkAction>(null);
  const [bulkResults, setBulkResults] = useState<{
    action: BulkAction;
    rows: BulkResultRow[];
    partial: boolean;
  } | null>(null);

  // Clear selection when the underlying member list changes (tenant switch, refresh).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tenantId]);

  const computeState = (m: TenantMemberInfo): AccountState => {
    if (m.users.disabled) return 'disabled';
    if (ghostUserIds.has(m.user_id)) return 'ghost';
    if (!m.users.last_sign_in_at) return 'invited';
    return 'active';
  };

  // Returns null when the action is valid for the state, otherwise a skip reason.
  const invalidReason = (state: AccountState, action: BulkAction): string | null => {
    if (state === 'disabled') return 'Account disabled — re-enable first';
    if (action === 'activate') {
      if (state === 'ghost') return null;
      return 'Already activated — use Send password reset';
    }
    // reset
    if (state === 'ghost') return 'No auth account yet — use Activate';
    return null;
  };


  const toggleSelect = (userId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId); else next.delete(userId);
      return next;
    });
  };

  const allSelected = members.length > 0 && members.every((m) => selectedIds.has(m.user_id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(members.map((m) => m.user_id)) : new Set());
  };

  const selectByPredicate = (pred: (m: TenantMemberInfo) => boolean) => {
    setSelectedIds(new Set(members.filter(pred).map((m) => m.user_id)));
  };

  const selectedMembers = members.filter((m) => selectedIds.has(m.user_id));
  const previewSplit = (action: BulkAction) => {
    let run = 0;
    let skip = 0;
    for (const m of selectedMembers) {
      if (invalidReason(computeState(m), action) == null) run += 1; else skip += 1;
    }
    return { run, skip };
  };

  const runBulk = async (action: BulkAction, restrictTo?: Set<string>) => {
    const pool = restrictTo
      ? selectedMembers.filter((m) => restrictTo.has(m.user_id))
      : selectedMembers;
    if (pool.length === 0) return;

    // Pre-skip rows locally; only send eligible uuids to the orchestrator.
    const localSkips: BulkResultRow[] = [];
    const eligible: TenantMemberInfo[] = [];
    for (const m of pool) {
      const reason = invalidReason(computeState(m), action);
      if (reason == null) {
        eligible.push(m);
      } else {
        localSkips.push({
          user_uuid: m.user_id,
          email: m.users.email,
          action,
          outcome: 'skipped',
          reason,
        });
      }
    }



    setBulkRunning(action);
    try {
      let serverRows: BulkResultRow[] = [];
      let partial = false;
      if (eligible.length > 0) {
        const { data, error } = await supabase.functions.invoke('bulk-account-actions', {
          body: {
            tenant_id: tenantId,
            action,
            user_uuids: eligible.map((m) => m.user_id),
          },
        });
        if (error) {
          // Network/timeout — mark everyone we sent as aborted so the user sees them.
          serverRows = eligible.map((m) => ({
            user_uuid: m.user_id,
            email: m.users.email,
            action,
            outcome: 'aborted' as BulkOutcome,
            reason: error.message || 'Request failed — partial results unavailable',
          }));
          partial = true;
        } else if (!data?.ok) {
          serverRows = eligible.map((m) => ({
            user_uuid: m.user_id,
            email: m.users.email,
            action,
            outcome: 'failed' as BulkOutcome,
            reason: data?.detail || data?.code || 'Bulk request rejected',
          }));
        } else {
          serverRows = (data.details || []) as BulkResultRow[];
          partial = !!data.partial_failure;
        }
      }
      setBulkResults({ action, rows: [...localSkips, ...serverRows], partial });
      // Refresh members + ghost set so the UI reflects new state.
      fetchMembers();
    } catch (err: any) {
      console.error('bulk-account-actions failed', err);
      toast.error("Bulk action failed — please try again");
    } finally {
      setBulkRunning(null);
    }
  };

  const retryFailedAndAborted = () => {
    if (!bulkResults) return;
    const ids = new Set(
      bulkResults.rows
        .filter((r) => r.outcome === 'failed' || r.outcome === 'aborted')
        .map((r) => r.user_uuid),
    );
    if (ids.size === 0) return;
    setBulkResults(null);
    runBulk(bulkResults.action, ids);
  };




  // Resolve effective relationship_role for a member, preferring the new
  // canonical column and falling back to legacy flags for unmigrated rows.
  const getMemberRelationshipRole = (m: TenantMemberInfo): RelationshipRole => {
    if (m.relationship_role) return m.relationship_role;
    if (m.secondary_contact) return 'secondary_contact';
    if (m.primary_contact || m.role === 'parent') return 'primary_contact';
    return 'user';
  };

  // Confirm-swap state for the "demote existing primary, promote this user"
  // flow. Holds the target member being promoted; the existing primary is
  // looked up at confirm-time from `members`.
  const [primarySwapTarget, setPrimarySwapTarget] = useState<TenantMemberInfo | null>(null);

  const fetchPendingInvites = async () => {
    try {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('id, email, first_name, last_name, unicorn_role, status, expires_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingInvites(data || []);
    } catch (error) {
      console.error('Error fetching pending invites:', error);
    }
  };

  // Apply a relationship_role change via the transactional RPC. The RPC writes
  // tenant_users, users, and tenant_members atomically and emits one audit row,
  // so the frontend never writes those tables directly.
  const applyRelationshipRole = async (member: TenantMemberInfo, newRR: RelationshipRole) => {
    const { error } = await supabase.rpc('set_relationship_role', {
      p_tenant_id: tenantId,
      p_user_id: member.user_id,
      p_relationship_role: newRR,
      p_reason: null,
    });
    if (error) throw error;
    // Return derived legacy fields for in-memory state updates (matches what the RPC just wrote).
    return legacyTenantUserPatch(newRR);
  };

  const handleRelationshipRoleChange = async (member: TenantMemberInfo, newRR: RelationshipRole) => {
    if (!canChangeRoles) return;
    const oldRR = getMemberRelationshipRole(member);
    if (oldRR === newRR) return;

    // Single-primary swap: if promoting to primary while another user already
    // holds primary, ask first; the actual swap runs in confirmPrimarySwap.
    if (newRR === 'primary_contact') {
      const existingPrimary = members.find(
        (m) => m.user_id !== member.user_id && getMemberRelationshipRole(m) === 'primary_contact',
      );
      if (existingPrimary) {
        setPrimarySwapTarget(member);
        return;
      }
    }

    setUpdatingRole(member.user_id);
    try {
      const legacy = await applyRelationshipRole(member, newRR);
      setMembers((prev) => prev.map((m) =>
        m.user_id === member.user_id
          ? { ...m, relationship_role: newRR, role: legacy.role, primary_contact: legacy.primary_contact, secondary_contact: newRR === 'secondary_contact' }
          : m,
      ));
      toast.success(`Role changed: ${relationshipRoleLabel(oldRR)} → ${relationshipRoleLabel(newRR)}`);
    } catch (error) {
      console.error('Error updating role:', error);
      if (isUniqueViolation(error)) {
        toast.error("Couldn't change role — another change happened concurrently. Please refresh and try again.");
        await fetchMembers();
      } else {
        toast.error('Failed to update role');
      }
    } finally {
      setUpdatingRole(null);
    }
  };

  const confirmPrimarySwap = async () => {
    const target = primarySwapTarget;
    if (!target) return;
    const existingPrimary = members.find(
      (m) => m.user_id !== target.user_id && getMemberRelationshipRole(m) === 'primary_contact',
    );
    if (!existingPrimary) {
      setPrimarySwapTarget(null);
      return;
    }
    setUpdatingRole(target.user_id);
    try {
      // One RPC: set_relationship_role frees unique primary/secondary slots
      // atomically (needed when the promotee already holds secondary — the old
      // demote-then-promote sequence hit uniq_tenant_one_secondary_contact).
      const oldRR = getMemberRelationshipRole(target);
      await applyRelationshipRole(target, 'primary_contact');
      toast.success(`Role changed: ${relationshipRoleLabel(oldRR)} → ${relationshipRoleLabel('primary_contact')}`);
      await fetchMembers();
    } catch (error) {
      console.error('Error swapping primary contact:', error);
      if (isUniqueViolation(error)) {
        toast.error("Couldn't change role — another change happened concurrently. Please refresh and try again.");
      } else {
        toast.error('Failed to update role');
      }
      await fetchMembers();
    } finally {
      setUpdatingRole(null);
      setPrimarySwapTarget(null);
    }
  };

  const handleRemoveUser = async () => {
    if (!userToRemove) return;
    try {
      const { error } = await supabase
        .from('tenant_users')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userToRemove.user_id);

      if (error) throw error;
      setMembers(prev => prev.filter(m => m.user_id !== userToRemove.user_id));
      toast.success('User removed from tenant');
    } catch (error) {
      console.error('Error removing user:', error);
      toast.error('Failed to remove user');
    } finally {
      setUserToRemove(null);
    }
  };

  const handlePositionTypeChange = async (
    member: TenantMemberInfo,
    positionType: string,
  ) => {
    if (!canManageUsers) return;
    const nextPositionType = positionType === '__none__' ? null : positionType;
    if ((member.position_type ?? null) === nextPositionType) return;

    setUpdatingPositionType(member.user_id);
    try {
      const { error } = await supabase
        .from('tenant_users')
        .update({ position_type: nextPositionType })
        .eq('tenant_id', tenantId)
        .eq('user_id', member.user_id);

      if (error) throw error;

      setMembers((previous) =>
        previous.map((item) =>
          item.user_id === member.user_id
            ? { ...item, position_type: nextPositionType }
            : item,
        ),
      );
      toast.success(nextPositionType ? 'Position type updated' : 'Position type cleared');
    } catch (error) {
      console.error('Error updating position type:', error);
      toast.error('Failed to update position type');
    } finally {
      setUpdatingPositionType(null);
    }
  };


  const fetchMembers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tenant_users')
        .select(`
          user_id,
          role,
          created_at,
          primary_contact,
          secondary_contact,
          relationship_role,
          position_type,
          users!tenant_users_user_id_fkey (
            user_uuid,
            email,
            first_name,
            last_name,
            avatar_url,
            phone,
            mobile_phone,
            job_title,
            disabled,
            last_sign_in_at,
            created_at
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('tenant_users fetch error:', error);
        throw error;
      }
      const result = (data || []) as unknown as TenantMemberInfo[];
      setMembers(result);
      onCountChange?.(result.length);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchDrawerStats = async (member: TenantMemberInfo) => {
    try {
      const { data: activity } = await supabase
        .from('user_activity')
        .select('login_date')
        .eq('user_id', member.user_id)
        .order('login_date', { ascending: false });

      setDrawerStats({
        totalLogins: activity?.length ?? 0,
        lastLogin: activity?.[0]?.login_date ?? member.users.last_sign_in_at ?? null,
      });
    } catch {
      setDrawerStats({ totalLogins: 0, lastLogin: member.users.last_sign_in_at ?? null });
    }
  };

  const openEditDrawer = (member: TenantMemberInfo) => {
    setEditingMember(member);
    setEditForm({
      job_title: member.users.job_title || '',
      phone: member.users.phone || '',
      role: getMemberRelationshipRole(member),
      position_type: member.position_type || '',
      disabled: member.users.disabled ?? false,
    });
    setDrawerStats({ totalLogins: 0, lastLogin: null });
    fetchDrawerStats(member);
  };

  const handleSaveEdit = async () => {
    if (!editingMember) return;
    setSavingEdit(true);
    try {
      const disabledChanged = (editingMember.users.disabled ?? false) !== editForm.disabled;

      const { error: userError } = await supabase
        .from('users')
        .update({
          job_title: editForm.job_title || null,
          phone: editForm.phone || null,
        })
        .eq('user_uuid', editingMember.users.user_uuid);

      if (userError) throw userError;

      const positionTypeChanged = (editingMember.position_type || '') !== editForm.position_type;
      if (positionTypeChanged) {
        const { error: tuError } = await supabase
          .from('tenant_users')
          .update({ position_type: editForm.position_type || null })
          .eq('tenant_id', tenantId)
          .eq('user_id', editingMember.user_id);

        if (tuError) throw tuError;
      }

      if (disabledChanged) {
        const { data: statusResult, error: statusError } = await supabase.rpc(
          'rpc_set_client_account_status',
          {
            p_user_uuid: editingMember.users.user_uuid,
            p_disabled: editForm.disabled,
          },
        );
        if (statusError) throw statusError;
        const res = statusResult as { success: boolean; error?: string } | null;
        if (res && !res.success) throw new Error(res.error || 'Failed to update account status');
      }


      const currentRR = getMemberRelationshipRole(editingMember);
      const newRR = editForm.role as RelationshipRole;
      let legacy = legacyTenantUserPatch(currentRR);
      if (newRR !== currentRR) {
        legacy = await applyRelationshipRole(editingMember, newRR);
      }

      setMembers(prev => prev.map(m =>
        m.user_id === editingMember.user_id
          ? {
              ...m,
              relationship_role: newRR,
              role: legacy.role,
              primary_contact: legacy.primary_contact,
              secondary_contact: newRR === 'secondary_contact',
              position_type: editForm.position_type || null,
              users: {
                ...m.users,
                job_title: editForm.job_title || null,
                phone: editForm.phone || null,
                disabled: editForm.disabled,
              },
            }
          : m
      ));
      onCountChange?.(members.length);
      toast.success('User updated successfully');
      setEditingMember(null);
    } catch (error) {
      console.error('Error saving user edit:', error);
      toast.error('Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('cancel-invite', {
        body: {
          invitation_id: inviteId,
          reason: 'Cancelled by admin',
        },
      });

      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.detail || 'Failed to cancel invitation');
      
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      invalidateCapacity(tenantId);
      toast.success('Invitation cancelled');
    } catch (error) {
      console.error('Error cancelling invite:', error);
      toast.error('Failed to cancel invitation');
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Team Members</h3>
          <p className="text-sm text-muted-foreground">
            {members.length} user{members.length !== 1 ? 's' : ''} in this organisation
          </p>
        </div>
        {canManageUsers && (
          <div className="flex items-center gap-3">
            <CapacityPill capacity={capacity.data} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={() => setInviteDialogOpen(true)}
                      disabled={!!capacity.data?.atLimit && !isVivacityTeam}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Invite User
                    </Button>
                  </span>
                </TooltipTrigger>
                {capacity.data?.atLimit && !isVivacityTeam && (
                  <TooltipContent>
                    User limit reached — contact Vivacity to add more users.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Invitations ({pendingInvites.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInvites.map(invite => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {invite.first_name} {invite.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">{invite.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                    {invite.unicorn_role}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Expires {formatDate(invite.expires_at)}
                  </span>
                  {canManageUsers && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvite(invite.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Bulk action toolbar — staff only, when there are members */}
      {canManageUsers && members.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(c) => toggleSelectAll(c === true)}
                aria-label="Select all team members"
              />
              <span className="text-sm font-medium">
                {selectedIds.size === 0
                  ? 'Select team members for a bulk action'
                  : `${selectedIds.size} selected`}
              </span>
              <Separator orientation="vertical" className="h-5 mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  selectByPredicate((m) => {
                    const s = computeState(m);
                    return s === 'ghost' || s === 'invited';
                  })
                }
              >
                Select all not-yet-activated
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectByPredicate((m) => !m.users.last_sign_in_at && !m.users.disabled)}
              >
                Select all never-logged-in
              </Button>
              {selectedIds.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {canActivateGhosts && (() => {
                const { run, skip } = previewSplit('activate');
                return (
                  <Button
                    size="sm"
                    onClick={() => runBulk('activate')}
                    disabled={bulkRunning !== null || run === 0}
                  >
                    {bulkRunning === 'activate' ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Activate accounts
                    <Badge variant="secondary" className="ml-2">
                      {run} will run · {skip} skipped
                    </Badge>
                  </Button>
                );
              })()}
              {(() => {
                const { run, skip } = previewSplit('reset');
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runBulk('reset')}
                    disabled={bulkRunning !== null || run === 0}
                  >
                    {bulkRunning === 'reset' ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Send password reset
                    <Badge variant="secondary" className="ml-2">
                      {run} will run · {skip} skipped
                    </Badge>
                  </Button>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Users List */}

      <Card>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <UserIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No users in this organisation yet</p>
              {canManageUsers && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setInviteDialogOpen(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite First User
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {members.map(member => {
                const user = member.users;
                return (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => canManageUsers && openEditDrawer(member)}
                  >
                    <div className="flex items-center gap-3">
                      {canManageUsers && (
                        <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                          <Checkbox
                            checked={selectedIds.has(member.user_id)}
                            onCheckedChange={(c) => toggleSelect(member.user_id, c === true)}
                            aria-label={`Select ${user.email}`}
                          />
                        </span>
                      )}
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(user.first_name, user.last_name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <p className="font-medium">
                            {user.first_name} {user.last_name}
                          </p>
                          {user.job_title && (
                            <span className="text-sm text-muted-foreground">— {user.job_title}</span>
                          )}
                          {member.position_type && (
                            <Badge variant="outline" className="bg-muted font-normal">
                              {positionTypeLabel(member.position_type, positionTypeOptions)}
                            </Badge>
                          )}
                          {(user.phone || user.mobile_phone) && (
                            <a href={`tel:${user.phone || user.mobile_phone}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary hover:underline" onClick={e => e.stopPropagation()}>
                              <Phone className="h-3 w-3" />
                              {user.phone || user.mobile_phone}
                            </a>
                          )}
                        </div>
                        <a href={`mailto:${user.email}`} className="text-sm text-muted-foreground hover:text-primary hover:underline" onClick={e => e.stopPropagation()}>{user.email}</a>
                      </div>
                    </div>

                    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                      {/* Position Type Selector */}
                      {canManageUsers ? (
                        <Select
                          value={member.position_type || '__none__'}
                          onValueChange={(value) => handlePositionTypeChange(member, value)}
                          disabled={updatingPositionType === member.user_id}
                        >
                          <SelectTrigger className="w-44" aria-label={`Position type for ${user.email}`}>
                            <SelectValue>
                              {member.position_type
                                ? positionTypeLabel(member.position_type, positionTypeOptions)
                                : 'Position type'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No position type</SelectItem>
                            {positionTypeOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}

                      {/* Role Badge/Selector */}
                      {canChangeRoles && member.user_id !== profile?.user_uuid ? (
                        <Select
                          value={getMemberRelationshipRole(member)}
                          onValueChange={(value) => handleRelationshipRoleChange(member, value as RelationshipRole)}
                          disabled={updatingRole === member.user_id}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue>
                              {relationshipRoleLabel(getMemberRelationshipRole(member))}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {RELATIONSHIP_ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  {opt.value === 'primary_contact' && <Shield className="h-3 w-3" />}
                                  {opt.value === 'secondary_contact' && <UserCheck className="h-3 w-3" />}
                                  {(opt.value === 'user' || opt.value === 'academy_user') && <UserIcon className="h-3 w-3" />}
                                  {opt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        (() => {
                          const v = getMemberRelationshipRole(member);
                          if (v === 'primary_contact') {
                            return (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                <Shield className="h-3 w-3 mr-1" /> Primary Contact
                              </Badge>
                            );
                          }
                          if (v === 'secondary_contact') {
                            return (
                              <Badge variant="outline" className="bg-accent/10 text-accent-foreground border-accent/30">
                                <UserCheck className="h-3 w-3 mr-1" /> Secondary Contact
                              </Badge>
                            );
                          }
                          return (
                            <Badge variant="outline" className="bg-muted">
                              <UserIcon className="h-3 w-3 mr-1" /> {relationshipRoleLabel(v)}
                            </Badge>
                          );
                        })()
                      )}

                      {/* Ghost activation — staff only */}
                      {canActivateGhosts && ghostUserIds.has(member.user_id) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={activatingUserId === member.user_id}
                          onClick={(e) => { e.stopPropagation(); handleActivateGhost(member); }}
                          title="Create the auth account and email a setup link"
                        >
                          {activatingUserId === member.user_id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <KeyRound className="h-3.5 w-3.5 mr-1" />
                          )}
                          Activate account
                        </Button>
                      )}

                      <span className="text-xs text-muted-foreground min-w-20">
                        Added {formatDate(member.created_at)}
                      </span>


                      {/* Actions Menu */}
                      {canManageUsers && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDrawer(member)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={actionUserId === member.user_id && actionKind === 'reset'}
                              onSelect={(e) => { e.preventDefault(); handleSendPasswordReset(member); }}
                            >
                              {actionUserId === member.user_id && actionKind === 'reset' ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <KeyRound className="h-4 w-4 mr-2" />
                              )}
                              Send Password Reset
                            </DropdownMenuItem>
                            {isSuperAdmin() && (
                              <DropdownMenuItem
                                disabled={actionUserId === member.user_id && actionKind === 'recovery'}
                                onSelect={(e) => { e.preventDefault(); handleCopyRecoveryLink(member); }}
                              >
                                {actionUserId === member.user_id && actionKind === 'recovery' ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Link2 className="h-4 w-4 mr-2" />
                                )}
                                Copy Recovery Link
                              </DropdownMenuItem>
                            )}
                            {member.user_id !== profile?.user_uuid && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setUserToRemove(member)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remove from tenant
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Drawer */}
      <Sheet open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <SheetContent className="w-[420px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
            <SheetDescription>
              Update details for {editingMember?.users?.first_name} {editingMember?.users?.last_name}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            {/* Avatar preview */}
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={editingMember?.users?.avatar_url || undefined} />
                <AvatarFallback>
                  {editingMember && getInitials(editingMember.users.first_name, editingMember.users.last_name, editingMember.users.email)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{editingMember?.users?.email}</p>
                <p className="text-sm text-muted-foreground">Member since {editingMember && formatDate(editingMember.created_at)}</p>
              </div>
            </div>

            {/* Email — read-only */}
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                value={editingMember?.users?.email || ''}
                disabled
                className="bg-muted"
              />
            </div>

            {/* Position */}
            <div className="space-y-2">
              <Label htmlFor="edit-job-title">Position</Label>
              <Input
                id="edit-job-title"
                value={editForm.job_title}
                onChange={e => setEditForm(f => ({ ...f, job_title: e.target.value }))}
                placeholder="e.g. Training Manager"
              />
            </div>

            {/* Position Type */}
            <div className="space-y-2">
              <Label htmlFor="edit-position-type">Position Type</Label>
              <Select
                value={editForm.position_type}
                onValueChange={value => setEditForm(f => ({ ...f, position_type: value }))}
              >
                <SelectTrigger id="edit-position-type">
                  <SelectValue placeholder="Select a position type">
                    {editForm.position_type
                      ? positionTypeLabel(editForm.position_type, positionTypeOptions)
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {positionTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 0400 000 000"
              />
            </div>

            {/* Role */}
            {canChangeRoles && editingMember?.user_id !== profile?.user_uuid && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={value => setEditForm(f => ({ ...f, role: value }))}
                >
                  <SelectTrigger>
                    <SelectValue>{relationshipRoleLabel(editForm.role as RelationshipRole)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          {opt.value === 'primary_contact' && <Shield className="h-3 w-3" />}
                          {opt.value === 'secondary_contact' && <UserCheck className="h-3 w-3" />}
                          {(opt.value === 'user' || opt.value === 'academy_user') && <UserIcon className="h-3 w-3" />}
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Inactive toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Inactive</p>
                <p className="text-xs text-muted-foreground">
                  {editForm.disabled ? 'User is currently inactive' : 'User is currently active'}
                </p>
              </div>
              <Switch
                checked={editForm.disabled}
                onCheckedChange={checked => setEditForm(f => ({ ...f, disabled: checked }))}
              />
            </div>

            <Separator />

            {/* View Full Profile */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setEditingMember(null);
                navigate(`/user-profile/${editingMember?.users?.user_uuid}`);
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Full Profile
            </Button>

            <Separator />

            {/* Login Information — read-only */}
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">Login Information</p>
              <div className="grid grid-cols-2 gap-y-2">
                <span className="text-sm text-muted-foreground">Total Logins</span>
                <span className="text-sm font-medium text-right">{drawerStats.totalLogins}</span>
                <span className="text-sm text-muted-foreground">Last Login</span>
                <span className="text-sm font-medium text-right">
                  {drawerStats.lastLogin ? formatDate(drawerStats.lastLogin) : '—'}
                </span>
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Invite Dialog */}
      <TenantInviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        onSuccess={() => {
          fetchMembers();
          fetchPendingInvites();
          invalidateCapacity(tenantId);
        }}
      />

      {/* Remove User Confirmation */}
      <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>{userToRemove?.users?.first_name} {userToRemove?.users?.last_name}</strong>{' '}
              from this organisation? They will lose access to all tenant resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Primary-contact swap confirmation */}
      <AlertDialog
        open={!!primarySwapTarget}
        onOpenChange={(open) => !open && !updatingRole && setPrimarySwapTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Swap Primary Contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const existing = members.find(
                  (m) =>
                    primarySwapTarget &&
                    m.user_id !== primarySwapTarget.user_id &&
                    getMemberRelationshipRole(m) === 'primary_contact',
                );
                const otherSecondary = members.find(
                  (m) =>
                    primarySwapTarget &&
                    m.user_id !== primarySwapTarget.user_id &&
                    getMemberRelationshipRole(m) === 'secondary_contact',
                );
                const demoteTo = otherSecondary ? 'User' : 'Secondary Contact';
                const targetName = `${primarySwapTarget?.users?.first_name ?? ''} ${primarySwapTarget?.users?.last_name ?? ''}`.trim() || primarySwapTarget?.users?.email;
                const existingName = existing
                  ? `${existing.users?.first_name ?? ''} ${existing.users?.last_name ?? ''}`.trim() || existing.users?.email
                  : 'the current primary contact';
                return (
                  <>
                    This organisation already has a primary contact:{' '}
                    <strong>{existingName}</strong>. Promoting{' '}
                    <strong>{targetName}</strong> will demote them to{' '}
                    <strong>{demoteTo}</strong>.
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!updatingRole}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!updatingRole}
              onClick={(e) => {
                // Prevent Radix from closing before the async swap finishes;
                // we clear primarySwapTarget ourselves in finally.
                e.preventDefault();
                void confirmPrimarySwap();
              }}
            >
              {updatingRole ? 'Swapping…' : 'Swap Primary'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Bulk action results */}
      <Dialog open={bulkResults !== null} onOpenChange={(open) => !open && setBulkResults(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {bulkResults?.action === 'activate' ? 'Activate accounts' : 'Send password reset'} — results
            </DialogTitle>
            <DialogDescription>
              {bulkResults && (() => {
                const s = {
                  sent: bulkResults.rows.filter((r) => r.outcome === 'sent').length,
                  skipped: bulkResults.rows.filter((r) => r.outcome === 'skipped').length,
                  failed: bulkResults.rows.filter((r) => r.outcome === 'failed').length,
                  aborted: bulkResults.rows.filter((r) => r.outcome === 'aborted').length,
                };
                return (
                  <span>
                    Sent {s.sent} · Skipped {s.skipped} · Failed {s.failed} · Not sent (aborted) {s.aborted}
                    {bulkResults.partial && ' — partial results shown'}
                  </span>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulkResults?.rows.map((r) => (
                  <TableRow key={r.user_uuid + r.outcome}>
                    <TableCell className="font-mono text-xs">{r.email || r.user_uuid}</TableCell>
                    <TableCell className="text-xs">
                      {r.action === 'activate' ? 'Activate' : 'Reset'}
                    </TableCell>
                    <TableCell>
                      {r.outcome === 'sent' && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Sent
                        </Badge>
                      )}
                      {r.outcome === 'skipped' && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" /> Skipped
                        </Badge>
                      )}
                      {r.outcome === 'failed' && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                          <XCircle className="h-3 w-3 mr-1" /> Failed
                        </Badge>
                      )}
                      {r.outcome === 'aborted' && (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          <XCircle className="h-3 w-3 mr-1" /> Not sent
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reason || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            {bulkResults && bulkResults.rows.some((r) => r.outcome === 'failed' || r.outcome === 'aborted') && (
              <Button variant="outline" onClick={retryFailedAndAborted} disabled={bulkRunning !== null}>
                Retry failed only
              </Button>
            )}
            <Button onClick={() => setBulkResults(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
