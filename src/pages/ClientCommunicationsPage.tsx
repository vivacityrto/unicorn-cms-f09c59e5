import { useState, useRef, useEffect } from "react";
import { useClientCommunications, type ConversationThread } from "@/hooks/useClientCommunications";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { NewConversationDialog } from "@/components/client/NewConversationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Send, Mail, MailOpen } from "lucide-react";
import { format } from "date-fns";

const TYPE_COLORS: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  package: "bg-primary/10 text-primary",
  task: "bg-accent/60 text-accent-foreground",
  rock: "bg-secondary text-secondary-foreground",
  broadcast: "bg-accent text-accent-foreground",
};

export default function ClientCommunicationsPage() {
  const {
    conversations,
    totalUnread,
    isLoading,
    useConversationMessages,
    sendMessage,
    createConversation,
    markRead,
    currentUserId,
  } = useClientCommunications();

  const { isReadOnly } = useClientTenant();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filtered = filterUnread ? conversations.filter((c) => c.isUnread) : conversations;
  const selected = conversations.find((c) => c.id === selectedId);

  const { data: messages = [], isLoading: messagesLoading } = useConversationMessages(selectedId);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSelect = (conv: ConversationThread) => {
    setSelectedId(conv.id);
    if (conv.isUnread) {
      markRead.mutate(conv.id);
    }
  };

  const handleSend = async () => {
    if (!composerText.trim() || !selectedId) return;
    const text = composerText.trim();
    setComposerText("");
    await sendMessage.mutateAsync({ conversationId: selectedId, body: text });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = async (data: { subject?: string; type: string; firstMessage: string }) => {
    const newId = await createConversation.mutateAsync({
      subject: data.subject,
      type: data.type,
      firstMessage: data.firstMessage,
    });
    setSelectedId(newId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Communications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Messages between you and the Vivacity team.
          </p>
        </div>
        {!isReadOnly && (
          <Button onClick={() => setNewDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Message
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={!filterUnread ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterUnread(false)}
        >
          All
        </Button>
        <Button
          variant={filterUnread ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterUnread(true)}
          className="gap-1.5"
        >
          <Mail className="h-3.5 w-3.5" />
          Unread
          {totalUnread > 0 && (
            <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
              {totalUnread}
            </Badge>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: "60vh" }}>
          {/* Thread list */}
          <div className="lg:col-span-1 border rounded-lg overflow-hidden border-border">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No conversations yet.</p>
              </div>
            ) : (
              <ScrollArea className="h-[60vh]">
                <div className="divide-y divide-border">
                  {filtered.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelect(conv)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 ${
                        selectedId === conv.id ? "bg-muted/70" : ""
                      }`}
                    >
                      {conv.isUnread ? (
                        <Mail className="h-4 w-4 flex-shrink-0 text-destructive" />
                      ) : (
                        <MailOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-sm font-medium truncate text-foreground">
                            {conv.subject || conv.topic || "General"}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_COLORS[conv.type] || ""}`}
                          >
                            {conv.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.last_message_preview || "No messages yet"}
                        </p>
                        {conv.last_message_at && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {format(new Date(conv.last_message_at), "d MMM yyyy, HH:mm")}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Message detail + composer */}
          <div className="lg:col-span-2 border rounded-lg border-border flex flex-col">
            {selected ? (
              <>
                {/* Header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <h2 className="font-semibold text-foreground truncate">
                    {selected.subject || selected.topic || "General"}
                  </h2>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_COLORS[selected.type] || ""}`}
                  >
                    {selected.type}
                  </Badge>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: "calc(60vh - 140px)" }}>
                  <div className="p-4 space-y-3">
                    {messagesLoading ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-14 w-3/4 rounded-lg" />
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No messages in this conversation yet.
                      </p>
                    ) : (
                      messages.map((msg) => {
                        const isOwn = msg.sender_id === currentUserId;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`rounded-lg px-3 py-2 max-w-[75%] ${
                                isOwn
                                  ? "bg-primary/10 text-foreground"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {!isOwn && (
                                <p className="text-xs font-medium text-muted-foreground mb-0.5">
                                  {msg.sender_name}
                                </p>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {format(new Date(msg.created_at), "d MMM, HH:mm")}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Composer */}
                {!isReadOnly && (
                  <div className="p-3 border-t border-border flex gap-2">
                    <Textarea
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                      className="min-h-[40px] max-h-[120px] resize-none"
                      rows={1}
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!composerText.trim() || sendMessage.isPending}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a conversation to view messages.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <NewConversationDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onSubmit={handleNewConversation}
        isSubmitting={createConversation.isPending}
      />
    </div>
  );
}
