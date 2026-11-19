/**
 * The shared messenger's data contract.
 *
 * Every conversation surface (the client Inbox, the Ask Viv bubble, staff Communications, a client's Messages tab) is the
 * same set of components fed by a "thread source" that turns its own tables into these shapes. The components never
 * know which table a thread came from, so adding a thread type is writing one source, not another chat UI.
 */

export type ThreadKind =
  | 'ask_viv'
  | 'csc'
  | 'support'
  | 'broadcast'
  | 'package'
  | 'task'
  | 'rock'
  | 'general'
  | 'direct';

export type SenderRole = 'client' | 'staff' | 'bot' | 'system';
export type BadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
export type DeliveryState = 'sent' | 'sending' | 'failed';

export interface MessengerPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: SenderRole;
  /** When this person last read the thread. Drives "Seen" on your latest message; leave unset where read state is unknown. */
  lastReadAt?: string | null;
}

export interface MessengerAttachment {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  /** Resolved by the source when it is cheap; otherwise the host app renders attachments itself via `renderAttachments`. */
  url?: string | null;
}

export interface MessengerMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  senderRole: SenderRole;
  fromMe: boolean;
  /** Plain text. Never HTML: client-written text is always rendered as text. */
  body: string;
  createdAt: string;
  attachments?: MessengerAttachment[];
  delivery?: DeliveryState;
}

export interface MessengerThread {
  id: string;
  kind: ThreadKind;
  title: string;
  preview?: string | null;
  lastActivityAt?: string | null;
  unread: boolean;
  /** Shown instead of a dot when known. */
  unreadCount?: number;
  pinned?: boolean;
  /** A short status chip, such as a support ticket's "In progress". */
  badge?: { label: string; tone: BadgeTone };
  participants?: MessengerPerson[];
  avatarUrl?: string | null;
  /** Where you had read up to when the list loaded. The thread opens at "New messages" after this. */
  myLastReadAt?: string | null;
  /** True for threads people cannot reply to (for example a broadcast). */
  readOnly?: boolean;
}

export interface ThreadCapabilities {
  canSend: boolean;
  attachments: boolean;
  /** Show "Seen" under your latest message (needs `lastReadAt` on participants). */
  showSeen: boolean;
}

export const DEFAULT_CAPABILITIES: ThreadCapabilities = { canSend: true, attachments: true, showSeen: true };

export interface OutgoingMessage {
  body: string;
  files: File[];
}

/**
 * What a thread type implements to appear in the messenger. Hooks are called in a fixed order by the host, so a source is
 * a plain object of stable functions. Sources are combined by the host (the Inbox page or the bubble), not by the kit.
 */
export interface ThreadSource {
  id: string;
  /** Threads this source contributes to the list. */
  useThreads: () => { threads: MessengerThread[]; isLoading: boolean; error?: unknown };
  /** The open thread: messages, people and the actions on it. Only called for a thread this source owns. */
  useThread: (threadId: string) => {
    messages: MessengerMessage[];
    people?: MessengerPerson[];
    isLoading: boolean;
    error?: unknown;
    hasOlder?: boolean;
    loadOlder?: () => void;
    /** Names of people typing right now (never includes you). */
    typingNames?: string[];
    capabilities?: Partial<ThreadCapabilities>;
    send: (message: OutgoingMessage) => Promise<void>;
    retry?: (messageId: string) => Promise<void>;
    markRead?: () => void;
    notifyTyping?: () => void;
  };
}
