import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageTimeline } from '../MessageTimeline';
import type { MessengerMessage } from '../types';

const scrollTo = vi.fn();
const scrollIntoView = vi.fn();
Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
Element.prototype.scrollIntoView = scrollIntoView;

const m = (id: string, at: string, fromMe = false): MessengerMessage => ({
  id, senderId: fromMe ? 'me' : 'a', senderName: fromMe ? 'Me' : 'Alex', senderRole: fromMe ? 'client' : 'staff', fromMe, body: id, createdAt: at,
});
const read = [m('m1', '2026-11-19T01:00:00Z')];
const unread = [m('m2', '2026-11-19T02:00:00Z'), m('m3', '2026-11-19T02:01:00Z')];

describe('MessageTimeline opening position', () => {
  beforeEach(() => { scrollTo.mockClear(); scrollIntoView.mockClear(); });

  it('opens at the "New messages" divider and does not then jump to the bottom', () => {
    render(<MessageTimeline messages={[...read, ...unread]} unreadAfter="2026-11-19T01:30:00Z" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('opens at the latest message when nothing is unread', () => {
    render(<MessageTimeline messages={read} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('still follows a new message once open and at the bottom', () => {
    const { rerender } = render(<MessageTimeline messages={read} />);
    scrollTo.mockClear();
    rerender(<MessageTimeline messages={[...read, ...unread]} />);
    expect(scrollTo).toHaveBeenCalled();
  });
});
