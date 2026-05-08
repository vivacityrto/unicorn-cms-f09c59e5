import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, User, Headphones, MessageCircle, Paperclip, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function getBrowserName(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  return 'Unknown';
}

function getOSName(ua: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

interface Message {
  id: string;
  role: "user" | "staff";
  content: string;
  created_at: string;
  sender_user_uuid?: string;
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
  // For CSC: tenant_conversations.id; for support: help_threads.id
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // CSC branch: blocks send when participant upsert failed.
  const [cscInitFailed, setCscInitFailed] = useState(false);
  const [cscProfile, setCscProfile] = useState<{ avatar_url: string | null; first_name: string | null; last_name: string | null } | null>(null);
  const [staffNameMap, setStaffNameMap] = useState<Map<string, string>>(new Map());
  const [staffAvatarMap, setStaffAvatarMap] = useState<Map<string, string | null>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---------- Load history ----------
  useEffect(() => {
    if (!profile?.user_uuid) return;

    let cancelled = false;

    (async () => {
      setLoadingHistory(true);
      setMessages([]);
      setThreadId(null);
      setCscInitFailed(false);
      setCscProfile(null);

      if (channel === "csc") {
        await loadCscThread();
      } else {
        await loadSupportThread();
      }

      if (!cancelled) setLoadingHistory(false);
    })();

    async function loadSupportThread() {
      const { data: threads } = await supabase
        .from("help_threads")
        .select("id")
        .eq("user_id", profile!.user_uuid)
        .eq("channel", "support")
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (cancelled) return;
      if (threads && threads.length > 0) {
        const tid = threads[0].id;
        setThreadId(tid);
        const { data: msgs } = await supabase
          .from("help_messages")
          .select("id, role, content, created_at")
          .eq("thread_id", tid)
          .order("created_at", { ascending: true });
        if (!cancelled && msgs) {
          setMessages(msgs.filter(m => m.role === "user" || m.role === "staff") as Message[]);
        }
      }
    }

    async function loadCscThread() {
      const tenantId = profile!.tenant_id;
      const myUuid = profile!.user_uuid;
      if (!tenantId || !myUuid) return;

      // 1) Resolve existing open CSC conversation, or create one.
      let conversationId: string | null = null;
      const { data: existing } = await (supabase
        .from("tenant_conversations" as any)
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("topic", "csc")
        .eq("created_by_user_uuid", myUuid)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()) as any;

      if (existing?.id) {
        conversationId = existing.id;
      } else {
        const { data: created, error: createErr } = await (supabase
          .from("tenant_conversations" as any)
          .insert({
            tenant_id: tenantId,
            topic: "csc",
            type: "direct",
            subject: "Message your CSC",
            created_by_user_uuid: myUuid,
            status: "open",
          } as any)
          .select("id")
          .single()) as any;
        if (createErr || !created?.id) {
          console.error("CSC conversation create failed:", createErr);
          toast.error("Could not initialize your message thread. Please refresh and try again.");
          setCscInitFailed(true);
          return;
        }
        conversationId = created.id;
      }

      if (!conversationId || cancelled) return;

      // 2) Self participant — REQUIRED before any send (RLS). Surface failure to user.
      const { error: selfPartErr } = await (supabase
        .from("conversation_participants" as any)
        .upsert(
          {
            conversation_id: conversationId,
            user_id: myUuid,
            role: "member",
            last_read_at: new Date().toISOString(),
          } as any,
          { onConflict: "conversation_id,user_id" }
        )) as any;
      if (selfPartErr) {
        console.error("CSC self participant upsert failed:", selfPartErr);
        toast.error("Could not initialize your message thread. Please refresh and try again.");
        setCscInitFailed(true);
        return;
      }

      // 3) Add primary CSC as participant (best-effort).
      const { data: cscRow } = await (supabase
        .from("tenant_csc_assignments" as any)
        .select("csc_user_id")
        .eq("tenant_id", tenantId)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle()) as any;

      if (cscRow?.csc_user_id) {
        const { data: cscUser } = await (supabase
          .from("users")
          .select("avatar_url, first_name, last_name")
          .eq("user_uuid", cscRow.csc_user_id)
          .maybeSingle()) as any;
        if (!cancelled && cscUser) setCscProfile(cscUser);

        const { error: cscPartErr } = await (supabase
          .from("conversation_participants" as any)
          .upsert(
            {
              conversation_id: conversationId,
              user_id: cscRow.csc_user_id,
              role: "csc",
            } as any,
            { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
          )) as any;
        if (cscPartErr) {
          console.warn("CSC participant upsert non-fatal failure:", cscPartErr);
        }
      }

      if (cancelled) return;
      setThreadId(conversationId);

      // 4) Fetch messages.
      const { data: rows } = await (supabase
        .from("tenant_messages" as any)
        .select("id, sender_user_uuid, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })) as any;

      if (cancelled) return;

      const mapped: Message[] = (rows || []).map((r: any) => ({
        id: r.id,
        role: r.sender_user_uuid === myUuid ? "user" : "staff",
        content: r.body,
        created_at: r.created_at,
        sender_user_uuid: r.sender_user_uuid,
      }));
      setMessages(mapped);

      // Resolve staff sender identities (per-message).
      const staffIds = Array.from(new Set<string>(
        (rows || [])
          .map((r: any) => r.sender_user_uuid)
          .filter((u: string) => u && u !== myUuid)
      ));
      if (staffIds.length > 0) {
        const { data: staffUsers } = await (supabase
          .from("users")
          .select("user_uuid, first_name, last_name, avatar_url")
          .in("user_uuid", staffIds)) as any;
        if (!cancelled && staffUsers) {
          const nm = new Map<string, string>();
          const am = new Map<string, string | null>();
          staffUsers.forEach((u: any) => {
            const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Vivacity Team";
            nm.set(u.user_uuid, name);
            am.set(u.user_uuid, u.avatar_url ?? null);
          });
          setStaffNameMap(nm);
          setStaffAvatarMap(am);
        }
      }

      // 5) Fire-and-forget read audit.
      if (mapped.length > 0) {
        void (supabase
          .from("audit_events")
          .insert({
            entity: "tenant_message_read",
            entity_id: conversationId,
            action: "messages_read",
            user_id: myUuid,
            details: {
              conversation_id: conversationId,
              tenant_id: tenantId,
              message_count: mapped.length,
            },
          } as any) as any).then(() => {}, () => {});
      }
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.user_uuid, profile?.tenant_id, channel]);

  // ---------- Realtime (CSC only) ----------
  useEffect(() => {
    if (channel !== "csc" || !threadId) return;
    const myUuid = profile?.user_uuid;
    const ch = supabase
      .channel(`csc-tm:${threadId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "tenant_messages",
          filter: `conversation_id=eq.${threadId}`,
        },
        (payload: any) => {
          const r = payload.new;
          if (!r) return;
          setMessages(prev => {
            if (prev.some(m => m.id === r.id)) return prev;
            return [
              ...prev,
              {
                id: r.id,
                role: r.sender_user_uuid === myUuid ? "user" : "staff",
                content: r.body,
                created_at: r.created_at,
                sender_user_uuid: r.sender_user_uuid,
              },
            ];
          });
          // Backfill staff identity if unseen.
          if (r.sender_user_uuid && r.sender_user_uuid !== myUuid && !staffAvatarMap.has(r.sender_user_uuid)) {
            void (async () => {
              const { data: u } = await (supabase
                .from("users")
                .select("user_uuid, first_name, last_name, avatar_url")
                .eq("user_uuid", r.sender_user_uuid)
                .maybeSingle()) as any;
              if (!u) return;
              const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Vivacity Team";
              setStaffNameMap(prev => new Map(prev).set(u.user_uuid, name));
              setStaffAvatarMap(prev => new Map(prev).set(u.user_uuid, u.avatar_url ?? null));
            })();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channel, threadId, profile?.user_uuid]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || !profile) return;
    if (channel === "csc" && cscInitFailed) {
      toast.error("Message thread not initialized. Please refresh and try again.");
      return;
    }
    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    try {
      if (channel === "csc") {
        await sendCsc(userMsg);
      } else {
        await sendSupport(userMsg);
      }
    } catch (err: any) {
      console.error("Message send error:", err);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  async function sendSupport(userMsg: string) {
    let currentThreadId = threadId;

    if (!currentThreadId) {
      const { data: newThread, error: threadError } = await supabase
        .from("help_threads")
        .insert({
          tenant_id: profile!.tenant_id,
          user_id: profile!.user_uuid,
          channel: "support",
          status: "open",
        })
        .select("id")
        .single();

      if (threadError) throw threadError;
      currentThreadId = newThread.id;
      setThreadId(currentThreadId);
    }

    const { data: msg, error: msgError } = await supabase
      .from("help_messages")
      .insert({
        thread_id: currentThreadId,
        sender_id: profile!.user_uuid,
        role: "user",
        content: userMsg,
      })
      .select("id, role, content, created_at")
      .single();

    if (msgError) throw msgError;

    setMessages(prev => [...prev, msg as Message]);

    await supabase
      .from("help_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentThreadId);
  }

  async function sendCsc(userMsg: string) {
    const conversationId = threadId;
    if (!conversationId) {
      toast.error("Message thread not ready. Please try again.");
      return;
    }
    const myUuid = profile!.user_uuid;
    const tenantId = profile!.tenant_id;

    const { data: inserted, error } = await (supabase
      .from("tenant_messages" as any)
      .insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        sender_user_uuid: myUuid,
        sender_type: "client",
        body: userMsg,
      } as any)
      .select("id, sender_user_uuid, body, created_at")
      .single()) as any;
    if (error) throw error;

    if (inserted) {
      setMessages(prev => {
        if (prev.some(m => m.id === inserted.id)) return prev;
        return [
          ...prev,
          {
            id: inserted.id,
            role: "user",
            content: inserted.body,
            created_at: inserted.created_at,
            sender_user_uuid: inserted.sender_user_uuid,
          },
        ];
      });
    }

    // Touch own last_read_at
    await (supabase
      .from("conversation_participants" as any)
      .update({ last_read_at: new Date().toISOString() } as any)
      .eq("conversation_id", conversationId)
      .eq("user_id", myUuid)) as any;
  }

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
            {messages.map((msg) => {
              const staffName = msg.sender_user_uuid ? staffNameMap.get(msg.sender_user_uuid) : undefined;
              const staffAvatar = msg.sender_user_uuid ? staffAvatarMap.get(msg.sender_user_uuid) : undefined;
              const displayName = staffName || "Vivacity Team";
              const initials = staffName
                ? staffName.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase()
                : "VT";
              const firstName = staffName ? staffName.split(/\s+/)[0] : "Vivacity Team";
              return (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "staff" && (
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarImage src={staffAvatar ?? undefined} />
                      <AvatarFallback className="bg-secondary/10 text-secondary text-[10px]">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex flex-col max-w-[80%]">
                    {msg.role === "staff" && (
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">{firstName}</p>
                    )}
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              );
            })}
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
            disabled={loading || (channel === "csc" && cscInitFailed)}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading || (channel === "csc" && cscInitFailed)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
