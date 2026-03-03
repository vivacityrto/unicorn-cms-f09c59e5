import { useState } from "react";
import { useClientCommunications, type Conversation } from "@/hooks/useClientCommunications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, ChevronRight, Mail, MailOpen } from "lucide-react";
import { format } from "date-fns";

export default function ClientCommunicationsPage() {
  const { conversations, totalUnread, isLoading, markConversationRead } = useClientCommunications();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);

  const filtered = filterUnread ? conversations.filter((c) => c.unreadCount > 0) : conversations;
  const selected = conversations.find((c) => c.conversationId === selectedId);

  const handleSelect = (conv: Conversation) => {
    setSelectedId(conv.conversationId);
    if (conv.unreadCount > 0) {
      markConversationRead(conv.conversationId);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "hsl(270 47% 26%)" }}>
          Communications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Messages between you and the Vivacity team.
        </p>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Conversation list */}
          <div className="lg:col-span-1 border rounded-lg overflow-hidden" style={{ borderColor: "hsl(270 20% 88%)" }}>
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No conversations yet.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "hsl(270 20% 88%)" }}>
                {filtered.map((conv) => (
                  <button
                    key={conv.conversationId}
                    onClick={() => handleSelect(conv)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 ${
                      selectedId === conv.conversationId ? "bg-muted/70" : ""
                    }`}
                  >
                    {conv.unreadCount > 0 ? (
                      <Mail className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(330 86% 51%)" }} />
                    ) : (
                      <MailOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: "hsl(270 47% 26%)" }}>
                        {conv.latestMessage.body.slice(0, 50)}
                        {conv.latestMessage.body.length > 50 ? "…" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(conv.latestMessage.created_at), "dd MMM yyyy, HH:mm")}
                      </p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0 flex-shrink-0">
                        {conv.unreadCount}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Message detail */}
          <div className="lg:col-span-2 border rounded-lg" style={{ borderColor: "hsl(270 20% 88%)" }}>
            {selected ? (
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {selected.messages.map((msg) => (
                  <div key={msg.id} className="rounded-lg p-3 bg-muted/40">
                    <p className="text-sm" style={{ color: "hsl(270 47% 26%)" }}>{msg.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(msg.created_at), "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a conversation to view messages.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
