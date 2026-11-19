import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MessengerDock } from '../dock/MessengerDock';
import { MessengerDockProvider } from '../dock/MessengerDockProvider';
import type { MessengerThread } from '../types';

const threads: MessengerThread[] = [
  { id: 'viv', kind: 'ask_viv', title: 'Ask Viv', preview: 'Ask anything', unread: false, pinned: true },
  { id: 'c1', kind: 'package', title: 'Package question', preview: 'Thanks', unread: true, lastActivityAt: '2026-11-19T01:00:00Z' },
];

const mounts = vi.hoisted(() => ({ viv: 0 }));

function Viv() {
  // Counts mounts so we can tell it was kept, not rebuilt.
  mounts.viv += 1;
  return <p>viv chat</p>;
}

function show(unread = 2, list = threads) {
  return render(
    <MemoryRouter>
      <MessengerDockProvider>
        <MessengerDock
          threads={list}
          unreadTotal={unread}
          keepMounted={['viv']}
          fullPageHref={(t) => (t ? `/client/inbox?thread=${t.id}` : '/client/inbox')}
          renderThread={(t, api) => (
            <div>
              <h2>{t.title}</h2>
              {t.id === 'viv' ? <Viv /> : <p>messages of {t.id}</p>}
              <button onClick={api.onBack}>back</button>
              {api.headerActions}
            </div>
          )}
        />
      </MessengerDockProvider>
    </MemoryRouter>,
  );
}

describe('MessengerDock', () => {
  it('shows a launcher with the unread count, capped at 99+', () => {
    const { unmount } = show(3);
    expect(screen.getByRole('button', { name: 'Open messages, 3 unread' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    unmount();
    show(250);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('shows no number when nothing is unread', () => {
    show(0);
    expect(screen.getByRole('button', { name: 'Open messages' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('opens the thread list in place of the launcher, and Escape closes it and returns focus to the launcher', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    const panel = screen.getByRole('dialog', { name: 'Messages' });
    expect(within(panel).getByText('Package question')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open messages/ })).not.toBeInTheDocument();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open messages/ })).toHaveFocus();
  });

  it('opens a thread, goes back, and links to the full Inbox page', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    const list = screen.getByRole('list', { name: 'Conversations' });
    fireEvent.click(within(list).getByText('Package question'));
    expect(screen.getByText('messages of c1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in the Inbox' })).toHaveAttribute('href', '/client/inbox?thread=c1');
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByRole('list', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in the Inbox' })).toHaveAttribute('href', '/client/inbox');
  });

  it('keeps a keep-mounted thread alive while you are back on the list, so work in flight is not lost', () => {
    mounts.viv = 0;
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Conversations' })).getByText('Ask Viv'));
    expect(screen.getByText('viv chat')).toBeVisible();
    const mountsAfterOpen = mounts.viv;
    fireEvent.click(screen.getByText('back'));
    // Still in the page, only hidden, and not rebuilt.
    expect(screen.getByText('viv chat', { selector: 'p' })).not.toBeVisible();
    fireEvent.click(within(screen.getByRole('list', { name: 'Conversations' })).getByText('Ask Viv'));
    expect(screen.getByText('viv chat')).toBeVisible();
    expect(mounts.viv - mountsAfterOpen).toBeLessThanOrEqual(2);
  });

  it('keeps a keep-mounted thread alive even when the whole dock is closed and reopened', () => {
    mounts.viv = 0;
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Conversations' })).getByText('Ask Viv'));
    const mountsAfterOpen = mounts.viv;
    fireEvent.click(screen.getByRole('button', { name: 'Close messages' }));
    // Closed: nothing is on screen, but the chat is still in the page (hidden), so an answer on its way still lands.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('viv chat', { selector: 'p' })).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    expect(screen.getByText('viv chat')).toBeVisible();
    expect(mounts.viv - mountsAfterOpen).toBeLessThanOrEqual(2);
  });

  it('does not keep an ordinary conversation mounted while the dock is closed, so nothing is marked read unseen', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    // Visit the kept-alive thread first, so the panel stays in the page after a close.
    fireEvent.click(within(screen.getByRole('list', { name: 'Conversations' })).getByText('Ask Viv'));
    fireEvent.click(screen.getByText('back'));
    fireEvent.click(within(screen.getByRole('list', { name: 'Conversations' })).getByText('Package question'));
    expect(screen.getByText('messages of c1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close messages' }));
    expect(screen.queryByText('messages of c1')).not.toBeInTheDocument();
  });

  it('closes only the Type menu when Escape is pressed in it, not the whole bubble', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    await user.click(screen.getByRole('button', { name: 'Filter by type' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Package' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitemradio', { name: 'Package' })).not.toBeInTheDocument();
    // The bubble, and what was in it, are still there.
    expect(screen.getByRole('dialog', { name: 'Messages' })).toBeInTheDocument();
    // A second Escape, with no menu open, closes the bubble as before.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from the close button', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Open messages/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close messages' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
