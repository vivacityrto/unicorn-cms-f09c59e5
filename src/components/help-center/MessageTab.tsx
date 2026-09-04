import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, User, Headphones, MessageCircle, Paperclip, X, CheckCircle2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
  const [loadingHistory, setLoadingHistory] = useState(channel === "csc");
  // CSC branch: blocks send when participant upsert failed.
  const [cscInitFailed, setCscInitFailed] = useState(false);
  const [cscProfile, setCscProfile] = useState<{ avatar_url: string | null; first_name: string | null; last_name: string | null } | null>(null);
  const [staffNameMap, setStaffNameMap] = useState<Map<string, string>>(new Map());
  const [staffAvatarMap, setStaffAvatarMap] = useState<Map<string, string | null>>(new Map());
  const staffAvatarMapRef = useRef(staffAvatarMap);
  staffAvatarMapRef.current = staffAvatarMap;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [subject, setSubject] = useState("");

  useEffect(() => {
    return () => {
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    };
  }, [attachmentPreview]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Only image files are allowed.");
      return;
    }
    if (f.size > MAX_ATTACHMENT_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachment(f);
    setAttachmentPreview(URL.createObjectURL(f));
  };

  const clearAttachment = () => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachment(null);
    setAttachmentPreview(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = e.clipboardData.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
    setAttachment(file);
    setAttachmentPreview(URL.createObjectURL(file));
  };

  // ---------- Load history ----------
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
  }, [profile, channel]);

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
          if (r.sender_user_uuid && r.sender_user_uuid !== myUuid && !staffAvatarMapRef.current.has(r.sender_user_uuid)) {
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
    if (loading || !profile) return;
    const hasText = input.trim().length > 0;
    const hasAttachment = channel === "support" && !!attachment;
    if (!hasText && !hasAttachment) return;
    if (channel === "csc" && !hasText) return;
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
    const diagnosticMeta = {
      page_path: window.location.pathname,
      browser: getBrowserName(navigator.userAgent),
      os: getOSName(navigator.userAgent),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      ...(subject.trim() ? { subject: subject.trim() } : {}),
    };

    const { data: newThread, error: threadError } = await supabase
      .from("help_threads")
      .insert({
        tenant_id: profile!.tenant_id,
        user_id: profile!.user_uuid,
        channel: "support",
        status: "open",
        subject: subject.trim() || null,
        metadata: diagnosticMeta,
      } as any)
      .select("id")
      .single();

    if (threadError) throw threadError;
    const currentThreadId = newThread.id;

    let messageMetadata: Record<string, any> | null = null;
    const fileToUpload = attachment;
    if (fileToUpload) {
      const path = `${profile!.tenant_id}/${currentThreadId}/${crypto.randomUUID()}-${fileToUpload.name}`;
      const { error: upErr } = await supabase.storage
        .from("support-attachments")
        .upload(path, fileToUpload, { contentType: fileToUpload.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("support-attachments").getPublicUrl(path);
      messageMetadata = {
        attachments: [{ url: pub.publicUrl, name: fileToUpload.name, type: fileToUpload.type }],
      };
    }

    const { error: msgError } = await supabase
      .from("help_messages")
      .insert({
        thread_id: currentThreadId,
        sender_id: profile!.user_uuid,
        role: "user",
        content: userMsg || "(image attached)",
        ...(messageMetadata ? { metadata: messageMetadata } : {}),
      } as any);

    if (msgError) throw msgError;

    await supabase
      .from("help_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentThreadId);

    setSubmitted(true);
    setInput("");
    setSubject("");
    setThreadId(null);
    clearAttachment();
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

  if (channel === "support") {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border space-y-1">
          <p className="text-sm text-muted-foreground">{config.subtitle}</p>
          {config.fallback && (
            <p className="text-xs text-muted-foreground">
              Or email: <span className="text-foreground">{config.fallback}</span>
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {submitted ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 py-12">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div>
                <p className="font-medium text-secondary">Ticket submitted</p>
                <p className="text-sm text-muted-foreground mt-1">Our team will be in touch.</p>
              </div>
              <Button variant="outline" onClick={() => setSubmitted(false)}>
                Submit another ticket
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="space-y-3"
            >
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject (optional)"
                disabled={loading}
              />
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handlePaste}
                placeholder={config.placeholder}
                rows={4}
                disabled={loading}
              />
              {attachmentPreview && (
                <div className="relative inline-block">
                  <img
                    src={attachmentPreview}
                    alt="Attachment preview"
                    className="h-16 w-16 object-cover rounded border border-border"
                  />
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  aria-label="Attach image"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  disabled={loading || (!input.trim() && !attachment)}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Ticket
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

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
