import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Composer } from './Composer';
import { MessageTimeline } from './MessageTimeline';
import { THREAD_KIND_LABEL, draftKey } from './messengerLogic';
import { ThreadTile } from './ThreadList';
import { BADGE_TONE } from './threadStyle';
import { DEFAULT_CAPABILITIES, type MessengerMessage, type MessengerPerson, type MessengerThread, type OutgoingMessage, type ThreadCapabilities } from './types';

export interface ConversationPaneProps {
  thread: MessengerThread;
  messages: MessengerMessage[];
  people?: MessengerPerson[];
  isLoading?: boolean;
  hasOlder?: boolean;
  onLoadOlder?: () => void;
  typingNames?: string[];
  capabilities?: Partial<ThreadCapabilities>;
  onSend: (message: OutgoingMessage) => Promise<void>;
  onRetry?: (messageId: string) => void;
  onMarkRead?: () => void;
  onTyping?: () => void;
  /** Shown as a back arrow (used on small screens and in the bubble). */
  onBack?: () => void;
  /** Extra classes for the back arrow, e.g. "xl:hidden" when the list is always visible beside the conversation. */
  backClassName?: string;
  /** Icon buttons on the right of the header (for example open full page, assign, resolve). */
  headerActions?: ReactNode;
  /** Keeps drafts apart between surfaces, e.g. "client-inbox". */
  draftScope?: string;
  composerPlaceholder?: string;
  validateFile?: (file: File) => string | null;
  /** Passed to the file picker, e.g. ".jpg,.png,.pdf". */
  accept?: string;
  maxFiles?: number;
  renderAttachments?: (message: MessengerMessage) => ReactNode;
  /** Host-owned rows after the last message, such as Ask Viv's "thinking" bubble. */
  footer?: ReactNode;
  /** Replaces the default empty state of a thread with no messages. */
  empty?: ReactNode;
  className?: string;
}

/** One open conversation: condensed icon header, messages, and the message box. Give it `key={thread.id}`. */
export function ConversationPane({
  thread, messages, people, isLoading, hasOlder, onLoadOlder, typingNames, capabilities, onSend, onRetry, onMarkRead, onTyping, onBack,
  headerActions, backClassName, draftScope = 'messenger', composerPlaceholder, validateFile, accept, maxFiles, renderAttachments, footer, empty, className,
}: ConversationPaneProps) {
  const caps = { ...DEFAULT_CAPABILITIES, ...capabilities };
  // Where "New messages" goes is fixed when the thread opens, so it does not jump as you read.
  const [unreadAfter] = useState(() => (thread.unread ? thread.myLastReadAt ?? null : null));
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (thread.unread && messages.length > 0) onMarkRead?.();
    // Only when the thread is unread and its newest message changes; the host clears `unread` once it has recorded the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.unread, lastId]);

  return (
    <section aria-label="Conversation" className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <header className="flex items-center gap-2 border-b px-3 py-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to conversations" className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', backClassName)}>
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <ThreadTile thread={thread} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight text-foreground">{thread.title}</h2>
          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
            {THREAD_KIND_LABEL[thread.kind]}
            {thread.badge && <span className={cn('rounded-full border px-1.5 text-[10px] leading-4', BADGE_TONE[thread.badge.tone])}>{thread.badge.label}</span>}
          </p>
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-0.5">{headerActions}</div>}
      </header>
      <MessageTimeline
        messages={messages}
        isLoading={isLoading}
        people={people}
        unreadAfter={unreadAfter}
        typingNames={typingNames}
        showSeen={caps.showSeen}
        hasOlder={hasOlder}
        onLoadOlder={onLoadOlder}
        onRetry={onRetry}
        renderAttachments={renderAttachments}
        footer={footer}
        empty={empty}
      />
      <Composer
        key={thread.id}
        onSend={onSend}
        draftKey={draftKey(draftScope, thread.id)}
        placeholder={composerPlaceholder}
        attachments={caps.attachments}
        validateFile={validateFile}
        accept={accept}
        maxFiles={maxFiles}
        onTyping={onTyping}
        disabledReason={!caps.canSend || thread.readOnly ? 'This conversation is read only.' : undefined}
      />
    </section>
  );
}
