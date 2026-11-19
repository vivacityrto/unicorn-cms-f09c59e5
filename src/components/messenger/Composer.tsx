import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Paperclip, SendHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readDraft, writeDraft } from './messengerLogic';
import type { OutgoingMessage } from './types';

interface ComposerProps {
  onSend: (message: OutgoingMessage) => Promise<void>;
  /** Where the draft is kept (see `draftKey`). Omit to keep no draft. */
  draftKey?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Shown instead of the box for threads people cannot reply to. */
  disabledReason?: string;
  attachments?: boolean;
  /** Returns a message to refuse a file (wrong type, too big), or null to accept it. */
  validateFile?: (file: File) => string | null;
  maxFiles?: number;
  onTyping?: () => void;
  autoFocus?: boolean;
  className?: string;
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx';

/** Message box: Enter sends, Shift+Enter adds a line, paste a screenshot to attach it, drafts survive switching threads. */
export function Composer({ onSend, draftKey: key, placeholder = 'Type a message', disabled, disabledReason, attachments = true, validateFile, maxFiles = 5, onTyping, autoFocus, className }: ComposerProps) {
  const [text, setText] = useState(() => (key ? readDraft(key) : ''));
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  // A different thread means a different draft.
  useEffect(() => {
    setText(key ? readDraft(key) : '');
    setFiles([]);
    setError(null);
  }, [key]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const addFiles = useCallback((incoming: File[]) => {
    const accepted: File[] = [];
    let problem: string | null = null;
    for (const f of incoming) {
      const why = validateFile?.(f) ?? null;
      if (why) problem = why;
      else accepted.push(f);
    }
    setFiles((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > maxFiles) problem = `You can attach up to ${maxFiles} files.`;
      return next.slice(0, maxFiles);
    });
    setError(problem);
  }, [validateFile, maxFiles]);

  const canSend = !disabled && !sending && (text.trim().length > 0 || files.length > 0);

  const send = async () => {
    if (!canSend) return;
    const body = text.trim();
    const outgoing = { body, files };
    setSending(true);
    setError(null);
    setText('');
    setFiles([]);
    if (key) writeDraft(key, '');
    try {
      await onSend(outgoing);
    } catch {
      // Put it back so nothing typed is lost.
      setText(body);
      setFiles(outgoing.files);
      if (key) writeDraft(key, body);
      setError("Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
      box.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!attachments) return;
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  if (disabledReason) {
    return <div className={cn('border-t px-4 py-3 text-center text-xs text-muted-foreground', className)}>{disabledReason}</div>;
  }

  return (
    <div className={cn('border-t px-3 pb-2 pt-2', className)}>
      {files.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5" aria-label="Attachments to send">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex max-w-[12rem] items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px]">
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5">
        {attachments && (
          <>
            <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            <button type="button" aria-label="Attach a file" disabled={disabled} onClick={() => picker.current?.click()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <Paperclip className="h-4 w-4" />
            </button>
          </>
        )}
        <textarea
          ref={box}
          value={text}
          rows={1}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(e) => {
            setText(e.target.value);
            if (key) writeDraft(key, e.target.value);
            const now = Date.now();
            if (onTyping && now - lastTyping.current > 2500) {
              lastTyping.current = now;
              onTyping();
            }
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="max-h-[140px] min-h-[36px] flex-1 resize-none rounded-2xl border bg-background px-3 py-2 text-[13px] leading-snug outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <button type="button" aria-label="Send message" disabled={!canSend} onClick={() => void send()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
      {error ? <p role="alert" className="mt-1 px-1 text-[11px] text-destructive">{error}</p> : <p className="mt-1 px-1 text-[10px] text-muted-foreground">Enter sends, Shift+Enter adds a line{attachments ? '. Paste a screenshot to attach it.' : '.'}</p>}
    </div>
  );
}
