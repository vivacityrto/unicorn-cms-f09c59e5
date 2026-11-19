import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { plainExcerpt } from '@/hooks/use-client-home-updates';
import { HomeMessagesView, HomeRegulatoryView } from './HomeUpdatesCards';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('plainExcerpt', () => {
  it('turns markdown into a short plain sentence', () => {
    expect(plainExcerpt('## Heading\n\nSee [the guidance](https://x.test) for **details**.')).toBe('Heading See the guidance for details .');
    expect(plainExcerpt('a'.repeat(300), 20)).toBe(`${'a'.repeat(20)}…`);
    expect(plainExcerpt(null)).toBeNull();
    expect(plainExcerpt('  \n ')).toBeNull();
  });
});

describe('Home update cards', () => {
  it('lists broadcast messages with a New marker only on unread ones, each linking to its thread', () => {
    wrap(<HomeMessagesView items={[
      { id: 'a', subject: 'ADC opens 3 March', excerpt: 'Your CEO receives a link.', sentAt: '2026-11-15T00:00:00Z', isUnread: true },
      { id: 'b', subject: 'Webinar recording', excerpt: '', sentAt: '2026-11-01T00:00:00Z', isUnread: false },
    ]} />);
    const region = screen.getByRole('region', { name: 'Messages from Vivacity' });
    expect(region).toHaveTextContent('ADC opens 3 March');
    expect(screen.getAllByText('New')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /ADC opens 3 March/ })).toHaveAttribute('href', '/client/inbox?tab=messages&thread=a');
    expect(screen.getByRole('link', { name: 'Open inbox' })).toHaveAttribute('href', '/client/inbox?tab=messages');
  });

  it('lists regulatory updates with the impact level and a link to each', () => {
    wrap(<HomeRegulatoryView items={[
      { id: 'r1', regulator: 'ASQA', impact: 'high', detectedAt: '2026-11-12T00:00:00Z', excerpt: 'Updated guidance on third-party arrangements.' },
      { id: 'r2', regulator: 'DEWR', impact: null, detectedAt: null, excerpt: null },
    ]} />);
    const region = screen.getByRole('region', { name: 'Regulatory updates' });
    expect(region).toHaveTextContent('High impact');
    expect(region).toHaveTextContent('Updated guidance on third-party arrangements.');
    expect(screen.getByRole('link', { name: /ASQA/ })).toHaveAttribute('href', '/client/regulatory-updates/r1');
    expect(screen.getByRole('link', { name: 'All updates' })).toHaveAttribute('href', '/client/regulatory-updates');
  });
});

describe('broadcast cache key', () => {
  it('lives under the inbox invalidation prefix so new broadcasts refresh the Home card', async () => {
    const source = (await import('node:fs')).readFileSync('src/hooks/use-client-home-updates.ts', 'utf8');
    expect(source).toMatch(/queryKey: \['client-conversations', 'home-broadcasts'/);
  });

  describe('compact messages card', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, subject: `Message ${i}`, excerpt: 'Body', sentAt: '2026-11-15T00:00:00Z', isUnread: i === 0 }));

    it('shows the first three with a Show all button, then expands and collapses', async () => {
      wrap(<HomeMessagesView items={many} compact />);
      const region = screen.getByRole('region', { name: 'Messages from Vivacity' });
      expect(region).toHaveTextContent('Broadcasts from your Vivacity team.');
      expect(screen.getAllByRole('link', { name: /Message \d/ })).toHaveLength(3);
      await userEvent.click(screen.getByRole('button', { name: 'Show all 6 messages' }));
      expect(screen.getAllByRole('link', { name: /Message \d/ })).toHaveLength(6);
      await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
      expect(screen.getAllByRole('link', { name: /Message \d/ })).toHaveLength(3);
    });

    it('has no Show all button when everything already fits', () => {
      wrap(<HomeMessagesView items={many.slice(0, 3)} compact />);
      expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
    });
  });
});
