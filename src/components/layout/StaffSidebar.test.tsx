import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StaffSidebar } from './StaffSidebar';
import { buildStaffSections } from './staffMenu';

Element.prototype.scrollIntoView = vi.fn();
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const sections = buildStaffSections({
  userRole: 'CSC', isSuperAdmin: false, isTeamLeader: false, isIntegrator: false, isCSC: true, isVivacityTeam: true,
  teamUnreadCount: 2, myAssignedConvosCount: 0, supportTicketsCount: 1,
});

const show = (open: boolean, pathname = '/dashboard', props: Partial<React.ComponentProps<typeof StaffSidebar>> = {}) => {
  const setSidebarOpen = vi.fn();
  render(
    <MemoryRouter>
      <StaffSidebar sidebarOpen={open} setSidebarOpen={setSidebarOpen} sections={sections} pathname={pathname} roleName="Client Success Champion" {...props} />
    </MemoryRouter>,
  );
  return { setSidebarOpen };
};

describe('the staff sidebar header', () => {
  it('says Staff Portal and the role in full, and collapses from the close button', async () => {
    const user = userEvent.setup();
    const { setSidebarOpen } = show(true);
    expect(screen.getByText('Staff Portal')).toBeInTheDocument();
    expect(screen.getByText('Client Success Champion')).toBeInTheDocument();
    expect(screen.queryByText('CSC')).not.toBeInTheDocument();
    expect(screen.queryByText(/Version 2.0/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse the menu' }));
    expect(setSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('says so when a staff member is looking at the portal as a client', () => {
    show(true, '/dashboard', { isViewingAsClient: true });
    expect(screen.getByText('Client view')).toBeInTheDocument();
  });
});

describe('the open menu', () => {
  it('lists the groups in order as rows, opening the group you are in by itself', () => {
    show(true, '/manage-tenants');
    const nav = screen.getByRole('navigation', { name: 'Staff menu' });
    const groups = within(nav).getAllByRole('button').map((b) => b.textContent);
    expect(groups.slice(0, 3).map((t) => (t ?? '').replace(/\d+$/, ''))).toEqual(['Work', 'Clients', 'EOS']);
    expect(within(nav).getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('opens and closes a group in place, keeping its pages in order', async () => {
    const user = userEvent.setup();
    show(true, '/nowhere');
    const nav = screen.getByRole('navigation', { name: 'Staff menu' });
    await user.click(within(nav).getByRole('button', { name: /^Work/ }));
    const first = within(nav).getAllByRole('link').slice(0, 4).map((l) => l.textContent);
    expect(first).toEqual(['Dashboard', 'Ask Viv', 'Triage Dashboard', 'Inbox']);
    await user.click(within(nav).getByRole('button', { name: /^Work/ }));
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('shows the count on a page and a flag on its group', async () => {
    const user = userEvent.setup();
    show(true, '/nowhere');
    expect(screen.getByLabelText('Clients has items that need you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Clients/ }));
    expect(within(screen.getByRole('link', { name: /Communications/ })).getByText('2')).toBeInTheDocument();
  });
});

describe('the collapsed rail', () => {
  it('shows one icon per group, in order, and nothing wider', () => {
    show(false);
    const nav = screen.getByRole('navigation', { name: 'Staff menu' });
    const names = within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names[0]).toMatch(/^Work, 13 pages/);
    expect(names[1]).toMatch(/^Clients, 8 pages/);
    expect(within(nav).queryByText('Work')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand the menu' })).toBeInTheDocument();
  });

  it('opens a group beside the rail with its pages in order, and marks the page you are on', async () => {
    const user = userEvent.setup();
    show(false, '/support-tickets');
    await user.click(screen.getByRole('button', { name: /^Clients, 8 pages/ }));
    const panel = await screen.findByText('Documents');
    expect(panel).toBeInTheDocument();
    const links = screen.getAllByRole('link').map((l) => l.textContent);
    expect(links.slice(0, 5)).toEqual(['Clients', 'Client Activity', 'Documents', 'Communications2', 'Support Tickets1']);
    expect(screen.getByRole('link', { name: /Support Tickets/ })).toHaveAttribute('aria-current', 'page');
  });

  it('expands from the menu button', async () => {
    const user = userEvent.setup();
    const { setSidebarOpen } = show(false);
    await user.click(screen.getByRole('button', { name: 'Expand the menu' }));
    expect(setSidebarOpen).toHaveBeenCalledWith(true);
  });
});

describe('the pin that sets how the staff menu starts', () => {
  it('shows pinned when it starts open, flips the setting on press, and does not collapse the menu', async () => {
    const user = userEvent.setup();
    const setDefaultOpen = vi.fn();
    const { setSidebarOpen } = show(true, '/dashboard', { defaultOpen: true, setDefaultOpen });
    const pin = screen.getByRole('button', { name: 'Start with the menu open' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    await user.click(pin);
    expect(setDefaultOpen).toHaveBeenCalledWith(false);
    expect(setSidebarOpen).not.toHaveBeenCalled();
  });

  it('shows unpinned when it starts as icons, and pins on press', async () => {
    const user = userEvent.setup();
    const setDefaultOpen = vi.fn();
    show(true, '/dashboard', { defaultOpen: false, setDefaultOpen });
    const pin = screen.getByRole('button', { name: 'Start with the menu open' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await user.click(pin);
    expect(setDefaultOpen).toHaveBeenCalledWith(true);
  });

  it('has no pin on the collapsed rail, or where there is no such setting', () => {
    show(false, '/dashboard', { setDefaultOpen: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Start with the menu open' })).not.toBeInTheDocument();
  });
});


describe('long names are never cut off', () => {
  it('lets labels wrap, in the group rows, the nested rows and the flyout, and the stylesheet does not force one line', async () => {
    show(true, '/nowhere');
    const group = screen.getByRole('button', { name: /^Clients/ });
    expect(group.querySelector('span.flex-1')?.className).toMatch(/break-words/);
    expect(group.querySelector('svg:last-child')).toBeTruthy();
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/index.css', 'utf8');
    const rule = css.slice(css.indexOf('.sidebar-motion {'), css.indexOf('@media (prefers-reduced-motion'));
    expect(rule).not.toMatch(/white-space:\s*nowrap/);
  });
});
