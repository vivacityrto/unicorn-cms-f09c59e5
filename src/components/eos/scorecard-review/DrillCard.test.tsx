import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DrillCard, type DrillStep } from './DrillCard';

type Step = DrillStep;

function Harness() {
  return (
    <DrillCard<Step>
      title="Clients"
      hint="Choose one."
      root={(open) => (
        <button type="button" onClick={() => open({ key: 'a', label: 'Alpha' })}>Open Alpha</button>
      )}
      page={(step, open) => (
        <div>
          <p>Page for {step.label}</p>
          {step.key === 'a' && <button type="button" onClick={() => open({ key: 'b', label: 'Beta' })}>Go deeper</button>}
        </div>
      )}
    />
  );
}

describe('DrillCard', () => {
  it('slides a mini page in over the card and shows where you are', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Clients' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Alpha' }));
    expect(screen.getByText('Page for Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Clients' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Where you are' })).getByText('Clients › Alpha')).toBeInTheDocument();
  });

  it('stacks a second level and Back goes up one level at a time', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Go deeper' }));
    expect(screen.getByText('Page for Beta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Alpha' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Alpha' }));
    expect(screen.getByText('Page for Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Clients' }));
    expect(screen.getByRole('heading', { name: 'Clients' })).toBeInTheDocument();
  });
});
