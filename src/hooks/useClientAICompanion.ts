/**
 * useClientAICompanion – Unicorn 2.0 Phase 17
 * Hook for client-facing guided AI companion.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ClientAIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export function useClientAICompanion(tenantId: number | undefined, mode: string = 'orientation', stageInstanceId?: number) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClientAIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const createSession = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase.functions.invoke('client-ai-companion', {
        body: {
          action: 'create_session',
          tenant_id: tenantId,
          mode,
          stage_instance_id: stageInstanceId ?? null,
        },
      });
      if (error) throw error;
      setSessionId(data.session_id);
      setMessages([]);
      return data.session_id;
    } catch (err) {
      console.error('Failed to create AI session:', err);
      toast({ title: 'Failed to start AI session', variant: 'destructive' });
      return null;
    }
  }, [tenantId, mode, stageInstanceId]);

  const sendMessage = useCallback(async (message: string) => {
    let sid = sessionId;
    if (!sid) {
      sid = await createSession();
      if (!sid) return;
    }

    const userMsg: ClientAIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('client-ai-companion', {
        body: {
          session_id: sid,
          tenant_id: tenantId,
          mode,
          message,
        },
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error.includes('Rate limit')) {
          toast({ title: 'Please wait', description: 'Too many requests. Try again shortly.' });
        } else {
          toast({ title: 'AI Error', description: data.error, variant: 'destructive' });
        }
        return;
      }

      const assistantMsg: ClientAIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response ?? 'Unable to respond.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('AI companion error:', err);
      toast({ title: 'Failed to get response', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, tenantId, mode, createSession]);

  const generateChecklist = useCallback(async () => {
    let sid = sessionId;
    if (!sid) {
      sid = await createSession();
      if (!sid) return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-ai-companion', {
        body: {
          action: 'generate_checklist',
          session_id: sid,
          tenant_id: tenantId,
          stage_instance_id: stageInstanceId,
          mode,
        },
      });
      if (error) throw error;

      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: 'Generate Preparation Checklist', timestamp: new Date().toISOString() },
        { id: crypto.randomUUID(), role: 'assistant', content: data.response ?? 'Unable to generate checklist.', timestamp: new Date().toISOString() },
      ]);
    } catch (err) {
      console.error('Checklist error:', err);
      toast({ title: 'Failed to generate checklist', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, tenantId, mode, stageInstanceId, createSession]);

  const resetSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    generateChecklist,
    resetSession,
    sessionId,
    mode,
  };
}
