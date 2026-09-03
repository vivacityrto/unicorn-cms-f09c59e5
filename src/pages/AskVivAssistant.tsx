import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAskVivAssistantChat } from "@/hooks/useAskVivAssistantChat";
import { useAskVivAssistantAccess } from "@/hooks/useAskVivAssistantAccess";
import { useAskVivAssistantUsage } from "@/hooks/useAskVivAssistantUsage";
import { useAskVivSuggestedFaqs } from "@/hooks/useAskVivSuggestedFaqs";
import { AssistantMessageBubble } from "@/components/ask-viv-assistant/AssistantMessageBubble";
import { AssistantUsageGauge } from "@/components/ask-viv-assistant/AssistantUsageGauge";
import { Sparkles, Plus, Trash2, Send, Loader2, MessageSquare } from "lucide-react";
import vivIcon from "@/assets/viv-icon.png";

/**
 * Ask Viv Assistant — dedicated full page for the new, genuinely conversational
 * (claude.ai-style) assistant. Separate from the existing floating panel
 * (AskVivPanel.tsx / compliance-assistant) — this shares no backend logic with
 * it beyond the ask_viv_conversations/ask_viv_turns tables and the Markdown
 * bubble rendering pattern. See useAskVivAssistantChat for the shared
 * send/receive/persist logic used by both this page and the floating widget.
 */
export default function AskVivAssistant() {
  const { toast } = useToast();
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

  const { refetchUsage } = useAskVivAssistantUsage();
  const { faqs: suggestedFaqs } = useAskVivSuggestedFaqs();
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadConversationHistory();
    // Deep link from the floating widget's "open full page" button — continue
    // the same conversation instead of landing on an empty one.
    const conversationParam = searchParams.get("conversation");
    if (conversationParam) {
      openConversation(conversationParam).catch((err) => {
        console.error("Failed to open linked conversation:", err);
      });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (accessLoading) return null;

  if (!enabled) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Ask Viv Assistant isn't available yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This is a new feature being rolled out gradually. Check back soon, or ask an admin about access.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSend = async () => {
    const text = inputMessage;
    if (!text.trim() || isSending) return;
    setInputMessage("");
    try {
      await sendMessage(text);
      loadConversationHistory();
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
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete conversation", variant: "destructive" });
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInputMessage(prompt);
    inputRef.current?.focus();
  };

  return (
      <div className="flex h-[calc(100vh-120px)] gap-4 p-4">
        {/* Left panel — conversation history */}
        <Card className="w-80 flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <img src={vivIcon} alt="Ask Viv" className="h-6 w-6 object-contain" />
                Ask Viv
              </CardTitle>
              <Button size="sm" onClick={startNewConversation}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-2">
            <ScrollArea className="h-full" viewportClassName="[&>div]:!block">
              <div className="space-y-1">
                {loadingHistory ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">Loading…</div>
                ) : conversationList.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">No conversations yet</div>
                ) : (
                  conversationList.map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openConversation(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openConversation(c.id);
                        }
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-colors group cursor-pointer ${
                        conversationId === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <MessageSquare className="h-4 w-4 flex-shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-sm">{c.title || "Untitled conversation"}</span>
                        </div>
                        <button
                          onClick={(e) => handleDelete(c.id, e)}
                          className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-muted-foreground hover:text-destructive"
                          title="Delete conversation"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-xs opacity-70 mt-1">{format(new Date(c.updated_at), "MMM d, yyyy")}</div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right panel — active conversation */}
        <Card className="flex-1 flex flex-col">
          <CardContent className="flex-1 flex flex-col p-4 overflow-hidden">
            <div className="flex items-center justify-end mb-2">
              <AssistantUsageGauge />
            </div>
            <ScrollArea className="flex-1 pr-2">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
                  <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4 bg-gradient-to-br from-primary/20 to-purple-500/20">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h4 className="font-medium text-foreground mb-2">Ask Viv Assistant</h4>
                  <p className="text-sm text-muted-foreground max-w-sm mb-4">
                    Ask about a client, a note, an audit, or anything else — I'll look things up as needed.
                  </p>
                  {suggestedFaqs.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                      {suggestedFaqs.map((faq) => (
                        <button
                          key={faq.id}
                          onClick={() => handleSuggestionClick(faq.prompt)}
                          className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors text-left"
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

            <div className="flex gap-2 pt-3 mt-2 border-t border-border">
              <Input
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Viv anything..."
                disabled={isSending}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={isSending || !inputMessage.trim()} size="icon">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}
