import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsDrawer } from './NotificationsDrawer';
import { filterItems, groupByDay, typeCounts, plainText, type DrawerItem } from './drawerModel';

const NOW = new Date('2026-11-19T10:00:00');
const at = (daysAgo: number, hour = 9) => new Date(2026, 10, 19 - daysAgo, hour).toISOString();

const items: DrawerItem[] = [
  { id: 'a', type: 'message', title: 'New message', message: '<p>Hello <b>there</b></p>', isRead: false, createdAt: at(0), tenantName: 'Acme' },
  { id: 'b', type: 'note_shared', title: 'Note shared', message: 'A note', isRead: true, createdAt: at(1) },
  { id: 'c', type: 'message', title: 'Older message', message: null, isRead: false, createdAt: at(3) },
  { id: 'd', type: 'task_due', title: 'Long ago', message: 'x', isRead: true, createdAt: at(30) },
];

describe('drawer model', () => {
  it('groups newest first under Today, Yesterday, Earlier this week and Older, leaving empty groups out', () => {
    const groups = groupByDay(items, NOW);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']], ['Yesterday', ['b']], ['Earlier this week', ['c']], ['Older', ['d']],
    ]);
    expect(groupByDay([items[0]], NOW).map((g) => g.label)).toEqual(['Today']);
  });
  it('filters by unread and by type', () => {
    expect(filterItems(items, 'unread', null).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterItems(items, 'all', 'note_shared').map((i) => i.id)).toEqual(['b']);
    expect(filterItems(items, 'unread', 'note_shared')).toEqual([]);
  });
  it('counts types, most common first', () => {
    expect(typeCounts(items)[0]).toEqual({ type: 'message', count: 2 });
  });
  it('turns stored html into plain text', () => {
    expect(plainText('<p>Hello <b>there</b></p>')).toBe('Hello there');
    expect(plainText(null)).toBe('');
  });
});

function show(over: Partial<React.ComponentProps<typeof NotificationsDrawer>> = {}) {
  const props = { open: true, onOpenChange: vi.fn(), items, onOpenItem: vi.fn(), onMarkRead: vi.fn(), onMarkAllRead: vi.fn(), onViewAll: vi.fn(), ...over };
  render(<NotificationsDrawer {...props} />);
  return props;
}

describe('NotificationsDrawer', () => {
  it('shows the unread count and the notifications as cards with plain text', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('2 unread')).toBeInTheDocument();
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('opens a notification and closes the drawer', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: /^AcmeNew message/ }));
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onOpenItem).toHaveBeenCalledWith('a');
  });

  it('marks one read without opening it, and all read from the header', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'Mark "New message" as read' }));
    expect(p.onMarkRead).toHaveBeenCalledWith('a');
    expect(p.onOpenItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(p.onMarkAllRead).toHaveBeenCalled();
  });

  it('the Unread view hides what has been read', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
    expect(screen.queryByText('Note shared')).not.toBeInTheDocument();
    expect(screen.getByText('Older message')).toBeInTheDocument();
  });

  it('says so when everything is read', () => {
    show({ items: items.filter((i) => i.isRead) });
    expect(screen.getByText('You are all caught up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('Nothing unread')).toBeInTheDocument();
  });

  it('has a View all link that closes the drawer first', () => {
    const p = show();
    fireEvent.click(screen.getByRole('button', { name: 'View all notifications' }));
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onViewAll).toHaveBeenCalled();
  });

  it('swaps to preferences with the gear and back again', () => {
    show({ preferences: <p>pref matrix</p> });
    fireEvent.click(screen.getByRole('button', { name: 'Notification preferences' }));
    expect(screen.getByText('pref matrix')).toBeInTheDocument();
    expect(screen.queryByText('New message')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to notifications' }));
    expect(within(screen.getByRole('dialog')).getByText('New message')).toBeInTheDocument();
  });

  it('offers no preferences button where none are provided (clients)', () => {
    show();
    expect(screen.queryByRole('button', { name: 'Notification preferences' })).not.toBeInTheDocument();
  });
});

describe('focus when the drawer closes', () => {
  it('goes back to the bell that opened it', async () => {
    const bell = document.createElement('button');
    document.body.appendChild(bell);
    const ref = { current: bell };
    const { rerender } = render(<NotificationsDrawer open onOpenChange={vi.fn()} items={items} onOpenItem={vi.fn()} onMarkRead={vi.fn()} onMarkAllRead={vi.fn()} returnFocusTo={ref} />);
    rerender(<NotificationsDrawer open={false} onOpenChange={vi.fn()} items={items} onOpenItem={vi.fn()} onMarkRead={vi.fn()} onMarkAllRead={vi.fn()} returnFocusTo={ref} />);
    await waitFor(() => expect(document.activeElement).toBe(bell));
    bell.remove();
  });
});

