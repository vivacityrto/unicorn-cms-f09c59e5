import { useEffect, useMemo, useState } from 'react';
import { Users, UserRound } from 'lucide-react';
import {
  ConversationPane,
  MessengerDock,
  useMessengerDock,
  type DockThreadApi,
  type MessengerThread,
} from '@/components/messenger';
import { StaffAskVivChat } from '@/components/ask-viv-assistant/StaffAskVivChat';
import { useAskVivAssistantAccess } from '@/hooks/useAskVivAssistantAccess';
import { useAskVivAssistantWidget } from '@/hooks/useAskVivAssistantWidget';
import { useRBAC } from '@/hooks/useRBAC';
import { useStaffConversationPane } from '@/hooks/useStaffConversationPane';
import { useStaffMessenger } from '@/hooks/useStaffMessenger';
import { cn } from '@/lib/utils';

const ASK_VIV_THREAD_ID = 'ask_viv';

const ASK_VIV_THREAD: MessengerThread = {
  id: ASK_VIV_THREAD_ID,
  kind: 'ask_viv',
  title: 'Ask Viv',
  preview: 'Ask about a client, a note or an audit',
  unread: false,
  pinned: true,
};

/**
 * Anything that still asks the old Ask Viv widget to open (it used to be a separate floating widget at the bottom left) opens
 * the bubble on Ask Viv instead.
 */
function useOldWidgetOpensTheBubble(enabled: boolean) {
  const { openDock } = useMessengerDock();
  const widgetOpen = useAskVivAssistantWidget((s) => s.isOpen);
  const closeWidget = useAskVivAssistantWidget((s) => s.closeWidget);
  useEffect(() => {
    if (!widgetOpen) return;
    if (enabled) openDock(ASK_VIV_THREAD_ID);
    closeWidget();
  }, [widgetOpen, enabled, openDock, closeWidget]);
}

function StaffThread({ thread, api, tenantId, mine }: { thread: MessengerThread; api: DockThreadApi; tenantId: number | null; mine: boolean }) {
  const pane = useStaffConversationPane(thread.id, { tenantId, mine });
  return <ConversationPane thread={thread} onBack={api.onBack} headerActions={api.headerActions} {...pane} />;
}

/**
 * The messenger bubble for Vivacity staff. It shows the conversations you are responsible for first, by the same routing
 * that notifies you (your own clients, clients you cover for a colleague, ones you watch, and for Super Admins the ones with
 * no consultant), with a switch to see every client's. The number on the bubble is the conversations that are unread for you.
 */
export function StaffMessengerDock() {
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const isStaff = isSuperAdmin || isVivacityTeam;
  const [allClients, setAllClients] = useState(false);
  const { threads: convoThreads, totalUnread, isLoading, scope, hasScope } = useStaffMessenger(allClients, isStaff);
  // Ask Viv appears here exactly when the old bottom-left widget did: the assistant's own rollout gate (master flag, then Super
  // Admin, named beta users or all staff).
  const { enabled: askVivEnabled } = useAskVivAssistantAccess();
  const threads = useMemo(() => (askVivEnabled ? [ASK_VIV_THREAD, ...convoThreads] : convoThreads), [askVivEnabled, convoThreads]);
  useOldWidgetOpensTheBubble(askVivEnabled);

  if (!isStaff) return null;

  return (
    <MessengerDock
      threads={threads}
      threadsLoading={isLoading}
      unreadTotal={totalUnread}
      title="Messages"
      keepMounted={[ASK_VIV_THREAD_ID]}
      // Ask Viv has its own full page button inside its header (it keeps the conversation); the rest open Communications.
      fullPageHref={(t) => (t?.id === ASK_VIV_THREAD_ID ? null : '/communications')}
      emptyThreads={
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">
          {hasScope || allClients ? 'No conversations yet.' : 'No clients are assigned to you yet. Switch to All clients to browse.'}
        </p>
      }
      listAction={
        <button
          type="button"
          onClick={() => setAllClients((v) => !v)}
          aria-pressed={allClients}
          aria-label={allClients ? 'Showing all clients. Show my clients' : 'Showing my clients. Show all clients'}
          title={allClients ? 'All clients (tap for my clients)' : 'My clients (tap for all clients)'}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            allClients ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {allClients ? <Users className="h-4 w-4" aria-hidden /> : <UserRound className="h-4 w-4" aria-hidden />}
        </button>
      }
      renderThread={(thread, api) =>
        thread.id === ASK_VIV_THREAD_ID ? (
          <StaffAskVivChat active={api.active} onBack={api.onBack} headerActions={api.headerActions} />
        ) : (
          <StaffThread thread={thread} api={api} tenantId={thread.tenantId ?? null} mine={thread.tenantId != null && scope.has(thread.tenantId)} />
        )
      }
    />
  );
}
