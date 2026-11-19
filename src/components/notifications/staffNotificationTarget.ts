/** Where a staff member goes when they open a notification. Message notifications are stored with the client inbox link, which is wrong for staff. */
export function staffNotificationTarget(n: { type: string; source_id?: string | null; link?: string | null }): string | null {
  if (n.type === 'message') {
    const convId = n.source_id ?? new URLSearchParams(n.link?.split('?')[1] ?? '').get('conversation');
    return convId ? `/communications?thread=${convId}` : '/communications';
  }
  if (n.type === 'support_ticket') return n.source_id ? `/support-tickets/${n.source_id}` : '/support-tickets';
  return n.link || null;
}
