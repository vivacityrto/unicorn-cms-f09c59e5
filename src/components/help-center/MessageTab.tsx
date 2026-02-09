import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, User, Headphones, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "staff";
  content: string;
  created_at: string;
}

interface MessageTabProps {
  channel: "csc" | "support";
}

const channelConfig: Record<"csc" | "support", {
  title: string;
  subtitle: string;
  emptyIcon: typeof MessageCircle;
  emptyTitle: string;
  emptyDescription: string;
  placeholder: string;
  fallback?: string;
}> = {
  csc: {
    title: "Message your CSC",
    subtitle: "If you still need help, message your consultant. We reply in Unicorn.",
    emptyIcon: MessageCircle,
    emptyTitle: "Message your consultant",
    emptyDescription: "Send a message. We reply in Unicorn.",
    placeholder: "Type a message to your consultant...",
  },
  support: {
    title: "Support",
    subtitle: "For technical issues and access help. Prefer in-app so we can track everything.",
    emptyIcon: Headphones,
    emptyTitle: "Contact support",
    emptyDescription: "For technical issues and access help.",
    placeholder: "Describe your issue...",
    fallback: "support@vivacity.com.au",
  },
};

export function MessageTab({ channel }: MessageTabProps) {
  const { profile } = useAuth();
  const config = channelConfig[channel];
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load most recent thread for this channel
  useEffect(() => {
    if (!profile?.user_uuid) return;
    (async () => {
      setLoadingHistory(true);
      const { data: threads } = await supabase
        .from("help_threads")
        .select("id")
        .eq("user_id", profile.user_uuid)
        .eq("channel", channel)
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (threads && threads.length > 0) {
        const tid = threads[0].id;
        setThreadId(tid);
        const { data: msgs } = await supabase
          .from("help_messages")
          .select("id, role, content, created_at")
          .eq("thread_id", tid)
          .order("created_at", { ascending: true });
        if (msgs) setMessages(msgs.filter(m => m.role === "user" || m.role === "staff") as Message[]);
      }
      setLoadingHistory(false);
    })();
  }, [profile?.user_uuid, channel]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || !profile) return;
    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    try {
      let currentThreadId = threadId;

      // Create thread if none exists
      if (!currentThreadId) {
        const { data: newThread, error: threadError } = await supabase
          .from("help_threads")
          .insert({
            tenant_id: profile.tenant_id,
            user_id: profile.user_uuid,
            channel,
            status: "open",
          })
          .select("id")
          .single();

        if (threadError) throw threadError;
        currentThreadId = newThread.id;
        setThreadId(currentThreadId);
      }

      // Insert message
      const { data: msg, error: msgError } = await supabase
        .from("help_messages")
        .insert({
          thread_id: currentThreadId,
          sender_id: profile.user_uuid,
          role: "user",
          content: userMsg,
        })
        .select("id, role, content, created_at")
        .single();

      if (msgError) throw msgError;

      setMessages(prev => [...prev, msg as Message]);

      // Touch thread updated_at
      await supabase
        .from("help_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", currentThreadId);
    } catch (err: any) {
      console.error("Message send error:", err);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const EmptyIcon = config.emptyIcon;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border space-y-1">
        <p className="text-sm text-muted-foreground">{config.subtitle}</p>
        {channel === "support" && config.fallback && (
          <p className="text-xs text-muted-foreground">
            Or email: <span className="text-foreground">{config.fallback}</span>
          </p>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {loadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <EmptyIcon className="h-10 w-10 text-secondary opacity-60" />
            <div>
              <p className="font-medium text-secondary">{config.emptyTitle}</p>
              <p className="text-sm text-muted-foreground mt-1">{config.emptyDescription}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "staff" && (
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-secondary/10 flex items-center justify-center">
                    <Headphones className="h-4 w-4 text-secondary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={config.placeholder}
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
