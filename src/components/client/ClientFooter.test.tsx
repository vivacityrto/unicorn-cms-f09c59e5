import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/help-center', () => ({ useHelpCenter: () => ({ openHelpCenter: vi.fn(), canAccess: true }) }));

import { ClientFooter } from './ClientFooter';

describe('ClientFooter', () => {
  it('is the same slim fixed height as the staff footer, with support, phone, help and the legal line', () => {
    render(<ClientFooter />);
    expect(screen.getByRole('contentinfo').className).toContain('h-[25px]');
    expect(screen.getByRole('link', { name: 'support@vivacity.com.au' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1300 729 455' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Help' })).toBeInTheDocument();
    expect(screen.getByText(/ABN 40 140 059 016/)).toBeInTheDocument();
  });
});

describe('ClientFooter build version', () => {
  it('shows the build version, as the staff footer does, when the build has one', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_BUILD_ID', 'abc123');
    const { ClientFooter: Fresh } = await import('./ClientFooter');
    render(<Fresh />);
    expect(screen.getByRole('button', { name: 'Build abc123' })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('shows nothing where the build has no id (local development)', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_BUILD_ID', '__BUILD_ID__');
    const { ClientFooter: Fresh } = await import('./ClientFooter');
    render(<Fresh />);
    expect(screen.queryByRole('button', { name: /^Build/ })).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
