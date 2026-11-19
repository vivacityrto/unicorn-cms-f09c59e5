import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, History, Loader2, Maximize2, MessageSquare, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAskVivAssistantChat } from '@/hooks/useAskVivAssistantChat';
import { useAskVivAssistantUsage } from '@/hooks/useAskVivAssistantUsage';
import { useAskVivSuggestedFaqs } from '@/hooks/useAskVivSuggestedFaqs';
import { useMessengerDock } from '@/components/messenger';
import { AssistantMessageBubble } from '@/components/ask-viv-assistant/AssistantMessageBubble';
import { AssistantUsageGauge } from '@/components/ask-viv-assistant/AssistantUsageGauge';
import { cn } from '@/lib/utils';

interface Props {
  /** True while this is the thread on screen, so the question box is focused when it opens. */
  active?: boolean;
  /** Back to the thread list. */
  onBack?: () => void;
  /** The close button (and anything else the bubble puts on the right of a thread header). */
  headerActions?: ReactNode;
  className?: string;
}

/**
 * Ask Viv for staff, as a thread inside the messenger bubble. It is the same assistant, with the same conversations, usage
 * limit and suggestions as the old bottom-left widget (which is retired); only the frame is different. It replies only to a
 * question that was sent, and keeps working while the bubble is closed or you are on another thread.
 */
export function StaffAskVivChat({ active = true, onBack, headerActions, className }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { closeDock } = useMessengerDock();
  const {
    conversationId, messages, isSending, conversationList, loadingHistory, pageTenantName,
    startNewConversation, loadConversationHistory, openConversation, deleteConversation, sendMessage,
  } = useAskVivAssistantChat();
  const { refetchUsage } = useAskVivAssistantUsage();
  const { faqs: suggestedFaqs } = useAskVivSuggestedFaqs();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [active]);

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadConversationHistory();
  };

  const openFullPage = () => {
    navigate(conversationId ? `/ask-viv?conversation=${conversationId}` : '/ask-viv');
    closeDock();
  };

  const handleSend = async () => {
    const text = inputMessage;
    if (!text.trim() || isSending) return;
    setInputMessage('');
    try {
      await sendMessage(text);
      refetchUsage();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to send message', variant: 'destructive' });
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleDelete = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
    } catch {
      toast({ title: 'Error', description: 'Failed to delete conversation', variant: 'destructive' });
    }
  };

  const iconButton = 'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div role="region" aria-label="Ask Viv" className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="relative flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to conversations" className={iconButton}>
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7130A0] to-[#ED1878] text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight text-foreground">Ask Viv</h2>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{pageTenantName ? `Viewing ${pageTenantName}` : 'Assistant'}</p>
        </div>
        <AssistantUsageGauge compact />
        <button type="button" onClick={toggleHistory} aria-label="Conversation history" title="Conversation history" className={iconButton}>
          <History className="h-4 w-4" />
        </button>
        <button type="button" onClick={openFullPage} aria-label="Open Ask Viv full page" title="Open full page" className={iconButton}>
          <Maximize2 className="h-4 w-4" />
        </button>
        {headerActions && <div className="flex shrink-0 items-center gap-0.5">{headerActions}</div>}

        {historyOpen && (
          <div className="absolute left-2 right-2 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium text-foreground">Recent conversations</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHistoryOpen(false)} aria-label="Close history">
                <X className="h-3 w-3" />
              </Button>
            </div>
            {loadingHistory ? (
              <div className="p-3 text-center text-xs text-muted-foreground">Loading…</div>
            ) : conversationList.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">No past conversations yet</div>
            ) : (
              <div className="p-1">
                {conversationList.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      openConversation(c.id);
                      setHistoryOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        openConversation(c.id);
                        setHistoryOpen(false);
                      }
                    }}
                    className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50', conversationId === c.id && 'bg-muted')}
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{c.title || 'Untitled conversation'}</span>
                    <button type="button" onClick={(e) => void handleDelete(c.id, e)} className="flex-shrink-0 text-muted-foreground hover:text-destructive" title="Delete conversation" aria-label="Delete conversation">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h4 className="mb-2 font-medium text-foreground">Ask Viv</h4>
            <p className="mb-3 text-sm text-muted-foreground">Ask about a client, a note, an audit, or anything else.</p>
            {suggestedFaqs.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {suggestedFaqs.slice(0, 5).map((faq) => (
                  <button
                    key={faq.id}
                    type="button"
                    onClick={() => {
                      setInputMessage(faq.prompt);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-left text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    {faq.prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <AssistantMessageBubble key={message.id} message={message} />
            ))}
            {isSending && (
              <div className="flex items-start gap-2" aria-label="Ask Viv is thinking">
                <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div className="shrink-0 border-t border-border bg-muted/30 p-3">
        {messages.length > 0 && (
          <div className="mb-2 flex justify-center">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={startNewConversation}>
              <MessageSquare className="mr-1 h-3 w-3" />
              New conversation
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Viv anything..."
            aria-label="Ask Viv"
            disabled={isSending}
            className="flex-1 border-border/50 bg-background"
          />
          <Button
            onClick={() => void handleSend()}
            disabled={isSending || !inputMessage.trim()}
            size="icon"
            aria-label="Send"
            className="bg-gradient-to-br from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
