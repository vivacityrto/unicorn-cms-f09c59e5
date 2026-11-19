import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ClientHomeView } from './ClientHomeView';

const base = {
  greeting: 'Good afternoon',
  name: 'Carl',
  tenure: 'Member since 1 Jun 2026',
  csc: { name: 'Nova Canto', email: null, roleLabel: 'CSC', avatarUrl: null, assigned: true },
  packages: [],
  packagesLoading: false,
  feed: { comingUp: [], needsAttention: [], recentActivity: [], isLoading: false },
  showAuditsNote: true,
  canAccessHelpCenter: true,
};

const show = () =>
  render(
    <MemoryRouter>
      <ClientHomeView {...base} academy={<section aria-label="Academy slot" />} regulatory={<section aria-label="Regulatory slot" />} messages={<section aria-label="Messages slot" />} reminders={<section aria-label="Reminders slot" />} />
    </MemoryRouter>,
  );

describe('ClientHomeView layout', () => {
  it('fills the width it is given instead of stopping at a fixed maximum, so it lines up with the status banner above', () => {
    const { container } = show();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('w-full');
    expect(root.className).not.toMatch(/max-w-/);
  });

  it('puts learning and regulatory news with the packages, and messages and reminders in their own two-column row', () => {
    show();
    const side = screen.getByRole('complementary', { name: 'What needs you' });
    expect(within(side).queryByRole('region', { name: 'Messages slot' })).not.toBeInTheDocument();
    expect(within(side).queryByRole('region', { name: 'Reminders slot' })).not.toBeInTheDocument();
    expect(within(side).queryByRole('region', { name: 'Academy slot' })).not.toBeInTheDocument();
    expect(within(side).queryByRole('region', { name: 'Regulatory slot' })).not.toBeInTheDocument();
    const messages = screen.getByRole('region', { name: 'Messages slot' });
    const reminders = screen.getByRole('region', { name: 'Reminders slot' });
    // Both sit in the same grid row, which has two columns on large screens.
    expect(messages.parentElement).toBe(reminders.parentElement);
    expect(messages.parentElement?.className).toContain('lg:grid-cols-2');
    expect(screen.getByRole('region', { name: 'Academy slot' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Regulatory slot' })).toBeInTheDocument();
  });

  it('shows the no-audits note in the side column and the services row full width underneath', () => {
    show();
    const side = screen.getByRole('complementary', { name: 'What needs you' });
    expect(within(side).getByText(/No audits yet/)).toBeInTheDocument();
  });
});
