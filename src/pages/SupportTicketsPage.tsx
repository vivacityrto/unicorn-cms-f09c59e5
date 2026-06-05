import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
  Send,
  LifeBuoy,
  Clock,
  User as UserIcon,
  Paperclip,
  Loader2,
  X,
} from "lucide-react";
import { format } from "date-fns";

type Thread = {
  id: string;
  tenant_id: number;
  user_id: string;
  status: string;
  subject: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
  user_name?: string;
  tenant_name?: string;
  preview?: string;
  has_staff_reply?: boolean;
};

type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  role: string;
  content: string;
  metadata: any;
  created_at: string;
};

export default function SupportTicketsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async (): Promise<Thread[]> => {
      const { data: rows, error } = await supabase
        .from("help_threads")
        .select("*")
        .eq("channel", "support")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      if (!rows?.length) return [];

      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))];
      const threadIds = rows.map((r) => r.id);

      const [{ data: users }, { data: tenants }, { data: msgs }] = await Promise.all([
        supabase.from("users").select("user_uuid, first_name, last_name, email").in("user_uuid", userIds),
        supabase.from("tenants").select("id, name").in("id", tenantIds),
        supabase
          .from("help_messages")
          .select("thread_id, role, content, created_at")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true }),
      ]);

      const userMap = new Map((users || []).map((u: any) => [u.user_uuid, u]));
      const tenantMap = new Map((tenants || []).map((t: any) => [t.id, t.name]));
      const previewMap = new Map<string, string>();
      const staffSet = new Set<string>();
      (msgs || []).forEach((m: any) => {
        if (!previewMap.has(m.thread_id)) previewMap.set(m.thread_id, m.content);
        if (m.role === "staff") staffSet.add(m.thread_id);
      });

      return rows.map((r: any) => {
        const u: any = userMap.get(r.user_id);
        return {
          ...r,
          user_name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.email || "Unknown user",
          tenant_name: tenantMap.get(r.tenant_id) || `Tenant #${r.tenant_id}`,
          preview: previewMap.get(r.id) || "",
          has_staff_reply: staffSet.has(r.id),
        };
      });
    },
    refetchInterval: 60_000,
  });

  const sortedThreads = useMemo(() => {
    const rank = (t: Thread) => {
      if (t.status === "open" && !t.has_staff_reply) return 0;
      if (t.status === "open" && t.has_staff_reply) return 1;
      return 2;
    };
    return [...threads].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [threads]);

  const selected = sortedThreads.find((t) => t.id === selectedId) || null;

  const { data: messages = [] } = useQuery({
    queryKey: ["support-tickets", "messages", selectedId],
    queryFn: async (): Promise<Message[]> => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("help_messages")
        .select("*")
        .eq("thread_id", selectedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!selectedId,
  });

  // Realtime: refresh when messages change for selected thread
  useEffect(() => {
    if (!selectedId) return;
    const ch = supabase
      .channel(`support-thread-${selectedId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "help_messages", filter: `thread_id=eq.${selectedId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["support-tickets", "messages", selectedId] });
          qc.invalidateQueries({ queryKey: ["support-tickets"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedId, qc]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setReply("");
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMetaOpen(false);
    if (window.innerWidth < 768) setMobileOpen(true);
  };

  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (!threadParam || isLoading || threads.length === 0) return;
    if (selectedId === threadParam) {
      setSearchParams({}, { replace: true });
      return;
    }
    const match = threads.find((t) => t.id === threadParam);
    if (match) {
      handleSelect(match.id);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, threads, isLoading, selectedId, setSearchParams, handleSelect]);

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const accepted: File[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} exceeds 5 MB limit`);
        continue;
      }
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf";
      if (!isImage && !isPdf) {
        toast.error(`${f.name}: only images and PDFs allowed`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length) setSelectedFiles((prev) => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSendReply = async () => {
    if (!selected) return;
    const hasContent = reply.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;
    if (!hasContent && !hasFiles) return;
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not authenticated");

      let attachments: { url: string; name: string; type: string }[] = [];
      if (hasFiles) {
        setUploading(true);
        try {
          for (const file of selectedFiles) {
            const path = `${selected.tenant_id}/${selected.id}/${crypto.randomUUID()}-${file.name}`;
            const { error: upErr } = await supabase.storage
              .from("support-attachments")
              .upload(path, file, { contentType: file.type });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage
              .from("support-attachments")
              .getPublicUrl(path);
            attachments.push({ url: pub.publicUrl, name: file.name, type: file.type });
          }
        } finally {
          setUploading(false);
        }
      }

      const { error: msgErr } = await supabase.from("help_messages").insert({
        thread_id: selected.id,
        sender_id: auth.user.id,
        role: "staff",
        content: reply.trim(),
        metadata: attachments.length ? { attachments } : {},
      });
      if (msgErr) throw msgErr;

      await supabase
        .from("help_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selected.id);

      setReply("");
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-tickets", "messages", selected.id] });
      qc.invalidateQueries({ queryKey: ["support-tickets-badge"] });
      toast.success("Reply sent");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selected) return;
    const newStatus = selected.status === "resolved" ? "open" : "resolved";
    const { error } = await supabase
      .from("help_threads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", selected.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["support-tickets"] });
    qc.invalidateQueries({ queryKey: ["support-tickets-badge"] });
    toast.success(newStatus === "resolved" ? "Marked as resolved" : "Reopened");
  };

  const renderDetail = () => {
    if (!selected) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
          <LifeBuoy className="w-12 h-12 mb-3 opacity-40" />
          <p>Select a ticket to view the conversation.</p>
        </div>
      );
    }
    const meta = (selected.metadata || {}) as Record<string, any>;
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold truncate">
                {selected.subject || "Support request"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selected.user_name} · {selected.tenant_name}
              </p>
              <p className="text-xs text-muted-foreground">
                Opened {format(new Date(selected.created_at), "dd/MM/yyyy HH:mm")}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={selected.status === "resolved" ? "secondary" : "default"}>
                {selected.status}
              </Badge>
              {!selected.has_staff_reply && selected.status === "open" && (
                <Badge variant="destructive" className="text-[10px]">unanswered</Badge>
              )}
            </div>
          </div>

          {Object.keys(meta).length > 0 && (
            <Collapsible open={metaOpen} onOpenChange={setMetaOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {metaOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Diagnostic info
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
                  {Object.entries(meta).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="font-medium text-muted-foreground min-w-[80px]">{k}:</span>
                      <span className="break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="space-y-3">
            {messages.map((m) => {
              const isStaff = m.role === "staff";
              const attachments = (m.metadata as any)?.attachments as any[] | undefined;
              return (
                <div
                  key={m.id}
                  className={`flex ${isStaff ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isStaff
                        ? "bg-purple-100 text-purple-900"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content && (
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    )}
                    {attachments && attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {attachments.map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                          >
                            {a.type?.startsWith("image/") ? (
                              <img
                                src={a.url}
                                alt={a.name || "attachment"}
                                className="max-h-32 rounded border border-border/50"
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border/50 bg-background/50 text-xs underline">
                                <Paperclip className="w-3 h-3" />
                                {a.name || "attachment"}
                              </span>
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className={`mt-1 text-[10px] opacity-70 flex items-center gap-1`}>
                      <Clock className="w-3 h-3" />
                      {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}
                    </div>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">No messages yet.</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Reply box */}
        <div className="p-3 space-y-2 bg-background">
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedFiles.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs"
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={sending}
                    className="hover:text-destructive"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={handleFilesPicked}
          />
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type a reply..."
            rows={3}
            disabled={sending}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                aria-label="Attach files"
                className="h-9 w-9"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleStatus}
              >
                {selected.status === "resolved" ? (
                  <>
                    <RotateCcw className="w-4 h-4 mr-1" /> Reopen
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Resolved
                  </>
                )}
              </Button>
            </div>
            <Button
              size="sm"
              onClick={handleSendReply}
              disabled={sending || uploading || (!reply.trim() && selectedFiles.length === 0)}
            >
              {sending || uploading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              Send Reply
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-160px)] flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <LifeBuoy className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-semibold">Support Tickets</h1>
      </div>

      <div className="flex-1 grid md:grid-cols-[360px_1fr] gap-4 min-h-0">
        {/* List */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
            {sortedThreads.length} ticket{sortedThreads.length === 1 ? "" : "s"}
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : sortedThreads.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No support tickets yet.</div>
            ) : (
              <ul className="divide-y">
                {sortedThreads.map((t) => {
                  const isActive = t.id === selectedId;
                  const unanswered = t.status === "open" && !t.has_staff_reply;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => handleSelect(t.id)}
                        className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                          isActive ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium truncate flex-1 flex items-center gap-1">
                            <UserIcon className="w-3 h-3 text-muted-foreground" />
                            {t.user_name}
                          </span>
                          {unanswered && (
                            <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{t.tenant_name}</p>
                        <p className="text-xs text-foreground/80 truncate mt-0.5">
                          {t.preview || t.subject || "(no preview)"}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <Badge
                            variant={t.status === "resolved" ? "secondary" : "default"}
                            className="text-[10px] py-0 h-4"
                          >
                            {t.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(t.updated_at), "dd/MM/yyyy")}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </Card>

        {/* Detail (desktop) */}
        <Card className="hidden md:flex flex-col min-h-0 overflow-hidden">
          {renderDetail()}
        </Card>
      </div>

      {/* Detail (mobile) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <div className="h-full">{renderDetail()}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
