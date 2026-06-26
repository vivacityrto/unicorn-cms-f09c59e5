import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, MessageSquare, Plus, Send, Loader2, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { isVivacityStaffRole } from '@/lib/roles/vivacityRoles';

interface ClientMessagesTabProps {
  tenantId: number;
  clientName: string;
  onReadStateChange?: () => void;
}

interface Conversation {
  id: string;
  tenant_id: number;
  topic: string | null;
  type: string | null;
  status: string | null;
  subject: string | null;
  assigned_to_user_uuid: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  last_sender_type?: 'client' | 'staff' | null;
  unread?: boolean;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'client' | 'staff' | string;
  sender_user_uuid: string | null;
  body: string;
  created_at: string;
  sender_name?: string;
  attachments?: Array<{ id: string; filename: string; storage_path: string; mime_type: string | null }>;
}

type FilterValue = 'all' | 'unread' | 'from-client' | 'resolved';

const TYPE_STYLES: Record<string, string> = {
  csc: 'bg-[#7130A0]/10 text-[#7130A0] border-[#7130A0]/30',
  task: 'bg-blue-100 text-blue-700 border-blue-200',
  package: 'bg-[#23C0DD]/10 text-[#0D7A8F] border-[#23C0DD]/40',
  general: 'bg-muted text-muted-foreground border-border',
  direct: 'bg-muted text-muted-foreground border-border',
};

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  resolved: 'bg-slate-100 text-slate-600 border-slate-200',
  closed: 'bg-slate-700 text-white border-slate-700',
};

function typeLabel(t?: string | null) {
  if (!t) return 'General';
  if (t === 'csc') return 'CSC';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function ClientMessagesTab({ tenantId, clientName, onReadStateChange }: ClientMessagesTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    const { data: convos, error } = await (supabase as any)
      .from('tenant_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) {
      toast({ title: 'Failed to load conversations', description: error.message, variant: 'destructive' });
      setConversations([]);
      setLoading(false);
      return;
    }
    const list = (convos ?? []) as Conversation[];
    // Determine last sender per conversation to compute "unread" (last msg from client)
    if (list.length > 0) {
      const ids = list.map((c) => c.id);
      const { data: lastMsgs } = await (supabase as any)
        .from('tenant_messages')
        .select('conversation_id, sender_type, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });
      const seen = new Map<string, 'client' | 'staff'>();
      (lastMsgs ?? []).forEach((m: any) => {
        if (!seen.has(m.conversation_id)) seen.set(m.conversation_id, m.sender_type);
      });
      list.forEach((c) => {
        c.last_sender_type = seen.get(c.id) ?? null;
        c.unread = c.last_sender_type === 'client';
      });
    }
    setConversations(list);
    setLoading(false);
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Realtime: refresh list when new messages arrive for this tenant
  useEffect(() => {
    const channel = supabase
      .channel(`tenant-messages:${tenantId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'tenant_messages', filter: `tenant_id=eq.${tenantId}` },
        () => {
          loadConversations();
          if (selected) void loadMessages(selected.id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selected?.id]);

  const loadMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    const { data, error } = await (supabase as any)
      .from('tenant_messages')
      .select('id, conversation_id, sender_type, sender_user_uuid, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ title: 'Failed to load messages', description: error.message, variant: 'destructive' });
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    const rows = (data ?? []) as Message[];
    const senderIds = Array.from(new Set(rows.map((m) => m.sender_user_uuid).filter(Boolean))) as string[];
    if (senderIds.length > 0) {
      const { data: users } = await (supabase as any)
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', senderIds);
      const nameMap = new Map<string, string>();
      (users ?? []).forEach((u: any) =>
        nameMap.set(u.user_uuid, [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown'),
      );
      rows.forEach((m) => {
        m.sender_name = m.sender_user_uuid
          ? nameMap.get(m.sender_user_uuid) || (m.sender_type === 'staff' ? 'Vivacity Team' : clientName)
          : m.sender_type === 'staff'
            ? 'Vivacity Team'
            : clientName;
      });
    }
    // attachments
    const msgIds = rows.map((m) => m.id);
    if (msgIds.length > 0) {
      const { data: atts } = await (supabase as any)
        .from('tenant_message_attachments')
        .select('id, message_id, filename, storage_path, mime_type')
        .in('message_id', msgIds);
      const grouped = new Map<string, Message['attachments']>();
      (atts ?? []).forEach((a: any) => {
        const arr = grouped.get(a.message_id) ?? [];
        arr!.push(a);
        grouped.set(a.message_id, arr);
      });
      rows.forEach((m) => (m.attachments = grouped.get(m.id) ?? []));
    }
    setMessages(rows);
    setMessagesLoading(false);
  };

  const openConversation = async (c: Conversation) => {
    setSelected(c);
    setReply('');
    await loadMessages(c.id);
    // Mark conversation as read for this staff user
    if (currentUserId) {
      await (supabase as any)
        .from('conversation_participants')
        .upsert(
          {
            conversation_id: c.id,
            user_id: currentUserId,
            role: 'staff',
            last_read_at: new Date().toISOString(),
          },
          { onConflict: 'conversation_id,user_id' },
        );
      // Reflect locally and refresh parent badge
      setConversations((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, unread: false } : x)),
      );
      onReadStateChange?.();
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return conversations;
    if (filter === 'unread') return conversations.filter((c) => c.unread);
    if (filter === 'from-client')
      return conversations.filter((c) => c.last_sender_type === 'client');
    if (filter === 'resolved')
      return conversations.filter((c) => c.status === 'resolved' || c.status === 'closed');
    return conversations;
  }, [conversations, filter]);

  const sendReply = async () => {
    if (!selected || !reply.trim() || !currentUserId) return;
    setSending(true);
    const body = reply.trim();
    const { error } = await (supabase as any)
      .from('tenant_messages')
      .insert({
        conversation_id: selected.id,
        tenant_id: tenantId,
        sender_type: 'staff',
        sender_user_uuid: currentUserId,
        body,
      });
    if (error) {
      toast({ title: 'Failed to send', description: error.message, variant: 'destructive' });
      setSending(false);
      return;
    }
    await (supabase as any)
      .from('tenant_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 100),
      })
      .eq('id', selected.id);
    setReply('');
    setSending(false);
    await loadMessages(selected.id);
    await loadConversations();
  };

  if (selected) {
    return (
      <ConversationThread
        conversation={selected}
        messages={messages}
        loading={messagesLoading}
        onBack={() => {
          setSelected(null);
          setMessages([]);
        }}
        reply={reply}
        onReplyChange={setReply}
        onSend={sendReply}
        sending={sending}
        clientName={clientName}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['all', 'unread', 'from-client', 'resolved'] as FilterValue[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              className={filter === f ? 'bg-[#7130A0] hover:bg-[#7130A0]/90' : ''}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'from-client' ? 'From client' : 'Resolved'}
            </Button>
          ))}
        </div>
        <Sheet open={composeOpen} onOpenChange={setComposeOpen}>
          <SheetTrigger asChild>
            <Button className="bg-[#ED1878] hover:bg-[#ED1878]/90 text-white">
              <Plus className="h-4 w-4 mr-1.5" />
              New Message
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md">
            <ComposePanel
              tenantId={tenantId}
              currentUserId={currentUserId}
              onClose={() => setComposeOpen(false)}
              onCreated={async (newId) => {
                setComposeOpen(false);
                await loadConversations();
                const created = (conversations.find((c) => c.id === newId) ?? null) as Conversation | null;
                if (created) await openConversation(created);
                else {
                  const { data } = await (supabase as any)
                    .from('tenant_conversations')
                    .select('*')
                    .eq('id', newId)
                    .single();
                  if (data) await openConversation(data as Conversation);
                }
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="font-semibold">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                When this client sends a message through their portal, it will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => {
                const isUnread = !!c.unread;
                const dotColor =
                  c.last_sender_type === 'client'
                    ? 'bg-[#ED1878]'
                    : c.last_sender_type === 'staff'
                      ? 'bg-[#7130A0]'
                      : 'bg-muted-foreground/30';
                return (
                  <li key={c.id}>
                    <button
                      className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-start gap-3"
                      onClick={() => openConversation(c)}
                    >
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={isUnread ? 'font-bold' : 'font-medium'}>
                            {c.subject || '(No subject)'}
                          </span>
                          <Badge
                            variant="outline"
                            className={TYPE_STYLES[c.type || 'general'] || TYPE_STYLES.general}
                          >
                            {typeLabel(c.type)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={STATUS_STYLES[c.status || 'open'] || STATUS_STYLES.open}
                          >
                            {(c.status || 'open').charAt(0).toUpperCase() + (c.status || 'open').slice(1)}
                          </Badge>
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-[#ED1878]" aria-label="unread" />
                          )}
                        </div>
                        {c.last_message_preview && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {c.last_message_preview.slice(0, 80)}
                            {c.last_message_preview.length > 80 ? '…' : ''}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 mt-1">
                        {c.last_message_at
                          ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })
                          : 'No messages'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConversationThread({
  conversation,
  messages,
  loading,
  onBack,
  reply,
  onReplyChange,
  onSend,
  sending,
  clientName,
}: {
  conversation: Conversation;
  messages: Message[];
  loading: boolean;
  onBack: () => void;
  reply: string;
  onReplyChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  clientName: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to messages
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={TYPE_STYLES[conversation.type || 'general']}>
            {typeLabel(conversation.type)}
          </Badge>
          <Badge variant="outline" className={STATUS_STYLES[conversation.status || 'open']}>
            {(conversation.status || 'open').charAt(0).toUpperCase() + (conversation.status || 'open').slice(1)}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold mb-3">
            {conversation.subject || '(No subject)'}
          </h3>
          <ScrollArea className="h-[480px] pr-3">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No messages in this conversation.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const isStaff = m.sender_type === 'staff';
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={
                          isStaff
                            ? 'max-w-[78%] rounded-lg p-3 bg-[#7130A0] text-white'
                            : 'max-w-[78%] rounded-lg p-3 bg-muted/40 border-l-4 border-[#ED1878]'
                        }
                      >
                        <div
                          className={`flex items-center justify-between gap-3 text-xs mb-1 ${
                            isStaff ? 'text-white/80' : 'text-muted-foreground'
                          }`}
                        >
                          <span className="font-medium">
                            {m.sender_name || (isStaff ? 'Vivacity Team' : clientName)}
                            <span className="ml-1 opacity-75">· {isStaff ? 'Staff' : 'Client'}</span>
                          </span>
                          <span>
                            {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {m.attachments.map((a) => (
                              <AttachmentLink key={a.id} filename={a.filename} path={a.storage_path} isStaff={isStaff} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="mt-4 border-t pt-3 space-y-2">
            <Textarea
              value={reply}
              onChange={(e) => onReplyChange(e.target.value)}
              placeholder="Write a reply…"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                onClick={onSend}
                disabled={!reply.trim() || sending}
                className="bg-[#7130A0] hover:bg-[#7130A0]/90"
              >
                {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Send reply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AttachmentLink({ filename, path, isStaff }: { filename: string; path: string; isStaff: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage
        .from('tenant-message-attachments')
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) setUrl(data.signedUrl);
    })();
  }, [path]);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`text-xs underline ${isStaff ? 'text-white/90' : 'text-[#7130A0]'}`}
    >
      📎 {filename}
    </a>
  ) : (
    <span className="text-xs opacity-70">📎 {filename}</span>
  );
}

function ComposePanel({
  tenantId,
  currentUserId,
  onClose,
  onCreated,
}: {
  tenantId: number;
  currentUserId: string | null;
  onClose: () => void;
  onCreated: (conversationId: string) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [type, setType] = useState<'csc' | 'general' | 'task' | 'package'>('general');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!currentUserId) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast({ title: 'Subject and message are required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const now = new Date().toISOString();
    const { data: conv, error: convErr } = await (supabase as any)
      .from('tenant_conversations')
      .insert({
        tenant_id: tenantId,
        topic: type === 'csc' ? 'csc' : 'general',
        type,
        subject: subject.trim(),
        status: 'open',
        created_by_user_uuid: currentUserId,
        last_message_at: now,
        last_message_preview: body.trim().slice(0, 100),
      })
      .select('id')
      .single();
    if (convErr || !conv) {
      toast({ title: 'Failed to create conversation', description: convErr?.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    const conversationId = conv.id as string;

    // Add sender as participant (RLS requirement for inserting messages)
    await (supabase as any)
      .from('conversation_participants')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: currentUserId,
          role: 'staff',
          last_read_at: now,
        },
        { onConflict: 'conversation_id,user_id' },
      );

    const { error: msgErr } = await (supabase as any).from('tenant_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_type: 'staff',
      sender_user_uuid: currentUserId,
      body: body.trim(),
    });
    if (msgErr) {
      toast({ title: 'Conversation created but message failed', description: msgErr.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    toast({ title: 'Message sent' });
    setSubmitting(false);
    await onCreated(conversationId);
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>New Message</SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-sm font-medium">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>
        <div>
          <label className="text-sm font-medium">Type</label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csc">CSC</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="package">Package</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Message</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Write your message…" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-[#ED1878] hover:bg-[#ED1878]/90 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Send
          </Button>
        </div>
      </div>
    </>
  );
}
