import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ canAccess: true }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { unicorn_role: 'Super Admin', first_name: 'Carl', last_name: 'Simpao' } }) }));
vi.mock('@/components/help-center', () => ({ useHelpCenter: () => ({ openHelpCenter: vi.fn(), canAccess: state.canAccess }) }));

import { UtilityFooter, manilaTime, sydneyTime } from './UtilityFooter';

const show = (tenant?: string) => render(<MemoryRouter><UtilityFooter activeTenantName={tenant} /></MemoryRouter>);

describe('UtilityFooter', () => {
  it('keeps the slim fixed height it always had', () => {
    show();
    expect(screen.getByRole('contentinfo').className).toContain('h-[25px]');
  });

  it('shows who you are, the client you are working on, the connection and the way to get help', () => {
    show('Acme Training');
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('Carl Simpao')).toBeInTheDocument();
    expect(screen.getByText('Acme Training')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Online' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support Tickets' })).toHaveAttribute('href', '/support-tickets');
    expect(screen.getByRole('button', { name: 'Help Centre' })).toBeInTheDocument();
  });

  it('never claims a client when none is selected, and hides Help Centre where it cannot open', () => {
    state.canAccess = false;
    show();
    expect(screen.queryByText('Acme Training')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help Centre' })).not.toBeInTheDocument();
    state.canAccess = true;
  });

  it('formats Sydney time the way the team writes it', () => {
    expect(sydneyTime(new Date('2026-11-19T04:45:00Z'))).toBe('3:45 pm AEDT');
    expect(sydneyTime(new Date('2026-07-01T00:00:00Z'))).toBe('10:00 am AEST');
  });

  it('shows Philippines time as PHT, three hours behind Sydney in summer and two in winter', () => {
    expect(manilaTime(new Date('2026-11-19T04:45:00Z'))).toBe('12:45 pm PHT');
    expect(manilaTime(new Date('2026-07-01T00:00:00Z'))).toBe('8:00 am PHT');
  });

  it('shows both clocks, each labelled for screen readers and tooltips', () => {
    show();
    expect(screen.getByTitle('Sydney time').textContent).toMatch(/^\d{1,2}:\d{2} (am|pm) (AEDT|AEST)$/);
    expect(screen.getByTitle('Philippines time').textContent).toMatch(/^\d{1,2}:\d{2} (am|pm) PHT$/);
  });

  it('writes the tagline with a capital M', () => {
    show();
    expect(screen.getByText('We Make Compliance Simple!')).toBeInTheDocument();
  });
});
