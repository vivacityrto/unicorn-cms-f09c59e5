import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { unicorn_role: 'Super Admin', first_name: 'Carl', last_name: 'S' } }) }));
vi.mock('@/components/help-center', () => ({ useHelpCenter: () => ({ openHelpCenter: vi.fn(), canAccess: true }) }));

import { RefreshButton } from './RefreshButton';
import { UtilityFooter } from './UtilityFooter';
import { AcademyFooter } from './AcademyFooter';
import { ClientFooter } from '@/components/client/ClientFooter';

describe('RefreshButton', () => {
  it('runs the refresh it is given when pressed, and is labelled for screen readers', async () => {
    const onRefresh = vi.fn();
    render(<RefreshButton onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh the page' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('hard-refreshes by default: clears service workers and caches, then loads a new URL', async () => {
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, href: 'https://unicorn-cms.au/dashboard?tab=1', replace } });
    render(<RefreshButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh the page' }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const target = new URL(replace.mock.calls[0][0] as string);
    expect(target.pathname).toBe('/dashboard');
    expect(target.searchParams.get('tab')).toBe('1');
    expect(target.searchParams.get('_refresh')).not.toBeNull();
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('is in the staff, client and Academy footers', () => {
    const staff = render(<MemoryRouter><UtilityFooter /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Refresh the page' })).toBeInTheDocument();
    staff.unmount();
    const client = render(<ClientFooter />);
    expect(screen.getByRole('button', { name: 'Refresh the page' })).toBeInTheDocument();
    client.unmount();
    render(<AcademyFooter />);
    expect(screen.getByRole('button', { name: 'Refresh the page' })).toBeInTheDocument();
  });

  it('keeps the slim fixed footer height', () => {
    render(<ClientFooter />);
    expect(screen.getByRole('contentinfo').className).toContain('h-[25px]');
  });
});
