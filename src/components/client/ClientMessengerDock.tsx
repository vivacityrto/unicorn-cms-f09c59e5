import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ClientAskVivChat } from '@/components/ask-viv/ClientAskVivChat';
import { useClientTickets } from '@/components/client-portal/support-tickets/useClientTickets';
import { NewMessagePane } from '@/components/client/NewMessagePane';
import {
  ConversationPane,
  MessengerDock,
  useMessengerDock,
  type DockThreadApi,
  NEW_MESSAGE_THREAD_ID,
  type MessengerThread,
} from '@/components/messenger';
import { NEW_TICKET_THREAD_ID, ticketIdFromThreadId, ticketThreadId } from '@/components/messenger/adapters/supportTickets';
import { collectDiagnostics } from '@/components/support-tickets/diagnostics';
import { createTicket, requestAiDraft } from '@/components/support-tickets/useCreateTicket';
import { uploadTicketFile } from '@/components/support-tickets/useTicketThread';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useAuth } from '@/hooks/useAuth';
import { useClientHomeHero } from '@/hooks/use-client-home-hero';
import { useClientCommunications } from '@/hooks/useClientCommunications';
import { useClientConversationPane } from '@/hooks/useClientConversationPane';
import { useClientTicketPane } from '@/hooks/useClientTicketPane';
import { ASK_VIV_THREAD_ID, NEW_CSC_THREAD_ID, buildClientThreads, resolveHelpAlias } from './clientThreads';

function TenantThread({ thread, api, cscName }: { thread: MessengerThread; api: DockThreadApi; cscName: string | null }) {
  const { createConversation } = useClientCommunications();
  const qc = useQueryClient();
  const isNew = thread.id === NEW_CSC_THREAD_ID;
  // The first message to your consultant creates the conversation, then the dock moves onto it.
  const pane = useClientConversationPane(isNew ? null : thread.id, {
    sendOverride: isNew
      ? async ({ body }) => {
          const id = await createConversation.mutateAsync({ subject: `Message to ${cscName ?? 'your consultant'}`, type: 'direct', topic: 'csc', firstMessage: body });
          await qc.refetchQueries({ queryKey: ['client-conversations'] });
          api.select(id);
        }
      : undefined,
  });
  return (
    <ConversationPane
      thread={thread}
      onBack={api.onBack}
      headerActions={api.headerActions}
      {...pane}
      capabilities={{ ...pane.capabilities, ...(isNew ? { attachments: false, showSeen: false } : {}) }}
      empty={isNew ? <p className="py-10 text-center text-sm text-muted-foreground">Say hello to {cscName ?? 'your consultant'}. They will reply here.</p> : pane.empty}
    />
  );
}

/** One support ticket, or "Contact support" (no ticket yet: the first message creates it, then the bubble moves onto it). */
function TicketThreadPane({ thread, api }: { thread: MessengerThread; api: DockThreadApi }) {
  const { user, profile } = useAuth();
  const { activeTenantId } = useClientTenant();
  const { data: tickets = [] } = useClientTickets();
  const qc = useQueryClient();
  const ticketId = ticketIdFromThreadId(thread.id);
  const ticket = ticketId ? tickets.find((t) => t.id === ticketId) ?? null : null;
  const isNew = thread.id === NEW_TICKET_THREAD_ID;

  const pane = useClientTicketPane(ticket, {
    sendOverride: isNew
      ? async ({ body, files }) => {
          const created = await createTicket({
            subject: '',
            body,
            pagePath: window.location.pathname,
            diagnostics: collectDiagnostics(),
            tenantId: activeTenantId ?? profile?.tenant_id ?? null,
          });
          // The ticket exists now. Everything after this is best effort and must not hide that.
          if (user) {
            for (const f of files) {
              try {
                await uploadTicketFile({ ticketId: created.id, messageId: null, file: f, userId: user.id });
              } catch {
                toast.error(`Your message was sent, but ${f.name} could not be attached.`);
              }
            }
          }
          requestAiDraft(created.id);
          await qc.refetchQueries({ queryKey: ['client-support-tickets'] });
          api.select(ticketThreadId(created.id));
        }
      : undefined,
  });
  return <ConversationPane thread={thread} onBack={api.onBack} headerActions={api.headerActions} {...pane} />;
}

/**
 * The messenger bubble for the client portal: one place for Ask Viv, the consultant, support (tickets), notices from
 * Vivacity and every other conversation, with an unread count on the launcher. It replaced the Ask Viv-only bubble and the
 * Help Center drawer. The old Help Center buttons still call openHelpCenter; they now open this bubble on the right thread.
 */
export function ClientMessengerDock({ previewTenantId }: { previewTenantId?: number }) {
  const { conversations, totalUnread, isLoading } = useClientCommunications();
  const { isReadOnly, isAcademyOnly } = useClientTenant();
  const { data: hero } = useClientHomeHero();
  // The layout keeps this mounted for the whole visit, so poll: a status change by the team shows without a reload.
  const { data: tickets = [] } = useClientTickets({ pollMs: 30_000 });
  const { selectedId, select } = useMessengerDock();

  const cscName = hero?.csc_display_name ?? null;
  const canCompose = !isReadOnly && !isAcademyOnly;
  const threads = useMemo(() => {
    const list = buildClientThreads({ conversations, tickets, cscName, cscAvatarUrl: hero?.csc_avatar_url ?? null, hasCsc: !!hero?.csc_user_id, academyOnly: isAcademyOnly });
    // The compose thread is opened by the + button and never listed.
    return canCompose ? [...list, { id: NEW_MESSAGE_THREAD_ID, kind: 'general' as const, title: 'New message', unread: false, hidden: true }] : list;
  }, [conversations, tickets, cscName, hero?.csc_avatar_url, hero?.csc_user_id, isAcademyOnly, canCompose]);

  // A Help Center button asked for "csc" or "support" before the thread list was known: swap in the real thread.
  useEffect(() => {
    const real = resolveHelpAlias(selectedId, threads, !isLoading);
    if (real) select(real);
  }, [selectedId, threads, isLoading, select]);

  // Nothing to offer (an academy-only person with no tickets): no bubble, rather than an empty one.
  if (isAcademyOnly && threads.filter((t) => !t.hidden).length === 0) return null;

  return (
    <>
      <MessengerDock
        threads={threads}
        threadsLoading={isLoading}
        unreadTotal={totalUnread}
        keepMounted={[ASK_VIV_THREAD_ID]}
        fullPageHref={(t) => {
          if (!t || t.id === NEW_MESSAGE_THREAD_ID) return '/client/inbox?tab=messages';
          if (t.id === ASK_VIV_THREAD_ID || t.id === NEW_CSC_THREAD_ID) return '/client/inbox?tab=messages';
          if (t.id === NEW_TICKET_THREAD_ID) return '/client/support-tickets';
          const ticketId = ticketIdFromThreadId(t.id);
          return ticketId ? `/client/support-tickets/${ticketId}` : `/client/inbox?tab=messages&thread=${t.id}`;
        }}
        listAction={
          !isReadOnly && !isAcademyOnly ? (
            <button
              type="button"
              onClick={() => select(NEW_MESSAGE_THREAD_ID)}
              aria-label="New message"
              title="New message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          ) : undefined
        }
        renderThread={(thread, api) => {
          if (thread.id === NEW_MESSAGE_THREAD_ID) return <NewMessagePane api={api} />;
          if (thread.id === ASK_VIV_THREAD_ID) {
            return <ClientAskVivChat previewTenantId={previewTenantId} active={api.active} onBack={api.onBack} headerActions={api.headerActions} />;
          }
          if (thread.kind === 'support') return <TicketThreadPane thread={thread} api={api} />;
          return <TenantThread thread={thread} api={api} cscName={cscName} />;
        }}
      />

    </>
  );
}
