import { describe, expect, it } from 'vitest';
import { staffNotificationTarget } from './staffNotificationTarget';

describe('staffNotificationTarget', () => {
  it('sends a message notification to Team Communications, not the client inbox', () => {
    expect(staffNotificationTarget({ type: 'message', source_id: 'c1', link: '/client/inbox?conversation=c1' })).toBe('/communications?thread=c1');
  });
  it('reads the conversation from the link when there is no source id', () => {
    expect(staffNotificationTarget({ type: 'message', link: '/client/inbox?conversation=c2' })).toBe('/communications?thread=c2');
  });
  it('falls back to Team Communications', () => {
    expect(staffNotificationTarget({ type: 'message' })).toBe('/communications');
  });
  it('keeps the stored link for other types', () => {
    expect(staffNotificationTarget({ type: 'ticket_reply', link: '/support-tickets/9' })).toBe('/support-tickets/9');
    expect(staffNotificationTarget({ type: 'other' })).toBeNull();
  });
});
