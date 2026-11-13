import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, User, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ClientMessageBox } from "@/components/client-portal/support-tickets/ClientMessageBox";
import { useHelpCenter } from "./HelpCenterContext";

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

const channelConfig: Record<"csc", {
  title: string;
  subtitle: string;
  emptyIcon: typeof MessageCircle;
  emptyTitle: string;
  emptyDescription: string;
  placeholder: string;
}> = {
  csc: {
    title: "Message your CSC",
    subtitle: "If you still need help, message your consultant. We reply in Unicorn.",
    emptyIcon: MessageCircle,
    emptyTitle: "Message your consultant",
    emptyDescription: "Send a message. We reply in Unicorn.",
    placeholder: "Type a message to your consultant...",
  },
};

function CscMessageTab({ channel }: { channel: "csc" }) {
  const { profile } = useAuth();
  const config = channelConfig[channel];
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // tenant_conversations.id for the CSC conversation
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(channel === "csc");
  // CSC branch: blocks send when participant upsert failed.
  const [cscInitFailed, setCscInitFailed] = useState(false);
  const [cscProfile, setCscProfile] = useState<{ avatar_url: string | null; first_name: string | null; last_name: string | null } | null>(null);
  const [staffNameMap, setStaffNameMap] = useState<Map<string, string>>(new Map());
  const [staffAvatarMap, setStaffAvatarMap] = useState<Map<string, string | null>>(new Map());
  const staffAvatarMapRef = useRef(staffAvatarMap);
  staffAvatarMapRef.current = staffAvatarMap;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profile?.user_uuid) return;

    let cancelled = false;

    (async () => {
      if (channel !== "csc") return;
      setLoadingHistory(true);
      setMessages([]);
      setThreadId(null);
      setCscInitFailed(false);
      setCscProfile(null);

      await loadCscThread();

      if (!cancelled) setLoadingHistory(false);
    })();

    async function loadCscThread() {
      const tenantId = profile!.tenant_id;
      const myUuid = profile!.user_uuid;
      if (!tenantId || !myUuid) return;

      // 1) Resolve existing open CSC conversation, or create one.
      let conversationId: string | null = null;
      const { data: existing } = await supabase
        .from("tenant_conversations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("topic", "csc")
        .eq("created_by_user_uuid", myUuid)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        conversationId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("tenant_conversations")
          .insert({
            tenant_id: tenantId,
            topic: "csc",
            type: "direct",
            subject: "Message your CSC",
            created_by_user_uuid: myUuid,
            status: "open",
          })
          .select("id")
          .single();
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
      const { error: selfPartErr } = await supabase
        .from("conversation_participants")
        .upsert(
          {
            conversation_id: conversationId,
            user_id: myUuid,
            role: "member",
            last_read_at: new Date().toISOString(),
          },
          { onConflict: "conversation_id,user_id" }
        );
      if (selfPartErr) {
        console.error("CSC self participant upsert failed:", selfPartErr);
        toast.error("Could not initialize your message thread. Please refresh and try again.");
        setCscInitFailed(true);
        return;
      }

      // 3) Add primary CSC as participant (best-effort).
      const { data: cscRow } = await supabase
        .from("tenant_csc_assignments")
        .select("csc_user_id")
        .eq("tenant_id", tenantId)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();

      if (cscRow?.csc_user_id) {
        const { data: cscUser } = await supabase
          .from("users")
          .select("avatar_url, first_name, last_name")
          .eq("user_uuid", cscRow.csc_user_id)
          .maybeSingle();
        if (!cancelled && cscUser) setCscProfile(cscUser);

        const { error: cscPartErr } = await supabase
          .from("conversation_participants")
          .upsert(
            {
              conversation_id: conversationId,
              user_id: cscRow.csc_user_id,
              role: "csc",
            },
            { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
          );
        if (cscPartErr) {
          console.warn("CSC participant upsert non-fatal failure:", cscPartErr);
        }
      }

      if (cancelled) return;
      setThreadId(conversationId);

      // 4) Fetch messages.
      const { data: rows } = await supabase
        .from("tenant_messages")
        .select("id, sender_user_uuid, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      const mapped: Message[] = (rows || []).map((r) => ({
        id: r.id,
        role: r.sender_user_uuid === myUuid ? "user" : "staff",
        content: r.body,
        created_at: r.created_at,
        sender_user_uuid: r.sender_user_uuid,
      }));
      setMessages(mapped);

      // Resolve staff sender identities (per-message).
      const staffIds = Array.from(new Set(
        (rows || [])
          .map((r) => r.sender_user_uuid)
          .filter((u) => u && u !== myUuid)
      ));
      if (staffIds.length > 0) {
        const { data: staffUsers } = await supabase
          .from("users")
          .select("user_uuid, first_name, last_name, avatar_url")
          .in("user_uuid", staffIds);
        if (!cancelled && staffUsers) {
          const nm = new Map<string, string>();
          const am = new Map<string, string | null>();
          staffUsers.forEach((u) => {
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
        void supabase
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
          })
          .then(() => {}, () => {});
      }
    }

    return () => {
      cancelled = true;
    };
  }, [profile, channel]);

  // ---------- Realtime (CSC only) ----------
  useEffect(() => {
    if (channel !== "csc" || !threadId) return;
    const myUuid = profile?.user_uuid;
    const ch = supabase
      .channel(`csc-tm:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tenant_messages",
          filter: `conversation_id=eq.${threadId}`,
        },
        (payload: RealtimePostgresChangesPayload<Tables<"tenant_messages">>) => {
          const r = payload.new as Partial<Tables<"tenant_messages">>;
          if (!r.id) return;
          setMessages(prev => {
            if (prev.some(m => m.id === r.id)) return prev;
            return [
              ...prev,
              {
                id: r.id!,
                role: r.sender_user_uuid === myUuid ? "user" : "staff",
                content: r.body!,
                created_at: r.created_at!,
                sender_user_uuid: r.sender_user_uuid,
              },
            ];
          });
          // Backfill staff identity if unseen.
          if (r.sender_user_uuid && r.sender_user_uuid !== myUuid && !staffAvatarMapRef.current.has(r.sender_user_uuid)) {
            void (async () => {
              const { data: u } = await supabase
                .from("users")
                .select("user_uuid, first_name, last_name, avatar_url")
                .eq("user_uuid", r.sender_user_uuid!)
                .maybeSingle();
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
    if (loading || !profile) return;
    const hasText = input.trim().length > 0;
    if (!hasText) return;
    if (channel === "csc" && cscInitFailed) {
      toast.error("Message thread not initialized. Please refresh and try again.");
      return;
    }
    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    try {
      await sendCsc(userMsg);
    } catch (err) {
      console.error("Message send error:", err);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  async function sendCsc(userMsg: string) {
    const conversationId = threadId;
    if (!conversationId) {
      toast.error("Message thread not ready. Please try again.");
      return;
    }
    const myUuid = profile!.user_uuid;
    const tenantId = profile!.tenant_id;

    const { data: inserted, error } = await supabase
      .from("tenant_messages")
      .insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        sender_user_uuid: myUuid,
        sender_type: "client",
        body: userMsg,
      })
      .select("id, sender_user_uuid, body, created_at")
      .single();
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
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", myUuid);
  }

  const EmptyIcon = config.emptyIcon;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border space-y-1">
        <p className="text-sm text-muted-foreground">{config.subtitle}</p>
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
      <div className="px-4 py-3 border-t border-border space-y-2">
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
            disabled={loading || cscInitFailed}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || cscInitFailed || !input.trim()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>

    </div>
  );
}

/**
 * Support is a plain message box. The message becomes a ticket straight away
 * (create_support_ticket) and staff triage it in the Tickets list; nothing is
 * written to help_threads or help_messages from here any more.
 */
function SupportMessageTab() {
  const { closeHelpCenter } = useHelpCenter();
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border space-y-1">
        <p className="text-sm text-muted-foreground">For technical issues and access help. Send a message and we will track it for you.</p>
        <p className="text-xs text-muted-foreground">
          Or email: <span className="text-foreground">support@vivacity.com.au</span>
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ClientMessageBox onViewTickets={closeHelpCenter} />
      </div>
    </div>
  );
}

export function MessageTab({ channel }: MessageTabProps) {
  return channel === "support" ? <SupportMessageTab /> : <CscMessageTab channel="csc" />;
}
