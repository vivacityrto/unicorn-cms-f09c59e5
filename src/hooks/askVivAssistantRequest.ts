import { supabase } from '@/integrations/supabase/client';

export interface AskVivAssistantSource {
  tool: string;
  summary: string;
}

export interface AskVivAssistantResponse {
  conversation_id?: string | null;
  content: string;
  sources_used?: AskVivAssistantSource[];
}

interface AskVivAssistantRequestOptions {
  message: string;
  conversationId: string | null;
  pageTenantId: number | null;
}

/**
 * Calls the staff Ask Viv Assistant without changing its existing request or
 * response contract. Authorization and tenant scope remain server-side in the
 * ask-viv-assistant Edge Function.
 */
export async function requestAskVivAssistant({
  message,
  conversationId,
  pageTenantId,
}: AskVivAssistantRequestOptions): Promise<AskVivAssistantResponse> {
  const { data, error } = await supabase.functions.invoke('ask-viv-assistant', {
    body: {
      message,
      conversation_id: conversationId,
      page_context: pageTenantId ? { tenant_id: pageTenantId } : null,
    },
  });
  if (error) throw new Error(error.message || 'Failed to get a response');
  return data as AskVivAssistantResponse;
}
