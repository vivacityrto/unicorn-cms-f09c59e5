import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { Building2, Inbox } from 'lucide-react';
import { OPEN_STAFF_GO_TO_EVENT, StaffGoToSearch } from './StaffGoToSearch';
import type { StaffSection } from './staffMenu';

const sections: StaffSection[] = [
  { key: 'work', title: 'Work', icon: Inbox, alert: false, items: [{ icon: Inbox, label: 'Team Communications', path: '/communications' }] },
  { key: 'clients', title: 'Clients', icon: Building2, alert: false, items: [{ icon: Building2, label: 'Manage Clients', path: '/manage-tenants' }] },
];

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

function setup() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <StaffGoToSearch sections={sections} />
      <Where />
    </MemoryRouter>,
  );
}

describe('StaffGoToSearch', () => {
  // The list scrolls the highlighted item into view; jsdom has no layout, so this does nothing here.
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => undefined;
  });

  it('opens with Ctrl + K and lists the pages in the menu', async () => {
    setup();
    expect(screen.queryByPlaceholderText('Go to a page…')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByPlaceholderText('Go to a page…')).toBeInTheDocument();
    expect(screen.getByText('Team Communications')).toBeInTheDocument();
    expect(screen.getByText('Manage Clients')).toBeInTheDocument();
  });

  it('filters by typing and goes to the page', async () => {
    setup();
    window.dispatchEvent(new Event(OPEN_STAFF_GO_TO_EVENT));
    await userEvent.type(await screen.findByPlaceholderText('Go to a page…'), 'manage');
    expect(screen.queryByText('Team Communications')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Manage Clients'));
    expect(screen.getByTestId('where')).toHaveTextContent('/manage-tenants');
  });
});
