import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, Inbox, MessageSquare, Plus, UserMinus, UserPlus, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStaffMessenger } from '@/hooks/useStaffMessenger';
import { useStaffConversationPane } from '@/hooks/useStaffConversationPane';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';
import { Messenger, type MessengerThread } from '@/components/messenger';
import { StaffNewMessagePane } from '@/components/staff/StaffNewMessagePane';
import { InsightCard } from '@/components/staff/InsightCard';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface ClientMessagesTabProps {
  tenantId: number;
  clientName: string;
  /** Called after a conversation is read, so the page can refresh its unread badge. */
  onReadStateChange?: () => void;
}

type Status = 'open' | 'resolved' | 'closed';
type View = 'all' | 'needs' | 'unassigned' | 'resolved';

interface ConversationMeta {
  status: Status;
  assignedTo: string | null;
}

interface StaffMember {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const staffName = (s: StaffMember | undefined | null) => {
  if (!s) return 'Unassigned';
  return [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || s.email || 'Unknown';
};

const staffInitials = (s: StaffMember | undefined | null) => {
  if (!s) return '?';
  const initials = `${s.first_name?.[0] ?? ''}${s.last_name?.[0] ?? ''}`.toUpperCase();
  return initials || (s.email?.[0] ?? '?').toUpperCase();
};

const STATUS_CHANGES: Record<Status, Array<{ label: string; value: Status }>> = {
  open: [
    { label: 'Mark as resolved', value: 'resolved' },
    { label: 'Close conversation', value: 'closed' },
  ],
  resolved: [
    { label: 'Reopen', value: 'open' },
    { label: 'Close conversation', value: 'closed' },
  ],
  closed: [{ label: 'Reopen', value: 'open' }],
};

const isDone = (s: Status) => s === 'resolved' || s === 'closed';

/**
 * A client's Messages tab on the staff client page: the same messenger as Team Communications, limited to this client. Staff
 * read and reply as they do everywhere else; this tab adds the two things only it needs, who the conversation is assigned to
 * and whether it is resolved. Writing a new message takes the conversation area rather than opening a pop-up.
 */
export function ClientMessagesTab({ tenantId, clientName, onReadStateChange }: ClientMessagesTabProps) {
  const { profile } = useAuth();
  const me = profile?.user_uuid ?? null;
  const canManage = isVivacityStaffRole(profile?.unicorn_role);
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // A notification can link straight to one conversation (?tab=messages&conversation=<id>).
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('conversation'));
  const [composing, setComposing] = useState(false);
  const [view, setView] = useState<View>('all');

  const { threads: listed, opened, totalUnread, isLoading } = useStaffMessenger(true, true, { tenantId, extraThreadId: selectedId });

  // Assignment and status are not part of the shared thread, so they are read here for this client's conversations.
  const metaKey = useMemo(() => ['client-messages-meta', tenantId] as const, [tenantId]);
  const { data: meta } = useQuery({
    queryKey: metaKey,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, ConversationMeta>> => {
      const { data, error } = await supabase.from('tenant_conversations').select('id, status, assigned_to_user_uuid').eq('tenant_id', tenantId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, { status: ((c.status as Status | null) ?? 'open'), assignedTo: c.assigned_to_user_uuid }]));
    },
  });

  // Active Vivacity staff, for the assignment menu and the avatars.
  const { data: staff = [] } = useQuery({
    queryKey: ['client-messages-staff'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, is_vivacity_internal, unicorn_role, disabled, archived, is_qa_persona, is_system_account')
        .or('is_vivacity_internal.eq.true,unicorn_role.in.(Admin,CSC,Super Admin)');
      if (error) throw error;
      return (data ?? [])
        .filter((u) => !u.disabled && !u.archived && !u.is_qa_persona && !u.is_system_account && u.user_uuid)
        .sort((a, b) => staffName(a).localeCompare(staffName(b)));
    },
  });
  const staffById = useMemo(() => new Map(staff.map((s) => [s.user_uuid, s])), [staff]);

  // The list shows each conversation's state: resolved and closed ones say so on the row.
  const withState = useCallback(
    (t: MessengerThread): MessengerThread => {
      const status = meta?.[t.id]?.status ?? 'open';
      if (status === 'open') return t;
      return { ...t, badge: { label: status === 'closed' ? 'Closed' : 'Resolved', tone: 'neutral' } };
    },
    [meta],
  );
  const threads = useMemo(() => listed.map(withState), [listed, withState]);
  const openThread = opened ? withState(opened) : null;

  const counts = useMemo(() => {
    let unassigned = 0;
    let resolved = 0;
    for (const t of listed) {
      const m = meta?.[t.id];
      if (m && isDone(m.status)) resolved += 1;
      else if (m && !m.assignedTo) unassigned += 1;
    }
    return { needs: listed.filter((t) => t.unread).length, unassigned, resolved };
  }, [listed, meta]);

  const visible = useMemo(() => {
    if (view === 'needs') return threads.filter((t) => t.unread);
    if (view === 'unassigned') return threads.filter((t) => meta?.[t.id] && !meta[t.id].assignedTo && !isDone(meta[t.id].status));
    if (view === 'resolved') return threads.filter((t) => meta?.[t.id] && isDone(meta[t.id].status));
    return threads;
  }, [threads, view, meta]);

  const selected = threads.find((t) => t.id === selectedId) ?? (openThread && openThread.id === selectedId ? openThread : null);
  // Reading a conversation here is the staff member's own read: the client sees "Seen" and the bell clears.
  const pane = useStaffConversationPane(selected?.id ?? null, { tenantId, mine: true });

  // Tell the page when the unread count moves (after the first load) so its Messages badge stays right.
  const previousUnread = useRef<number | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (previousUnread.current !== null && previousUnread.current !== totalUnread) onReadStateChange?.();
    previousUnread.current = totalUnread;
  }, [totalUnread, isLoading, onReadStateChange]);

  const select = (id: string | null) => {
    setComposing(false);
    setSelectedId(id);
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: metaKey });
    void qc.invalidateQueries({ queryKey: ['staff-messenger'] });
  };

  const assign = async (assigneeUuid: string | null) => {
    if (!selected || !canManage) return;
    const { error } = await supabase
      .from('tenant_conversations')
      .update({ assigned_to_user_uuid: assigneeUuid, updated_at: new Date().toISOString() })
      .eq('id', selected.id);
    if (error) {
      toast.error(`Failed to assign: ${error.message}`);
      return;
    }
    // The person it is assigned to is told (not when assigning to yourself).
    if (assigneeUuid && assigneeUuid !== me) {
      await supabase.from('user_notifications').upsert(
        {
          user_id: assigneeUuid,
          tenant_id: tenantId,
          type: 'message',
          title: `Conversation assigned to you: ${selected.title || '(No subject)'}`,
          message: `You have been assigned a client conversation from ${clientName}`,
          link: `/tenant/${tenantId}?tab=messages&conversation=${selected.id}`,
          source_id: selected.id,
          is_read: false,
          created_by: me,
          dedupe_key: `assign:${selected.id}:${assigneeUuid}`,
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      );
    }
    toast.success(assigneeUuid ? (assigneeUuid === me ? 'Assigned to you' : `Assigned to ${staffName(staffById.get(assigneeUuid))}`) : 'Conversation unassigned');
    refresh();
  };

  const changeStatus = async (status: Status) => {
    if (!selected || !canManage) return;
    const { error } = await supabase.from('tenant_conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', selected.id);
    if (error) {
      toast.error(`Failed to update status: ${error.message}`);
      return;
    }
    toast.success(`Conversation marked as ${status}`);
    refresh();
  };

  const toggleView = (next: View) => setView((v) => (v === next ? 'all' : next));

  const selectedMeta = selected ? meta?.[selected.id] : undefined;
  const assignee = selectedMeta?.assignedTo ? staffById.get(selectedMeta.assignedTo) ?? null : null;
  const status = selectedMeta?.status ?? 'open';

  const headerActions = selected ? (
    canManage ? (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={assignee ? `Assigned to ${staffName(assignee)}. Change` : 'Unassigned. Assign'}
              title={assignee ? `Assigned to ${staffName(assignee)}` : 'Assign'}
              className="flex h-8 items-center gap-1 rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {assignee ? (
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">{staffInitials(assignee)}</AvatarFallback>
                </Avatar>
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Assign to</DropdownMenuLabel>
            {staff.length === 0 ? (
              <DropdownMenuItem disabled>No staff available</DropdownMenuItem>
            ) : (
              staff.map((s) => (
                <DropdownMenuItem key={s.user_uuid} onClick={() => void assign(s.user_uuid)} className="gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="bg-primary text-[9px] text-primary-foreground">{staffInitials(s)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{staffName(s)}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void assign(null)} className="text-muted-foreground">
              <UserMinus className="mr-2 h-4 w-4" aria-hidden />
              Unassign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Status: ${status}. Change`}
              title={`Status: ${status}`}
              className="flex h-8 items-center gap-1 rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CheckCircle2 className={isDone(status) ? 'h-4 w-4 text-emerald-600 dark:text-emerald-400' : 'h-4 w-4'} aria-hidden />
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATUS_CHANGES[status].map((c) => (
              <DropdownMenuItem key={c.value} onClick={() => void changeStatus(c.value)}>
                {c.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ) : assignee ? (
      <span className="px-1.5 text-[11px] text-muted-foreground">{staffName(assignee)}</span>
    ) : undefined
  ) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Summary" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <InsightCard icon={Inbox} label="Needs reply" value={counts.needs} hint={counts.needs === 0 ? 'All caught up' : 'Unread from this client'} active={view === 'needs'} alert={counts.needs > 0} onClick={() => toggleView('needs')} />
        <InsightCard icon={UserRound} label="Unassigned" value={counts.unassigned} hint={counts.unassigned === 0 ? 'Everything has an owner' : 'Open, with no one assigned'} active={view === 'unassigned'} onClick={() => toggleView('unassigned')} />
        <InsightCard icon={CheckCircle2} label="Resolved" value={counts.resolved} hint="Resolved or closed" active={view === 'resolved'} onClick={() => toggleView('resolved')} />
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {visible.length} {visible.length === 1 ? 'conversation' : 'conversations'} with {clientName}
        </p>
        <Button
          onClick={() => {
            select(null);
            setComposing(true);
          }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New message
        </Button>
      </div>

      <Messenger
        className="h-[min(40rem,calc(100dvh-16rem))] min-h-[26rem]"
        threads={visible}
        threadsLoading={isLoading}
        selectedId={selected?.id ?? null}
        openThread={selected}
        onSelect={select}
        compose={
          composing ? (
            <StaffNewMessagePane
              api={{ onBack: () => setComposing(false), select, headerActions: null }}
              initialTenantId={tenantId}
            />
          ) : undefined
        }
        emptyThreads={
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {view !== 'all' ? 'Nothing matches this view.' : 'No messages yet. When this client writes through their portal, it appears here.'}
          </p>
        }
        emptySelection={
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <MessageSquare aria-hidden className="h-8 w-8" />
            <p className="text-sm">Pick a conversation to read and reply.</p>
          </div>
        }
        conversation={{ ...pane, headerActions }}
      />
    </div>
  );
}
