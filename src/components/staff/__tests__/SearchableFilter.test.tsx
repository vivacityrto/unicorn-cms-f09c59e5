import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SearchableFilter } from '../SearchableFilter';

// cmdk measures its list; jsdom has no layout.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(window as unknown as { ResizeObserver: unknown }).ResizeObserver = TestResizeObserver;
Element.prototype.scrollIntoView = () => undefined;

const OPTIONS = [
  { value: '1', label: 'Advanced School Of Beauty Therapy' },
  { value: '2', label: 'AHMRC Training' },
  { value: '3', label: 'Australian College Pty Ltd' },
  { value: '4', label: 'Australian College Pty Ltd' },
  { value: '5', label: 'Zokal Safety Training' },
];

function Harness({ initial = 'all' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SearchableFilter label="Client" allLabel="Every client" value={value} onChange={setValue} options={OPTIONS} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('SearchableFilter', () => {
  it('shows what is chosen on the button, and "Every client" when nothing is', () => {
    render(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Client' })).toHaveTextContent('Every client');
  });

  it('has a search box, and typing narrows a long list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    const search = await screen.findByPlaceholderText('Search clients…');
    expect(screen.getAllByRole('option').length).toBe(OPTIONS.length + 1);
    await user.type(search, 'zok');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Zokal Safety Training/ })).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    await user.type(await screen.findByPlaceholderText('Search clients…'), 'qqqq');
    expect(screen.getByText('No client matches.')).toBeInTheDocument();
  });

  it('picks one, closes, shows it on the button and offers a way to clear it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    await user.click(await screen.findByRole('option', { name: /AHMRC Training/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('2');
    expect(screen.queryByPlaceholderText('Search clients…')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Client' })).toHaveTextContent('AHMRC Training');
    await user.click(screen.getByRole('button', { name: 'Clear the client filter' }));
    expect(screen.getByTestId('value')).toHaveTextContent('all');
    expect(screen.queryByRole('button', { name: 'Clear the client filter' })).not.toBeInTheDocument();
  });

  it('can pick between two clients with the same name', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    const twins = await screen.findAllByRole('option', { name: /Australian College Pty Ltd/ });
    expect(twins).toHaveLength(2);
    await user.click(twins[1]);
    expect(screen.getByTestId('value')).toHaveTextContent('4');
  });

  it('goes back to everyone from the list as well', async () => {
    const user = userEvent.setup();
    render(<Harness initial="5" />);
    await user.click(screen.getByRole('combobox', { name: 'Client' }));
    await user.click(await screen.findByRole('option', { name: /Every client/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('all');
  });
});
