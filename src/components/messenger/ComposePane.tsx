import type { ReactNode } from 'react';
import { ChevronLeft, SquarePen } from 'lucide-react';
import { Composer } from './Composer';
import { draftKey } from './messengerLogic';
import type { OutgoingMessage } from './types';

export interface ComposePaneProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  headerActions?: ReactNode;
  /** The fields above the message box (who it is to, subject, category). */
  children?: ReactNode;
  /** True when everything above the message box is filled in. */
  ready: boolean;
  /** Said above the message box while `ready` is false, so a held-back Send is never a mystery. */
  notReadyReason?: string;
  onSend: (message: OutgoingMessage) => Promise<void>;
  attachments?: boolean;
  validateFile?: (file: File) => string | null;
  accept?: string;
  maxFiles?: number;
  /** Keeps a half-written message apart per surface, e.g. "client-new". */
  draftScope: string;
  placeholder?: string;
  className?: string;
}

/**
 * Starting a new conversation, inside the bubble: the same header, message box and look as an open conversation, with a few
 * fields above the box. It is how the client portal and the staff portal both write a first message, instead of a pop-up form.
 */
export function ComposePane({
  title = 'New message', subtitle, onBack, headerActions, children, ready, notReadyReason, onSend, attachments, validateFile, accept, maxFiles, draftScope, placeholder = 'Write your message', className,
}: ComposePaneProps) {
  return (
    <section aria-label="New message" className={`flex min-h-0 flex-1 flex-col ${className ?? ''}`}>
      <header className="flex items-center gap-2 border-b px-3 py-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to conversations" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7130A0] to-[#ED1878] text-white">
          <SquarePen className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight text-foreground">{title}</h2>
          {subtitle && <p className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>}
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-0.5">{headerActions}</div>}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{children}</div>

      {!ready && notReadyReason && <p className="border-t px-4 pt-2 text-[11px] text-muted-foreground">{notReadyReason}</p>}
      <Composer
        onSend={onSend}
        sendDisabled={!ready}
        draftKey={draftKey(draftScope, 'new')}
        placeholder={placeholder}
        attachments={attachments}
        validateFile={validateFile}
        accept={accept}
        maxFiles={maxFiles}
        className={!ready && notReadyReason ? 'border-t-0' : undefined}
      />
    </section>
  );
}
