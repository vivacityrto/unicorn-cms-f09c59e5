import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarClock, Clock, Megaphone, Plus, UserRound, Users, Inbox, HandHelping } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRBAC } from '@/hooks/useRBAC';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { useStaffMessenger } from '@/hooks/useStaffMessenger';
import { useStaffConversationPane } from '@/hooks/useStaffConversationPane';
import { useBulkMessageSummary } from '@/hooks/useBulkMessageSummary';
import { Messenger } from '@/components/messenger';
import { StaffNewMessagePane } from '@/components/staff/StaffNewMessagePane';
import { InsightCard } from '@/components/staff/InsightCard';
import { applyInsightView, communicationsInsights, waitingFor, type InsightView } from '@/components/staff/communicationsInsights';
import { BulkMessageDialog } from '@/components/communications/BulkMessageDialog';
import { BulkMessageHistory } from '@/components/communications/BulkMessageHistory';
import { Button } from '@/components/ui/button';
import { SearchableFilter } from '@/components/staff/SearchableFilter';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ago } from '@/components/client/inbox/inboxFormat';
import { cn } from '@/lib/utils';

const WAITING_ALERT_HOURS = 24;

/**
 * Team Communications: the conversations that are yours first, with the messaging given the room.
 *
 * Four small cards at the top say what needs you, what you cover, what moved today and what is going out in bulk; each one
 * filters the list (the bulk card opens its history beside the page instead of replacing the page with a tab). Below them
 * are two panes only: a narrow list and a wide conversation. Who is "mine" comes from the same routing that notifies you.
 */
export default function TeamCommunicationsPage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = useRBAC();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const canSendBulk = profile?.is_team === true || profile?.unicorn_role === 'Super Admin' || profile?.unicorn_role === 'Team Leader';

  const [allClients, setAllClients] = useState(false);
  const [view, setView] = useState<InsightView>('all');
  const [filterTenant, setFilterTenant] = useState('all');
  const [filterStaff, setFilterStaff] = useState('all');
  // Writing a new message takes the conversation area (the same screen the bubble uses), instead of a pop-up.
  const [composing, setComposing] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectedId = searchParams.get('thread');
  // A conversation opened by link, or just created, is fetched on its own, so it opens even when it is older than the list
  // or belongs to a client that is not mine. Choosing a client lists all of that client's conversations.
  const { threads, opened, isLoading, scope, tenants, hasScope, limited } = useStaffMessenger(allClients, true, {
    tenantId: filterTenant === 'all' ? null : Number(filterTenant),
    extraThreadId: selectedId,
    memberId: isSuperAdmin && filterStaff !== 'all' ? filterStaff : null,
  });
  const { data: bulk } = useBulkMessageSummary(canSendBulk);
  const { data: staffUsers = [] } = useVivacityTeamUsers();

  const selectedThread = threads.find((t) => t.id === selectedId) ?? (opened && opened.id === selectedId ? opened : null);

  const insights = useMemo(() => communicationsInsights(threads), [threads]);

  const visible = useMemo(() => {
    let list = applyInsightView(threads, view);
    if (filterTenant !== 'all') list = list.filter((t) => String(t.tenantId) === filterTenant);
    // The team member filter is applied by the hook (on the server), so the list is exactly the filter's answer. The
    // conversation you are reading stays open in the right pane (see openThread below) but is not forced into this list.
    return list;
  }, [threads, view, filterTenant]);

  const tenantId = selectedThread?.tenantId ?? null;
  const pane = useStaffConversationPane(selectedThread?.id ?? null, { tenantId, mine: tenantId != null && scope.has(tenantId) });

  const select = (id: string | null) => {
    setComposing(false);
    const next = new URLSearchParams(searchParams);
    if (id) next.set('thread', id);
    else next.delete('thread');
    setSearchParams(next, { replace: true });
  };

  const memberChosen = isSuperAdmin && filterStaff !== 'all';
  const memberName = memberChosen ? (() => { const u = staffUsers.find((x) => x.user_uuid === filterStaff); return u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email : 'this person'; })() : null;

  const toggleView = (next: InsightView) => setView((v) => (v === next ? 'all' : next));

  // Going back to My clients closes a conversation that is not one of mine, rather than leaving it in a list it does not belong
  // to (which also hid the "no clients assigned" message for someone who has none).
  const toggleScope = () => {
    const next = !allClients;
    setAllClients(next);
    if (!next && selectedThread && !(selectedThread.tenantId != null && scope.has(selectedThread.tenantId))) select(null);
  };

  const waited = waitingFor(insights.needsYou.oldestAt);
  const waitedHours = insights.needsYou.oldestAt ? (Date.now() - new Date(insights.needsYou.oldestAt).getTime()) / 3_600_000 : 0;
  const bulkHint = bulk
    ? [bulk.scheduled > 0 ? `${bulk.scheduled} scheduled` : 'None scheduled', bulk.lastSentAt ? `last sent ${ago(bulk.lastSentAt)}` : null].filter(Boolean).join(' · ')
    : undefined;

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[32rem] min-w-0 max-w-full flex-col gap-3 overflow-hidden">
      <div className="flex min-w-0 flex-shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-foreground">Team Communications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{allClients ? 'Every client conversation.' : 'The conversations that are yours.'}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {canSendBulk && (
            <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-1.5">
              <Megaphone className="h-4 w-4" />
              Bulk message
            </Button>
          )}
          <Button
            onClick={() => {
              select(null);
              setComposing(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New message
          </Button>
        </div>
      </div>

      <section aria-label="Summary" className="grid flex-shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <InsightCard
          icon={Inbox}
          label="Needs you"
          value={insights.needsYou.count}
          hint={waited ? `Oldest waiting ${waited}` : 'All caught up'}
          active={view === 'needs'}
          alert={waitedHours >= WAITING_ALERT_HOURS}
          onClick={() => toggleView('needs')}
        />
        <InsightCard
          icon={HandHelping}
          label="Covering"
          value={insights.covering.count}
          hint={insights.covering.count === 0 ? 'No colleagues to cover' : insights.covering.unread > 0 ? `${insights.covering.unread} unread` : 'Nothing unread'}
          active={view === 'covering'}
          onClick={() => toggleView('covering')}
        />
        <InsightCard
          icon={Clock}
          label="Active today"
          value={insights.today.count}
          hint={insights.today.count === 1 ? 'conversation moved' : 'conversations moved'}
          active={view === 'today'}
          onClick={() => toggleView('today')}
        />
        {canSendBulk && (
          <InsightCard icon={CalendarClock} label="Bulk messages" value={bulk?.scheduled ?? 0} hint={bulkHint} onClick={() => setHistoryOpen(true)} />
        )}
      </section>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        <SearchableFilter
          label="Client"
          allLabel="Every client"
          value={filterTenant}
          onChange={setFilterTenant}
          options={tenants.map((t) => ({ value: String(t.id), label: t.name }))}
        />
        {isSuperAdmin && (
          <SearchableFilter
            label="Team member"
            allLabel="Any team member"
            value={filterStaff}
            onChange={setFilterStaff}
            options={staffUsers.map((u) => ({ value: u.user_uuid, label: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email }))}
          />
        )}
        <button
          type="button"
          onClick={toggleScope}
          disabled={memberChosen}
          title={memberChosen ? 'Clear the team member filter to switch between My clients and All clients' : undefined}
          aria-pressed={allClients}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            allClients ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
            memberChosen && 'cursor-not-allowed opacity-50',
          )}
        >
          {allClients ? <Users className="h-4 w-4" aria-hidden /> : <UserRound className="h-4 w-4" aria-hidden />}
          {allClients ? 'All clients' : 'My clients'}
        </button>
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {visible.length} {visible.length === 1 ? 'conversation' : 'conversations'}
          {memberName ? ` of ${memberName}'s clients and ones they are in` : ''}
          {limited && filterTenant === 'all' ? ' (the newest; pick a client to see all of theirs)' : ''}
        </p>
      </div>

      <Messenger
        className="min-h-0 flex-1"
        threads={visible}
        threadsLoading={isLoading}
        selectedId={selectedThread?.id ?? null}
        openThread={selectedThread}
        onSelect={select}
        compose={
          composing ? (
            <StaffNewMessagePane
              api={{ onBack: () => setComposing(false), select, headerActions: null }}
              initialTenantId={filterTenant === 'all' ? null : Number(filterTenant)}
            />
          ) : undefined
        }
        emptyThreads={
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {view !== 'all' || filterTenant !== 'all' || filterStaff !== 'all'
              ? 'Nothing matches these filters.'
              : hasScope || allClients
                ? 'No conversations yet.'
                : 'No clients are assigned to you yet. Switch to All clients to browse.'}
          </p>
        }
        emptySelection={
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Inbox aria-hidden className="h-8 w-8" />
            <p className="text-sm">{insights.needsYou.count > 0 ? `${insights.needsYou.count} ${insights.needsYou.count === 1 ? 'conversation needs' : 'conversations need'} you. Pick one to read and reply.` : 'Pick a conversation to read and reply.'}</p>
          </div>
        }
        conversation={{
          ...pane,
          headerActions:
            tenantId != null ? (
              <Link
                to={`/tenant/${tenantId}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open the client"
                title="Open the client"
              >
                <Building2 className="h-4 w-4" aria-hidden />
              </Link>
            ) : undefined,
        }}
      />

      {canSendBulk && (
        <BulkMessageDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          currentUserId={profile?.user_uuid}
          onSent={() => {
            void qc.invalidateQueries({ queryKey: ['bulk-message-summary'] });
            setHistoryOpen(true);
          }}
        />
      )}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Bulk message history</SheetTitle>
            <SheetDescription>Every bulk message, who it reached and who has read it.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <BulkMessageHistory />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
