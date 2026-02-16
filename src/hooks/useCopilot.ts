/**
 * useCopilot – Unicorn 2.0
 *
 * Hook for managing Advisory Copilot sessions and messages.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface CopilotMessage {
  id?: string;
  role: 'user' | 'copilot' | 'system';
  message_content: string;
  citations_json?: Array<{ source: string; type: string }>;
  created_at?: string;
}

export interface CopilotContext {
  tenant_id?: number | null;
  stage_instance_id?: string | null;
  template_id?: string | null;
  context_mode?: 'tenant' | 'stage' | 'template' | 'general' | 'executive';
}

export function useCopilot() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const startSession = useCallback(async (context: CopilotContext) => {
    setIsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('copilot-chat', {
        body: {
          action: 'start_session',
          ...context,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSessionId(data.session.id);
      setMessages([]);
      return data.session.id;
    } catch (err: any) {
      toast({
        title: 'Failed to start copilot',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsStarting(false);
    }
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!sessionId || isLoading) return;

    const userMsg: CopilotMessage = {
      role: 'user',
      message_content: message,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('copilot-chat', {
        body: {
          action: 'send_message',
          session_id: sessionId,
          message,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const copilotMsg: CopilotMessage = {
        role: 'copilot',
        message_content: data.response,
        citations_json: data.citations,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, copilotMsg]);
    } catch (err: any) {
      const status = err?.context?.status;
      if (status === 429) {
        toast({ title: 'Rate limited', description: 'Too many requests. Please wait.', variant: 'destructive' });
      } else if (status === 402) {
        toast({ title: 'Credits exhausted', description: 'Please add AI credits.', variant: 'destructive' });
      } else {
        toast({ title: 'Copilot error', description: err.message, variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  const resetSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
  }, []);

  return {
    sessionId,
    messages,
    isLoading,
    isStarting,
    startSession,
    sendMessage,
    resetSession,
  };
}
