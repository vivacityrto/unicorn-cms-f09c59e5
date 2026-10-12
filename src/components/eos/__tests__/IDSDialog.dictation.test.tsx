/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const saveMock = vi.fn();
const auth = vi.hoisted(() => ({ profile: { user_uuid: 'attendee-1', tenant_id: 6372 } as Record<string, unknown> }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: auth.profile }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/useEosOptions', () => ({
  useEosStatusTransitions: () => ({ data: [] }),
  isValidStatusTransition: () => true,
  getAllowedStatusTransitions: () => [],
}));
vi.mock('@/hooks/useVivacityTeamUsers', () => ({ useVivacityTeamUsers: () => ({ data: [] }) }));
vi.mock('@/components/eos/ClientBadge', () => ({ ClientBadge: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/eosIssueEdit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/eosIssueEdit')>()),
  saveIssueTextField: (...args: unknown[]) => saveMock(...args),
  fetchIssueTextField: vi.fn(),
}));

import { IDSDialog } from '@/components/eos/IDSDialog';
import type { EosIssue } from '@/types/eos';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
  }
  say(text: string) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  }
}
const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

const issue: EosIssue = {
  id: 'issue-1',
  tenant_id: 6372,
  title: 'Tool spend and dependencies',
  status: 'Discussing',
  created_at: '2026-10-12T00:00:00Z',
  updated_at: '2026-10-12T00:00:00Z',
};

function renderDialog(overrides: Partial<EosIssue> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <IDSDialog open onOpenChange={() => undefined} issue={{ ...issue, ...overrides }} meetingId="meeting-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const notesField = () => screen.getByPlaceholderText(/add discussion notes/i) as HTMLTextAreaElement;

beforeEach(() => {
  FakeRecognition.instances = [];
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  localStorage.clear();
  auth.profile = { user_uuid: 'attendee-1', tenant_id: 6372 };
  saveMock.mockReset();
  saveMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe('IDSDialog: voice dictation', () => {
  it('Dictate starts hands-free listening and types what is said into the notes', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));

    expect(latest().started).toBe(true);
    expect(latest().continuous).toBe(true);
    expect(screen.getByRole('button', { name: /stop dictating/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/listening/i);

    act(() => latest().say('we should cancel the unused tools'));
    act(() => latest().say('and review GHL next month'));

    expect(notesField().value).toBe('We should cancel the unused tools and review GHL next month');
  });

  it('keeps what is already typed and adds to it', async () => {
    const user = userEvent.setup();
    renderDialog({ outcome_note: 'Dave raised the cost.' });

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('agreed to cut two tools'));

    expect(notesField().value).toBe('Dave raised the cost. Agreed to cut two tools');
  });

  it('Stop dictating ends it', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    await user.click(screen.getByRole('button', { name: /stop dictating/i }));

    expect(latest().started).toBe(false);
    expect(screen.getByRole('button', { name: /^dictate$/i })).toBeInTheDocument();
  });

  it('stops dictating when the user moves to another tab', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    await user.click(screen.getByRole('tab', { name: /solve/i }));

    expect(latest().started).toBe(false);
  });

  it('dictates into the solution on the Solve tab', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('tab', { name: /solve/i }));
    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('cancel two subscriptions'));

    expect((screen.getByPlaceholderText(/describe the solution/i) as HTMLTextAreaElement).value).toBe(
      'Cancel two subscriptions',
    );
  });

  it('says so, and offers no mic, in a browser without speech recognition', () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    renderDialog();

    expect(screen.getByText(/voice dictation needs chrome or edge/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^dictate$/i })).not.toBeInTheDocument();
    expect(notesField()).toBeEnabled();
  });

  it('starts by itself only when the user has opted in', () => {
    renderDialog();
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('auto-starts when opted in and the issue is being discussed', () => {
    localStorage.setItem('eos-ids-dictation-autostart', '1');
    renderDialog();

    expect(FakeRecognition.instances).toHaveLength(1);
    expect(latest().started).toBe(true);
    expect(screen.getByRole('button', { name: /stop dictating/i })).toBeInTheDocument();
  });

  it('remembers the "start automatically" choice', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('switch', { name: /start dictating automatically/i }));

    expect(localStorage.getItem('eos-ids-dictation-autostart')).toBe('1');
  });
});

describe('IDSDialog: dictation autosave', () => {
  it('saves the dictated notes a few seconds after the text stops changing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderDialog({ outcome_note: 'Existing.' });

    fireEvent.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('cut the tools'));
    expect(saveMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith('issue-1', 'outcome_note', 'Existing. Cut the tools', 'Existing.');
  });

  it('keeps pushing the save back while words keep arriving, then saves once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('one'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    act(() => latest().say('two'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(saveMock).not.toHaveBeenCalled();

    await act(async () => void (await vi.advanceTimersByTimeAsync(1200)));
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][2]).toBe('One two');
  });

  it('saves straight away when dictation is stopped', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('quick note'));
    await user.click(screen.getByRole('button', { name: /stop dictating/i }));

    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][2]).toBe('Quick note');
  });

  it('Move to Solve while dictating saves the notes once, not twice', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('decided to cancel'));
    await user.click(screen.getByRole('button', { name: /move to solve/i }));

    await vi.waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(latest().started).toBe(false);
  });
});

describe('IDSDialog: dictation name labels', () => {
  beforeEach(() => {
    auth.profile = { user_uuid: 'attendee-1', tenant_id: 6372, first_name: 'Nova' };
  });

  it('labels dictated notes with the speaker name and continues the line while they keep talking', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('we should cancel the unused tools'));
    act(() => latest().say('and review GHL next month'));

    expect(notesField().value).toBe('Nova: We should cancel the unused tools and review GHL next month');
  });

  it('starts a new labelled line when someone else spoke last', async () => {
    const user = userEvent.setup();
    renderDialog({ outcome_note: 'Angela: We need two more consultants.' });

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('agreed'));

    expect(notesField().value).toBe('Angela: We need two more consultants.\nNova: Agreed');
  });

  it('the label can be switched off, and the choice is remembered', async () => {
    const user = userEvent.setup();
    renderDialog();

    const toggle = screen.getByRole('switch', { name: /label with my name/i });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(localStorage.getItem('eos-ids-dictation-label-name')).toBe('0');

    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('no label please'));
    expect(notesField().value).toBe('No label please');
  });

  it('never labels the solution', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('tab', { name: /solve/i }));
    await user.click(screen.getByRole('button', { name: /^dictate$/i }));
    act(() => latest().say('cancel two subscriptions'));

    expect((screen.getByPlaceholderText(/describe the solution/i) as HTMLTextAreaElement).value).toBe(
      'Cancel two subscriptions',
    );
  });

  it('shows no label switch on the Solve tab', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: /solve/i }));
    expect(screen.queryByRole('switch', { name: /label with my name/i })).not.toBeInTheDocument();
  });
});
