import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { MessageSquare, Plus, Send, Mail, MailOpen, Building2 } from "lucide-react";
import { format } from "date-fns";

interface Conversation {
  id: string;
  tenant_id: number;
  topic: string;
  type: string;
  subject: string | null;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  tenant_name?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
}

const TYPE_COLORS: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  package: "bg-primary/10 text-primary",
  task: "bg-accent/60 text-accent-foreground",
  rock: "bg-secondary text-secondary-foreground",
  broadcast: "bg-accent text-accent-foreground",
};

export default function TeamCommunicationsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [filterTenant, setFilterTenant] = useState<string>("all");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = profile?.user_uuid;

  // Fetch all conversations staff can see
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["team-conversations"],
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await (supabase
        .from("tenant_conversations" as any)
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })) as any;
      if (error) throw error;
      if (!data?.length) return [];

      // Fetch tenant names
      const tenantIds = [...new Set((data as any[]).map((c: any) => c.tenant_id))];
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds as number[]);

      const tenantMap = new Map<number, string>();
      (tenants || []).forEach((t: any) => tenantMap.set(t.id, t.name));

      return (data as any[]).map((c: any) => ({
        ...c,
        tenant_name: tenantMap.get(c.tenant_id) || `Tenant ${c.tenant_id}`,
      }));
    },
    enabled: !!currentUserId,
  });

  // Get unique tenants for filter
  const tenantOptions = [...new Map(conversations.map(c => [c.tenant_id, c.tenant_name || ""])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtered = filterTenant === "all"
    ? conversations
    : conversations.filter(c => String(c.tenant_id) === filterTenant);

  const selected = conversations.find(c => c.id === selectedId);

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["team-conversation-messages", selectedId],
    queryFn: async (): Promise<Message[]> => {
      if (!selectedId) return [];
      const { data, error } = await (supabase
        .from("messages" as any)
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true })) as any;
      if (error) throw error;
      if (!data?.length) return [];

      const senderIdSet = new Set<string>();
      (data as any[]).forEach((m: any) => senderIdSet.add(m.sender_id));
      const senderIds = Array.from(senderIdSet);

      const { data: users } = await (supabase
        .from("users")
        .select("user_uuid, first_name, last_name")
        .in("user_uuid", senderIds)) as any;

      const nameMap = new Map<string, string>();
      (users || []).forEach((u: any) => {
        nameMap.set(u.user_uuid, [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown");
      });

      return (data as any[]).map((m: any) => ({
        ...m,
        sender_name: nameMap.get(m.sender_id) || "Unknown",
      }));
    },
    enabled: !!selectedId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Send message
  const sendMessage = useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      if (!currentUserId) throw new Error("Not authenticated");
      const conv = conversations.find(c => c.id === conversationId);
      const { error } = await (supabase
        .from("messages" as any)
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          body,
          tenant_id: conv?.tenant_id,
        } as any)) as any;
      if (error) throw error;

      // Ensure staff is a participant
      await (supabase
        .from("conversation_participants" as any)
        .upsert({
          conversation_id: conversationId,
          user_id: currentUserId,
          role: "staff",
          last_read_at: new Date().toISOString(),
        } as any, { onConflict: "conversation_id,user_id" })) as any;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["team-conversation-messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["team-conversations"] });
    },
  });

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Communications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All client conversations across your portfolio.
          </p>
        </div>
        <Button onClick={() => setNewDialogOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Message
        </Button>
      </div>

      {/* Filter by tenant */}
      <div className="flex gap-2 items-center">
        <Select value={filterTenant} onValueChange={setFilterTenant}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {tenantOptions.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <p className="text-sm">No conversations found.</p>
              </div>
            ) : (
              <ScrollArea className="h-[60vh]">
                <div className="divide-y divide-border">
                  {filtered.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                        selectedId === conv.id ? "bg-muted/70" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{conv.tenant_name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 capitalize ml-auto ${TYPE_COLORS[conv.type] || ""}`}
                        >
                          {conv.type}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate text-foreground">
                        {conv.subject || conv.topic || "General"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.last_message_preview || "No messages yet"}
                      </p>
                      {conv.last_message_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {format(new Date(conv.last_message_at), "d MMM yyyy, HH:mm")}
                        </p>
                      )}
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
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <h2 className="font-semibold text-foreground truncate">
                    {selected.subject || selected.topic || "General"}
                  </h2>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_COLORS[selected.type] || ""}`}>
                    {selected.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{selected.tenant_name}</span>
                </div>

                <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: "calc(60vh - 140px)" }}>
                  <div className="p-4 space-y-3">
                    {messagesLoading ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-14 w-3/4 rounded-lg" />
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
                    ) : (
                      messages.map(msg => {
                        const isOwn = msg.sender_id === currentUserId;
                        return (
                          <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                            <div className={`rounded-lg px-3 py-2 max-w-[75%] ${isOwn ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"}`}>
                              {!isOwn && <p className="text-xs font-medium text-muted-foreground mb-0.5">{msg.sender_name}</p>}
                              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                              <p className="text-[11px] text-muted-foreground mt-1">{format(new Date(msg.created_at), "d MMM, HH:mm")}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-3 border-t border-border flex gap-2">
                  <Textarea
                    value={composerText}
                    onChange={e => setComposerText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message… (Enter to send)"
                    className="min-h-[40px] max-h-[120px] resize-none"
                    rows={1}
                  />
                  <Button size="icon" onClick={handleSend} disabled={!composerText.trim() || sendMessage.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
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

      {/* New Message to Tenant dialog */}
      <NewTeamMessageDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        currentUserId={currentUserId}
        onCreated={(id) => {
          setSelectedId(id);
          qc.invalidateQueries({ queryKey: ["team-conversations"] });
        }}
      />
    </div>
  );
}

function NewTeamMessageDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentUserId?: string;
  onCreated: (id: string) => void;
}) {
  const [tenantId, setTenantId] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch tenants for picker
  const { data: tenants = [] } = useQuery({
    queryKey: ["team-tenants-list"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name").order("name");
      return data || [];
    },
  });

  const handleSubmit = async () => {
    if (!tenantId || !message.trim() || !currentUserId) return;
    setSubmitting(true);
    try {
      const tid = parseInt(tenantId);
      // Create conversation
      const { data: conv, error } = await (supabase
        .from("tenant_conversations" as any)
        .insert({
          tenant_id: tid,
          topic: subject.trim() || "General",
          type,
          subject: subject.trim() || null,
          created_by_user_uuid: currentUserId,
          status: "open",
        } as any)
        .select("id")
        .single()) as any;
      if (error) throw error;

      // Add staff as participant
      await (supabase
        .from("conversation_participants" as any)
        .insert({
          conversation_id: conv.id,
          user_id: currentUserId,
          role: "staff",
          last_read_at: new Date().toISOString(),
        } as any)) as any;

      // Add tenant's primary contact as participant
      const { data: pc } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tid)
        .eq("primary_contact", true)
        .limit(1)
        .maybeSingle();

      if (pc?.user_id) {
        await (supabase
          .from("conversation_participants" as any)
          .insert({
            conversation_id: conv.id,
            user_id: pc.user_id,
            role: "client",
          } as any)) as any;
      }

      // Send first message
      await (supabase
        .from("messages" as any)
        .insert({
          conversation_id: conv.id,
          sender_id: currentUserId,
          body: message.trim(),
          tenant_id: tid,
        } as any)) as any;

      onCreated(conv.id);
      setTenantId("");
      setSubject("");
      setType("general");
      setMessage("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>New Message to Client</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Client</label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger><SelectValue placeholder="Select a client…" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Subject (optional)</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What is this about?" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Category</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="package">Package</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="rock">Rock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Message</label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message…" rows={4} />
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!tenantId || !message.trim() || submitting} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
