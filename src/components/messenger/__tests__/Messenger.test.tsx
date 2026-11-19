import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Messenger } from '../Messenger';
import type { MessengerMessage, MessengerThread } from '../types';

// jsdom has no layout, so scrolling helpers are stubbed.
Element.prototype.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

const threads: MessengerThread[] = [
  { id: 'viv', kind: 'ask_viv', title: 'Ask Viv', preview: 'How can I help?', unread: false, lastActivityAt: '2026-11-19T01:00:00Z' },
  { id: 'tkt', kind: 'support', title: 'Ticket 12', preview: 'We are looking', unread: true, unreadCount: 2, badge: { label: 'In progress', tone: 'info' }, lastActivityAt: '2026-11-19T02:00:00Z', myLastReadAt: '2026-11-19T00:00:00Z' },
  { id: 'bc', kind: 'broadcast', title: 'Holiday hours', unread: false, readOnly: true, lastActivityAt: '2026-11-10T02:00:00Z' },
];
const messages: MessengerMessage[] = [
  { id: 'm1', senderId: 'a', senderName: 'Alex Staff', senderRole: 'staff', fromMe: false, body: 'Hello <b>there</b> https://example.com/x', createdAt: '2026-11-19T01:00:00Z' },
];

const open = (title: string) => fireEvent.click(within(screen.getByRole('list', { name: 'Conversations' })).getByText(title));

function Harness({ onSend = vi.fn().mockResolvedValue(undefined), onMarkRead = vi.fn(), mode = 'page' }: { onSend?: () => Promise<void>; onMarkRead?: () => void; mode?: 'page' | 'dock' }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Messenger
      threads={threads}
      selectedId={sel}
      onSelect={setSel}
      mode={mode}
      conversation={{ messages, onSend, onMarkRead, draftScope: 'test' }}
    />
  );
}

describe('Messenger shell', () => {
  it('lists threads with unread counts and a status chip, filters and searches', () => {
    render(<Harness />);
    expect(screen.getByText('Ticket 12')).toBeTruthy();
    expect(screen.getByLabelText('2 unread')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
    expect(within(screen.getByRole('list', { name: 'Conversations' })).queryByText('Ask Viv')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'holiday' } });
    expect(screen.queryByText('Ticket 12')).toBeNull();
    expect(screen.getByText('Holiday hours')).toBeTruthy();
  });

  it('keeps the filter row to All, Unread and one Type menu, so it never needs to scroll sideways', () => {
    render(<Harness />);
    const row = screen.getByRole('group', { name: 'Filter conversations' });
    expect(within(row).getAllByRole('button').map((b) => b.textContent?.replace(/\d+$/, '').trim())).toEqual(['All', 'Unread', 'Type']);
    expect(row.className).not.toMatch(/overflow/);
  });

  it('filters by type from the Type menu and shows the chosen type on the chip', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filter by type' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Support' }));
    const list = screen.getByRole('list', { name: 'Conversations' });
    expect(within(list).getByText('Ticket 12')).toBeTruthy();
    expect(within(list).queryByText('Ask Viv')).toBeNull();
    expect(screen.getByRole('button', { name: /Type: Support/ })).toBeTruthy();
  });

  it('opens a thread, marks it read, renders text as text and links safely', async () => {
    const onMarkRead = vi.fn();
    render(<Harness onMarkRead={onMarkRead} />);
    open('Ticket 12');
    await waitFor(() => expect(onMarkRead).toHaveBeenCalled());
    // The tag is shown as typed, not interpreted.
    expect(screen.getByText(/Hello <b>there<\/b>/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('sends on Enter, not on Shift+Enter, and keeps the text if sending fails', async () => {
    const onSend = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    render(<Harness onSend={onSend} />);
    open('Ask Viv');
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'first' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ body: 'first', files: [] }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/couldn't send/i));
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('first');
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
  });

  it('does not overwrite text typed after a failed send; it keeps both', async () => {
    let fail: (e: Error) => void = () => {};
    const onSend = vi.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    render(<Harness onSend={onSend} />);
    open('Ask Viv');
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'first' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'second' } });
    fail(new Error('offline'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('first\nsecond');
  });

  it('keeps a draft when you switch threads and come back', () => {
    render(<Harness />);
    open('Ask Viv');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'half written' } });
    fireEvent.click(screen.getByLabelText('Back to conversations'));
    open('Ask Viv');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('half written');
  });

  it('shows no message box for a read only thread', () => {
    render(<Harness />);
    open('Holiday hours');
    expect(screen.getByText('This conversation is read only.')).toBeTruthy();
    expect(screen.queryByLabelText('Message')).toBeNull();
  });

  it('in the bubble shows one pane at a time with a back arrow', () => {
    render(<Harness mode="dock" />);
    expect(screen.getByLabelText('Search messages')).toBeTruthy();
    open('Ask Viv');
    expect(screen.queryByLabelText('Search messages')).toBeNull();
    fireEvent.click(screen.getByLabelText('Back to conversations'));
    expect(screen.getByLabelText('Search messages')).toBeTruthy();
  });
});
