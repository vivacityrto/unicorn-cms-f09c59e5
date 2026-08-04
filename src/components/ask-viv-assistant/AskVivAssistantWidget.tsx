import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAskVivAssistantChat } from "@/hooks/useAskVivAssistantChat";
import { useAskVivAssistantAccess } from "@/hooks/useAskVivAssistantAccess";
import { useAskVivAssistantWidget } from "@/hooks/useAskVivAssistantWidget";
import { useAskVivAssistantUsage } from "@/hooks/useAskVivAssistantUsage";
import { useAskVivSuggestedFaqs } from "@/hooks/useAskVivSuggestedFaqs";
import { AssistantMessageBubble } from "@/components/ask-viv-assistant/AssistantMessageBubble";
import { AssistantUsageGauge } from "@/components/ask-viv-assistant/AssistantUsageGauge";
import { X, Send, Loader2, Sparkles, History, MessageSquare, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import vivIcon from "@/assets/viv-icon.png";

/**
 * Floating launcher for Ask Viv Assistant — a new, separate widget from the
 * existing AskVivPanel/AskVivFloatingLauncher, sharing no state or backend
 * logic with it beyond the Markdown bubble pattern. Positioned bottom-left
 * (the existing panel opens bottom-right) so the two can never visually
 * collide if both happen to be open at once.
 *
 * Compact single-active-conversation view, plus the same lightweight
 * history-dropdown pattern already used in the existing panel, for quick
 * inline questions without leaving the current page. The full two-pane
 * experience with a real sidebar lives at /ask-viv.
 *
 * Open/closed state lives in useAskVivAssistantWidget (shared, not local) so
 * the topbar Ask Viv button (AskVivButton.tsx) can open this same widget
 * instance from a different part of the component tree.
 */
export function AskVivAssistantWidget() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { enabled, isLoading: accessLoading } = useAskVivAssistantAccess();
  const {
    conversationId,
    messages,
    isSending,
    conversationList,
    loadingHistory,
    startNewConversation,
    loadConversationHistory,
    openConversation,
    deleteConversation,
    sendMessage,
  } = useAskVivAssistantChat();

  const { isOpen, openWidget, closeWidget } = useAskVivAssistantWidget();
  const { refetchUsage } = useAskVivAssistantUsage();
  const { faqs: suggestedFaqs } = useAskVivSuggestedFaqs();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  if (accessLoading || !enabled) return null;

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadConversationHistory();
  };

  const handleOpenFullPage = () => {
    navigate(conversationId ? `/ask-viv?conversation=${conversationId}` : "/ask-viv");
    closeWidget();
  };

  const handleSend = async () => {
    const text = inputMessage;
    if (!text.trim() || isSending) return;
    setInputMessage("");
    try {
      await sendMessage(text);
      refetchUsage();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
    } catch {
      toast({ title: "Error", description: "Failed to delete conversation", variant: "destructive" });
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInputMessage(prompt);
    inputRef.current?.focus();
  };

  if (!isOpen) {
    return (
      <button
        onClick={openWidget}
        className="fixed bottom-6 left-6 z-50 h-16 w-16 rounded-full bg-background shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105 border border-border"
        aria-label="Open Ask Viv Assistant"
      >
        <img src={vivIcon} alt="Ask Viv Assistant" className="h-12 w-12 object-contain group-hover:scale-110 transition-transform" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 w-[420px] h-[600px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col">
      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-border rounded-t-2xl bg-gradient-to-r from-primary/10 to-purple-500/10">
        <div className="flex items-center gap-3">
          <img src={vivIcon} alt="Ask Viv" className="h-10 w-10 rounded-full object-contain" />
          <div>
            <h3 className="font-semibold text-foreground">Ask Viv</h3>
            <p className="text-xs text-muted-foreground">Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AssistantUsageGauge compact />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleHistory} title="Conversation history">
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOpenFullPage} title="Open full page">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeWidget}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {historyOpen && (
          <div className="absolute top-full left-2 right-2 z-20 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Recent conversations</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHistoryOpen(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {loadingHistory ? (
              <div className="p-3 text-xs text-muted-foreground text-center">Loading…</div>
            ) : conversationList.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">No past conversations yet</div>
            ) : (
              <div className="p-1">
                {conversationList.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      openConversation(c.id);
                      setHistoryOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-muted/50 text-xs",
                      conversationId === c.id && "bg-muted"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{c.title || "Untitled conversation"}</span>
                    <button
                      onClick={(e) => handleDelete(c.id, e)}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                      title="Delete conversation"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4 bg-gradient-to-br from-primary/20 to-purple-500/20">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h4 className="font-medium text-foreground mb-2">Ask Viv Assistant</h4>
            <p className="text-sm text-muted-foreground mb-3">Ask about a client, a note, an audit, or anything else.</p>
            {suggestedFaqs.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {suggestedFaqs.slice(0, 5).map((faq) => (
                  <button
                    key={faq.id}
                    onClick={() => handleSuggestionClick(faq.prompt)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors text-left"
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
              <div className="flex gap-2 items-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border bg-muted/30 rounded-b-2xl">
        {messages.length > 0 && (
          <div className="flex justify-center mb-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={startNewConversation}>
              <MessageSquare className="h-3 w-3 mr-1" />
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
            disabled={isSending}
            className="flex-1 bg-background border-border/50"
          />
          <Button
            onClick={handleSend}
            disabled={isSending || !inputMessage.trim()}
            size="icon"
            className="bg-gradient-to-br from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
