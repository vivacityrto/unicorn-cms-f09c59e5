import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export function ChatTab() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load most recent chatbot thread
  useEffect(() => {
    if (!profile?.user_uuid) return;
    (async () => {
      setLoadingHistory(true);
      const { data: threads } = await supabase
        .from("help_threads")
        .select("id")
        .eq("user_id", profile.user_uuid)
        .eq("channel", "chatbot")
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
        if (msgs) setMessages(msgs.filter(m => m.role === "user" || m.role === "assistant") as Message[]);
      }
      setLoadingHistory(false);
    })();
  }, [profile?.user_uuid]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || !profile) return;
    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    // Optimistic user message
    const tempId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: tempId, role: "user", content: userMsg, created_at: new Date().toISOString() }]);

    try {
      const { data, error } = await supabase.functions.invoke("help-center-chat", {
        body: {
          message: userMsg,
          thread_id: threadId,
          tenant_id: profile.tenant_id,
        },
      });

      if (error) throw error;

      if (data?.thread_id) setThreadId(data.thread_id);
      if (data?.assistant_message) {
        setMessages(prev => [
          ...prev,
          {
            id: data.assistant_message.id || crypto.randomUUID(),
            role: "assistant",
            content: data.assistant_message.content,
            created_at: data.assistant_message.created_at || new Date().toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      toast.error("Failed to send message. Please try again.");
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm text-muted-foreground">
          Start with the chatbot for fast answers. All conversations are saved to your account.
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {loadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Bot className="h-10 w-10 text-primary opacity-60" />
            <div>
              <p className="font-medium text-secondary">Ask a compliance question</p>
              <p className="text-sm text-muted-foreground mt-1">
                Get answers about RTO standards, CRICOS, and more.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
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
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-secondary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-secondary" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
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
            placeholder="Ask a question..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
