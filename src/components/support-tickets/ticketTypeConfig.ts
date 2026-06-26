export const TICKET_TYPES = [
  {
    key: 'broken',
    typeCode: 'error',
    emoji: '🐛',
    label: 'Something is broken',
    description: 'Report an error or unexpected behaviour',
  },
  {
    key: 'feature',
    typeCode: 'suggestion',
    emoji: '✨',
    label: 'Feature Request',
    description: 'Suggest a new capability',
  },
  {
    key: 'improvement',
    typeCode: 'improvement',
    emoji: '🎨',
    label: 'UX Improvement',
    description: 'Better flows, layouts, or copy',
  },
  {
    key: 'question',
    typeCode: 'question',
    emoji: '❓',
    label: 'Question',
    description: 'Ask the team something',
  },
  {
    key: 'other',
    typeCode: 'other',
    emoji: '💬',
    label: 'Other',
    description: 'Anything else',
  },
] as const;

export type TicketTypeKey = (typeof TICKET_TYPES)[number]['key'];

export const TICKET_TYPE_BY_KEY: Record<TicketTypeKey, (typeof TICKET_TYPES)[number]> =
  TICKET_TYPES.reduce((acc, t) => {
    acc[t.key] = t;
    return acc;
  }, {} as Record<TicketTypeKey, (typeof TICKET_TYPES)[number]>);
