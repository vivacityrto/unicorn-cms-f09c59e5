import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ askVivEnabled: true, mounts: 0 }));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ isSuperAdmin: false, isVivacityTeam: true }) }));
vi.mock('@/hooks/useStaffMessenger', () => ({
  useStaffMessenger: () => ({
    threads: [{ id: 'c1', kind: 'general', title: 'Acme · hello', unread: false, tenantId: 1, lastActivityAt: '2026-11-19T01:00:00Z' }],
    totalUnread: 0,
    isLoading: false,
    scope: new Map([[1, { reason: 'primary_csc' }]]),
    hasScope: true,
  }),
}));
vi.mock('@/hooks/useStaffConversationPane', () => ({ useStaffConversationPane: () => ({ messages: [], isLoading: false, onSend: vi.fn(), draftScope: 't' }) }));
vi.mock('@/hooks/useAskVivAssistantAccess', () => ({ useAskVivAssistantAccess: () => ({ enabled: state.askVivEnabled, isLoading: false }) }));
vi.mock('@/components/ask-viv-assistant/StaffAskVivChat', () => ({
  StaffAskVivChat: ({ active, headerActions }: { active?: boolean; headerActions?: React.ReactNode }) => {
    state.mounts += 1;
    return (
      <div>
        <p data-active={String(!!active)}>ask viv chat</p>
        {headerActions}
      </div>
    );
  },
}));

vi.mock('@/components/staff/StaffNewMessagePane', () => ({ StaffNewMessagePane: () => <p>compose pane</p> }));

Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

import { StaffMessengerDock } from './StaffMessengerDock';
import { MessengerDockProvider } from '@/components/messenger';
import { useAskVivAssistantWidget } from '@/hooks/useAskVivAssistantWidget';

const show = () =>
  render(
    <MemoryRouter>
      <MessengerDockProvider>
        <StaffMessengerDock />
      </MessengerDockProvider>
    </MemoryRouter>,
  );

const list = () => screen.getByRole('list', { name: 'Conversations' });

beforeEach(() => {
  state.askVivEnabled = true;
  state.mounts = 0;
  useAskVivAssistantWidget.setState({ isOpen: false });
});

describe('Ask Viv for staff, inside the messenger bubble', () => {
  it('is the first thread, and opens the assistant in the bubble', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    const rows = within(list()).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Ask Viv');
    fireEvent.click(rows[0]);
    expect(screen.getByText('ask viv chat')).toBeVisible();
  });

  it('is offered only to people the assistant is rolled out to, as the old widget was', () => {
    state.askVivEnabled = false;
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    expect(within(list()).queryByText('Ask Viv')).not.toBeInTheDocument();
    expect(within(list()).getByText('Acme · hello')).toBeInTheDocument();
  });

  it('keeps the assistant alive while the bubble is closed, so an answer on its way is not lost', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    fireEvent.click(within(list()).getAllByRole('button')[0]);
    const mountsOpen = state.mounts;
    fireEvent.click(screen.getByRole('button', { name: 'Close messages' }));
    expect(screen.getByText('ask viv chat')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    expect(screen.getByText('ask viv chat')).toBeVisible();
    expect(state.mounts - mountsOpen).toBeLessThanOrEqual(2);
  });

  it('does not offer the Ask Viv thread an "Open in the Inbox" link (it has its own full page button)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    fireEvent.click(within(list()).getAllByRole('button')[0]);
    expect(screen.queryByRole('link', { name: 'Open in the Inbox' })).not.toBeInTheDocument();
  });
});

describe('anything that still asks for the old widget', () => {
  it('opens the bubble on Ask Viv and puts the old widget state back', () => {
    show();
    act(() => useAskVivAssistantWidget.getState().openWidget());
    expect(screen.getByRole('dialog', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByText('ask viv chat')).toBeVisible();
    expect(useAskVivAssistantWidget.getState().isOpen).toBe(false);
  });

  it('does nothing for people who do not have the assistant', () => {
    state.askVivEnabled = false;
    show();
    act(() => useAskVivAssistantWidget.getState().openWidget());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useAskVivAssistantWidget.getState().isOpen).toBe(false);
  });
});

describe('writing a new message from the staff bubble', () => {
  it('the + button opens the compose pane inside the bubble, and it is not listed as a conversation', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    expect(within(list()).queryByText('New message')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    expect(screen.getByText('compose pane')).toBeVisible();
  });
});
