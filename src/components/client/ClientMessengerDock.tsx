import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ClientAskVivChat } from '@/components/ask-viv/ClientAskVivChat';
import { NewConversationDialog } from '@/components/client/NewConversationDialog';
import {
  ConversationPane,
  MessengerDock,
  useMessengerDock,
  type DockThreadApi,
  type MessengerThread,
} from '@/components/messenger';
import { ASK_VIV_THREAD_ID, NEW_CSC_THREAD_ID, buildClientThreads } from './clientThreads';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useClientHomeHero } from '@/hooks/use-client-home-hero';
import { useClientCommunications } from '@/hooks/useClientCommunications';
import { useClientConversationPane } from '@/hooks/useClientConversationPane';

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

/**
 * The messenger bubble for the client portal. One place for Ask Viv, the consultant, notices from Vivacity and every other
 * conversation, with an unread count on the launcher. It replaces the old Ask Viv-only bubble.
 */
export function ClientMessengerDock({ previewTenantId }: { previewTenantId?: number }) {
  const { conversations, totalUnread, isLoading, createConversation } = useClientCommunications();
  const { activeTenantId, isReadOnly } = useClientTenant();
  const { data: hero } = useClientHomeHero();
  const { select } = useMessengerDock();
  const [newOpen, setNewOpen] = useState(false);

  const cscName = hero?.csc_display_name ?? null;
  const threads = useMemo(
    () => buildClientThreads({ conversations, cscName, cscAvatarUrl: hero?.csc_avatar_url ?? null, hasCsc: !!hero?.csc_user_id }),
    [conversations, cscName, hero?.csc_avatar_url, hero?.csc_user_id],
  );

  return (
    <>
      <MessengerDock
        threads={threads}
        threadsLoading={isLoading}
        unreadTotal={totalUnread}
        keepMounted={[ASK_VIV_THREAD_ID]}
        fullPageHref={(t) => (t && t.id !== ASK_VIV_THREAD_ID && t.id !== NEW_CSC_THREAD_ID ? `/client/inbox?tab=messages&thread=${t.id}` : '/client/inbox?tab=messages')}
        listAction={
          !isReadOnly ? (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              aria-label="New message"
              title="New message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          ) : undefined
        }
        renderThread={(thread, api) =>
          thread.id === ASK_VIV_THREAD_ID ? (
            <ClientAskVivChat previewTenantId={previewTenantId} active={api.active} onBack={api.onBack} headerActions={api.headerActions} />
          ) : (
            <TenantThread thread={thread} api={api} cscName={cscName} />
          )
        }
      />

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmit={async (data) => {
          const id = await createConversation.mutateAsync({ subject: data.subject, type: data.type, firstMessage: data.firstMessage });
          select(id);
          return id;
        }}
        isSubmitting={createConversation.isPending}
        tenantId={activeTenantId ?? null}
      />
    </>
  );
}
