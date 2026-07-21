import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Send, CheckCircle2, RotateCcw, X } from 'lucide-react';
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

export function AdminHelpThreadDetail({ thread, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const { data: messages = [], isLoading } = useAdminHelpThreadMessages(thread.id);

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

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
            <span>{thread.tenant?.name ?? '—'}</span>
            <span className="text-gray-300">·</span>
            <span className="capitalize">{thread.status ?? '—'}</span>
          </div>
          <h2 className="mt-1 text-base font-semibold text-gray-900 truncate">
            {thread.subject || thread.first_user_message || '(No subject)'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            From {thread.reporter?.full_name ?? thread.reporter?.email ?? 'Unknown'} · Opened{' '}
            {format(new Date(thread.created_at), 'dd MMM yyyy, HH:mm')}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const isStaff = m.role === 'staff';
            const isSystem = m.role !== 'staff' && m.role !== 'user';
            return (
              <div
                key={m.id}
                className={cn(
                  'flex flex-col gap-1',
                  isStaff ? 'items-end' : 'items-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                    isStaff
                      ? 'bg-[#7130A0] text-white'
                      : isSystem
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-white text-gray-900 border border-gray-200',
                  )}
                >
                  {m.content}
                </div>
                <div className="text-[10px] text-gray-500 px-1">
                  <span className="capitalize font-medium">
                    {isSystem ? m.role : isStaff ? 'Staff' : 'Client'}
                  </span>
                  {m.sender_name ? ` · ${m.sender_name}` : ''}
                  {' · '}
                  {format(new Date(m.created_at), 'dd MMM yyyy, HH:mm')}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-gray-200 p-4 space-y-3 bg-white">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type your reply to the client…"
          className="min-h-[90px] text-sm resize-none"
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
  );
}
