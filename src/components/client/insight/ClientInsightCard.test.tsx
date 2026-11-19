import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tenant: { activeTenantId: 7 as number | null, isPreview: false, isAcademyOnly: false },
  invoke: vi.fn(),
}));

vi.mock('@/contexts/ClientTenantContext', () => ({ useClientTenant: () => state.tenant }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => state.invoke(...a) } } }));

import { ClientInsightCard } from './ClientInsightCard';

const summary = { ok: true, data: { summary: { headline: 'Your package is on track.', points: ['20% of hours used.', 'No overdue tasks.'], next_step: 'Book your next consult.' }, surface: 'packages', generated_at: new Date().toISOString() } };

const show = (surface: 'home' | 'packages' | 'academy' = 'packages') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClientInsightCard surface={surface} />
    </QueryClientProvider>,
  );

const failure = (code: string, detail: string, status = 403) => ({ data: null, error: { message: 'x', context: new Response(JSON.stringify({ ok: false, code, detail }), { status }) } });

beforeEach(() => {
  state.tenant = { activeTenantId: 7, isPreview: false, isAcademyOnly: false };
  state.invoke = vi.fn().mockResolvedValue({ data: summary, error: null });
});

describe('Viv insight card', () => {
  it('does nothing when the page opens: no AI call until the button is pressed', () => {
    show();
    expect(screen.getByRole('button', { name: 'Ask Viv for an insight' })).toBeInTheDocument();
    expect(screen.getByText(/only runs when you ask/i)).toBeInTheDocument();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('asks for the right page on press and shows the written insight with its AI label', async () => {
    show('packages');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Viv for an insight' }));
    expect(await screen.findByText('Your package is on track.')).toBeInTheDocument();
    expect(state.invoke).toHaveBeenCalledWith('client-insights', { body: { surface: 'packages' } });
    expect(screen.getByText('No overdue tasks.')).toBeInTheDocument();
    expect(screen.getByText(/Book your next consult/)).toBeInTheDocument();
    expect(screen.getByText(/Written by AI from your figures/)).toBeInTheDocument();
  });

  it('does not call the model again on a second press within 30 minutes', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Ask Viv for an insight' }));
    await screen.findByText('Your package is on track.');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });

  it('sends the previewed organisation only when staff are previewing one', async () => {
    state.tenant = { activeTenantId: 7, isPreview: true, isAcademyOnly: false };
    show('home');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Viv for an insight' }));
    await screen.findByText('Your package is on track.');
    expect(state.invoke).toHaveBeenCalledWith('client-insights', { body: { surface: 'home', preview_tenant_id: 7 } });
  });

  it.each([
    ['NOT_ENABLED', 'Viv summaries are not switched on for your account yet.', true],
    ['DAILY_LIMIT_REACHED', "You have reached today's limit for Viv. It resets tomorrow.", true],
    ['UNAVAILABLE', 'Viv is busy right now. Please try again in a minute.', false],
    ['UNGROUNDED', 'Viv could not write a summary this time. Please try again.', false],
  ])('says %s in plain words', async (code, message, locked) => {
    state.invoke = vi.fn().mockResolvedValue(failure(code, 'server detail'));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Ask Viv for an insight' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Ask Viv for an insight' })).toHaveProperty('disabled', locked);
  });

  it('is not shown to Academy-only people or when no organisation is selected', () => {
    state.tenant = { activeTenantId: 7, isPreview: false, isAcademyOnly: true };
    const a = show();
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    state.tenant = { activeTenantId: null, isPreview: false, isAcademyOnly: false };
    expect(show().container).toBeEmptyDOMElement();
  });
});
