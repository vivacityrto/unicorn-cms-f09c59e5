import { useState, useEffect, useRef } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Loader2, Send, CheckCircle2, RotateCcw, X, Building2, User, MessageSquare,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useAdminHelpThreadMessages } from './useAdminHelpThreadMessages';
import type { AdminHelpThreadRow } from './useAdminHelpThreads';

interface Props {
  thread: AdminHelpThreadRow;
  onClose: () => void;
}

function initialsOf(name: string | null | undefined, fallback = '?') {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || fallback;
}

export function AdminHelpThreadDetail({ thread, onClose }: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const { data: messages = [], isLoading } = useAdminHelpThreadMessages(thread.id);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-help-threads'] });
    queryClient.invalidateQueries({ queryKey: ['admin-help-thread-messages', thread.id] });
    queryClient.invalidateQueries({ queryKey: ['support-tickets-badge'] });
  };

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const content = reply.trim();
      if (!content) throw new Error('Reply is empty');

      const { error: msgErr } = await supabase.from('help_messages').insert({
        thread_id: thread.id,
        sender_id: user.id,
        role: 'staff',
        content,
      });
      if (msgErr) throw msgErr;

      const { error: threadErr } = await supabase
        .from('help_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', thread.id);
      if (threadErr) throw threadErr;
    },
    onSuccess: () => {
      setReply('');
      invalidate();
      toast({ title: 'Reply sent' });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to send reply',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: 'resolved' | 'open') => {
      const { error } = await supabase
        .from('help_threads')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', thread.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidate();
      toast({ title: status === 'resolved' ? 'Marked as resolved' : 'Reopened' });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to update status',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const isResolved = thread.status === 'resolved' || thread.status === 'closed';

  // Auto-scroll to bottom on load / new messages
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thread.id]);

  const staffFullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email || 'You';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && reply.trim() && !sendReply.isPending) {
      e.preventDefault();
      sendReply.mutate();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full',
                  thread.status === 'open'
                    ? 'bg-blue-100 text-blue-700'
                    : thread.status === 'resolved'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-600',
                )}
              >
                {thread.status ?? 'open'}
              </span>
              {thread.unanswered && thread.status === 'open' && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                  Unanswered
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                <MessageSquare className="h-3 w-3" />
                {messages.length || thread.message_count} message{(messages.length || thread.message_count) === 1 ? '' : 's'}
              </span>
            </div>
            <h2 className="mt-2 text-base font-semibold text-gray-900 leading-snug">
              {thread.subject || thread.first_user_message || '(No subject)'}
            </h2>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {thread.tenant?.name ?? '—'}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {thread.reporter?.full_name ?? thread.reporter?.email ?? 'Unknown'}
              </span>
              <span>· Opened {format(new Date(thread.created_at), 'dd MMM yyyy, HH:mm')}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 flex-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-gray-50">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No messages yet.</p>
        ) : (
          messages.map((m, idx) => {
            const isStaff = m.role === 'staff';
            const isSystem = m.role !== 'staff' && m.role !== 'user';
            const prev = messages[idx - 1];
            const sameSender = prev && prev.role === m.role && prev.sender_id === m.sender_id;
            const displayName = isStaff
              ? m.sender_name || 'Staff'
              : isSystem
              ? m.role
              : thread.reporter?.full_name ?? thread.reporter?.email ?? 'Client';
            return (
              <div
                key={m.id}
                className={cn(
                  'flex gap-2',
                  isStaff ? 'justify-end' : 'justify-start',
                  sameSender ? '-mt-2' : '',
                )}
              >
                {!isStaff && (
                  <div
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-none',
                      sameSender ? 'invisible' : '',
                      isSystem ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-700',
                    )}
                  >
                    {initialsOf(displayName)}
                  </div>
                )}
                <div className={cn('max-w-[78%] flex flex-col', isStaff ? 'items-end' : 'items-start')}>
                  {!sameSender && (
                    <div className={cn('text-[10px] text-gray-500 mb-0.5 px-1', isStaff ? 'text-right' : '')}>
                      <span className="font-semibold">{displayName}</span>
                      <span className="text-gray-400"> · {format(new Date(m.created_at), 'dd MMM, HH:mm')}</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
                      isStaff
                        ? 'bg-[#7130A0] text-white rounded-br-sm'
                        : isSystem
                        ? 'bg-amber-50 text-amber-900 border border-amber-200 rounded-bl-sm'
                        : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm',
                    )}
                  >
                    {m.content}
                  </div>
                </div>
                {isStaff && (
                  <div
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-none bg-[#7130A0]/10 text-[#7130A0]',
                      sameSender ? 'invisible' : '',
                    )}
                  >
                    {initialsOf(displayName)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 p-3 space-y-2 bg-white">
        {isResolved && (
          <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5">
            This thread is {thread.status}. Replying will not automatically reopen it.
          </div>
        )}
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Reply as ${staffFullName}…  (⌘ + Enter to send)`}
          className="min-h-[80px] text-sm resize-none"
          disabled={sendReply.isPending}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!isResolved ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus.mutate('resolved')}
                disabled={setStatus.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Mark as resolved
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus.mutate('open')}
                disabled={setStatus.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Reopen
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {thread.last_message_at && (
              <span className="text-[11px] text-gray-400">
                Last activity {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}
              </span>
            )}
            <Button
              onClick={() => sendReply.mutate()}
              disabled={sendReply.isPending || !reply.trim()}
              className="bg-[#7130A0] hover:bg-[#5d2683] text-white"
              size="sm"
            >
              {sendReply.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Send reply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
