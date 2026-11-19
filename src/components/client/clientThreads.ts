import { conversationKind, toMessengerThread } from '@/components/messenger/adapters/tenantConversations';
import type { MessengerThread } from '@/components/messenger';
import type { useClientCommunications } from '@/hooks/useClientCommunications';

export const ASK_VIV_THREAD_ID = 'ask_viv';
/** The "your consultant" thread before the first message has been sent, so there is nothing to open yet. */
export const NEW_CSC_THREAD_ID = 'csc:new';

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
  cscName: string | null;
  cscAvatarUrl: string | null;
  hasCsc: boolean;
}

/**
 * The bubble's thread list for a client: Ask Viv first, then the consultant (a real conversation if one exists, otherwise a
 * place to start one), then every other conversation of the organisation, newest first.
 */
export function buildClientThreads({ conversations, cscName, cscAvatarUrl, hasCsc }: BuildInput): MessengerThread[] {
  const all = conversations.map(toMessengerThread);
  // The most recent conversation with the consultant is "the" consultant thread.
  const cscConversation = conversations
    .filter((c) => conversationKind(c.type, c.topic) === 'csc')
    .sort((a, b) => new Date(b.last_message_at ?? b.created_at).getTime() - new Date(a.last_message_at ?? a.created_at).getTime())[0];

  const threads = all.map((t) => (t.id === cscConversation?.id ? { ...t, pinned: true, title: cscName ?? t.title, avatarUrl: cscAvatarUrl } : t));
  if (!cscConversation && hasCsc) {
    threads.push({
      id: NEW_CSC_THREAD_ID,
      kind: 'csc',
      title: cscName ?? 'Your consultant',
      preview: 'Send your consultant a message',
      unread: false,
      pinned: true,
      avatarUrl: cscAvatarUrl,
    });
  }
  return [ASK_VIV_THREAD, ...threads];
}
