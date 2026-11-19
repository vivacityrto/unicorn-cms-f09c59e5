import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessengerDock } from '../dock/MessengerDock';
import { MessengerDockProvider } from '../dock/MessengerDockProvider';
import type { MessengerThread } from '../types';

const threads: MessengerThread[] = [
  { id: 'viv', kind: 'ask_viv', title: 'Ask Viv', preview: 'Ask anything', unread: false, pinned: true },
  { id: 'c1', kind: 'package', title: 'Package question', preview: 'Thanks', unread: true, lastActivityAt: '2026-11-19T01:00:00Z' },
];

const mounts = vi.hoisted(() => ({ viv: 0 }));

// jsdom has no PointerEvent: a mouse event with a pointer id does the job.
if (!('PointerEvent' in window)) {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
}

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

describe('moving the bubble out of the way', () => {
  const launcher = () => screen.getByRole('button', { name: /Open messages/ });
  const drag = (from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(launcher(), { clientX: from[0], clientY: from[1], button: 0, pointerId: 1 });
    fireEvent.pointerMove(launcher(), { clientX: to[0], clientY: to[1], pointerId: 1 });
    fireEvent.pointerUp(launcher(), { clientX: to[0], clientY: to[1], pointerId: 1 });
    fireEvent.click(launcher());
  };

  beforeEach(() => window.localStorage.clear());

  it('sits in the bottom right corner until it is moved', () => {
    show();
    expect(launcher().getAttribute('style') ?? '').toBe('');
    expect(launcher().className).toContain('bottom-12');
    expect(launcher().className).toContain('right-5');
  });

  it('still opens on a plain click, and on a press that barely moves', () => {
    show();
    fireEvent.pointerDown(launcher(), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(launcher(), { clientX: 12, clientY: 11, pointerId: 1 });
    fireEvent.pointerUp(launcher(), { clientX: 12, clientY: 11, pointerId: 1 });
    fireEvent.click(launcher());
    expect(screen.getByRole('dialog', { name: 'Messages' })).toBeInTheDocument();
  });

  it('drags to the other side, snaps to that edge, does not open, and is remembered', () => {
    show();
    drag([30, 30], [100, 300]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(launcher().style.left).toBe('20px');
    expect(launcher().style.top).not.toBe('');
    const saved = JSON.parse(window.localStorage.getItem('messenger:dock-position') ?? 'null');
    expect(saved.side).toBe('left');
    expect(saved.y).toBeGreaterThan(0);
    expect(saved.y).toBeLessThan(1);
  });

  it('opens its panel on the side it was moved to', async () => {
    show();
    drag([30, 30], [100, 300]);
    // The click that ends a drag is ignored; a later, real click opens the bubble.
    await new Promise((r) => setTimeout(r, 5));
    fireEvent.click(launcher());
    const panel = screen.getByRole('dialog', { name: 'Messages' });
    expect(panel.className).toContain('sm:left-5');
    expect(panel.className).not.toContain('sm:right-5');
  });

  it('comes back where it was left, on the next visit', () => {
    window.localStorage.setItem('messenger:dock-position', JSON.stringify({ side: 'left', y: 0 }));
    show();
    expect(launcher().style.left).toBe('20px');
    expect(launcher().style.top).toBe('56px');
  });

  it('moves with Shift and the arrow keys, and goes back with Shift and Home', () => {
    show();
    fireEvent.keyDown(launcher(), { key: 'ArrowLeft', shiftKey: true });
    expect(launcher().style.left).toBe('20px');
    const before = launcher().style.top;
    fireEvent.keyDown(launcher(), { key: 'ArrowUp', shiftKey: true });
    expect(parseInt(launcher().style.top, 10)).toBeLessThan(parseInt(before, 10));
    fireEvent.keyDown(launcher(), { key: 'Home', shiftKey: true });
    expect(launcher().getAttribute('style') ?? '').toBe('');
    expect(window.localStorage.getItem('messenger:dock-position')).toBeNull();
  });

  it('leaves the arrow keys alone without Shift, so nothing else is hijacked', () => {
    show();
    fireEvent.keyDown(launcher(), { key: 'ArrowLeft' });
    expect(launcher().getAttribute('style') ?? '').toBe('');
  });

  it('tells people how to move it', () => {
    show();
    expect(launcher()).toHaveAttribute('aria-describedby', 'messenger-dock-move-hint');
    expect(document.getElementById('messenger-dock-move-hint')?.textContent).toMatch(/drag/i);
  });
});
