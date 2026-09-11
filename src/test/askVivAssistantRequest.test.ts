import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

import { requestAskVivAssistant } from '@/hooks/askVivAssistantRequest';

describe('requestAskVivAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the assistant request payload and response contract for a tenant-context message', async () => {
    const response = {
      conversation_id: 'conversation-1',
      content: 'The client is on track.',
      sources_used: [{ tool: 'get_client_context', summary: 'Current client facts' }],
    };
    invoke.mockResolvedValueOnce({ data: response, error: null });

    await expect(requestAskVivAssistant({
      message: '  How is this client tracking?  ',
      conversationId: 'conversation-1',
      pageTenantId: 7547,
    })).resolves.toEqual(response);

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('ask-viv-assistant', {
      body: {
        message: '  How is this client tracking?  ',
        conversation_id: 'conversation-1',
        page_context: { tenant_id: 7547 },
      },
    });
  });

  it('preserves null conversation and page context for a new portfolio question', async () => {
    const response = { conversation_id: 'conversation-2', content: 'There are three overdue items.' };
    invoke.mockResolvedValueOnce({ data: response, error: null });

    await expect(requestAskVivAssistant({
      message: 'Which clients need attention?',
      conversationId: null,
      pageTenantId: null,
    })).resolves.toEqual(response);

    expect(invoke).toHaveBeenCalledWith('ask-viv-assistant', {
      body: {
        message: 'Which clients need attention?',
        conversation_id: null,
        page_context: null,
      },
    });
  });

  it('normalizes an Edge error using its message and preserves the fallback', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'Assistant unavailable' } });
    await expect(requestAskVivAssistant({
      message: 'Try again',
      conversationId: null,
      pageTenantId: null,
    })).rejects.toThrow('Assistant unavailable');

    invoke.mockResolvedValueOnce({ data: null, error: {} });
    await expect(requestAskVivAssistant({
      message: 'Try again',
      conversationId: null,
      pageTenantId: null,
    })).rejects.toThrow('Failed to get a response');
  });
});
