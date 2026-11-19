import { conversationKind, toMessengerThread } from '@/components/messenger/adapters/tenantConversations';
import { NEW_TICKET_THREAD, NEW_TICKET_THREAD_ID, toTicketThread } from '@/components/messenger/adapters/supportTickets';
import type { MessengerThread } from '@/components/messenger';
import type { ClientTicketRow } from '@/components/client-portal/support-tickets/useClientTickets';
import type { useClientCommunications } from '@/hooks/useClientCommunications';

export const ASK_VIV_THREAD_ID = 'ask_viv';
/** The "your consultant" thread before the first message has been sent, so there is nothing to open yet. */
export const NEW_CSC_THREAD_ID = 'csc:new';
export { NEW_TICKET_THREAD_ID };

/**
 * Ids the old Help Center buttons use ("Message your CSC", "Support") before the real thread is known. The bubble swaps
 * them for the real thread once the list has loaded (see resolveHelpAlias).
 */
export const HELP_ALIAS_CSC = 'alias:csc';
export const HELP_ALIAS_SUPPORT = 'alias:support';

const ASK_VIV_THREAD: MessengerThread = {
  id: ASK_VIV_THREAD_ID,
  kind: 'ask_viv',
  title: 'Ask Viv',
  preview: 'Ask about your account or find your way around',
  unread: false,
  pinned: true,
};

interface BuildInput {
  conversations: ReturnType<typeof useClientCommunications>['conversations'];
  tickets?: readonly ClientTicketRow[];
  cscName: string | null;
  cscAvatarUrl: string | null;
  hasCsc: boolean;
  /** Academy-only people have no conversations and no Ask Viv; support tickets are what they can use. */
  academyOnly?: boolean;
}

/**
 * The bubble's thread list for a client: Ask Viv first, then the consultant (a real conversation if one exists, otherwise a
 * place to start one), then Contact support, then every other conversation and support ticket, newest first.
 */
export function buildClientThreads({ conversations, tickets = [], cscName, cscAvatarUrl, hasCsc, academyOnly = false }: BuildInput): MessengerThread[] {
  const out: MessengerThread[] = [];
  if (!academyOnly) {
    // The most recent conversation with the consultant is "the" consultant thread.
    const cscConversation = conversations
      .filter((c) => conversationKind(c.type, c.topic) === 'csc')
      .sort((a, b) => new Date(b.last_message_at ?? b.created_at).getTime() - new Date(a.last_message_at ?? a.created_at).getTime())[0];

    out.push(ASK_VIV_THREAD);
    if (cscConversation) {
      const t = toMessengerThread(cscConversation);
      out.push({ ...t, pinned: true, title: cscName ?? t.title, avatarUrl: cscAvatarUrl });
    } else if (hasCsc) {
      out.push({
        id: NEW_CSC_THREAD_ID,
        kind: 'csc',
        title: cscName ?? 'Your consultant',
        preview: 'Send your consultant a message',
        unread: false,
        pinned: true,
        avatarUrl: cscAvatarUrl,
      });
    }
    out.push(NEW_TICKET_THREAD);
    for (const c of conversations) if (c.id !== cscConversation?.id) out.push(toMessengerThread(c));
  } else {
    out.push(NEW_TICKET_THREAD);
  }
  for (const t of tickets) out.push(toTicketThread(t));
  return out;
}

/** The real thread a Help Center alias stands for, or null when it is not an alias (or the list has no such thread). */
export function resolveHelpAlias(id: string | null, threads: readonly MessengerThread[]): string | null {
  if (id === HELP_ALIAS_SUPPORT) return NEW_TICKET_THREAD_ID;
  if (id === HELP_ALIAS_CSC) {
    return threads.find((t) => t.kind === 'csc' && t.pinned)?.id ?? null;
  }
  return null;
}
