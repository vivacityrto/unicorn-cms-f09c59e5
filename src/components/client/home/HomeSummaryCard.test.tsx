import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomeSummaryCard } from './HomeSummaryCard';

describe('HomeSummaryCard', () => {
  it('puts its heading above the card, in the same style as the Your packages heading, so the columns line up', () => {
    render(<HomeSummaryCard lines={['2 of 7 stages are complete.', 'There are no open tasks.']} />);
    const region = screen.getByRole('region', { name: 'At a glance' });
    const heading = screen.getByRole('heading', { name: 'At a glance' });
    const card = region.querySelector('div.rounded-xl') as HTMLElement;
    expect(region.firstElementChild).toBe(heading);
    expect(heading.className).toContain('uppercase');
    expect(card.contains(heading)).toBe(false);
    expect(card).toHaveTextContent('There are no open tasks.');
  });

  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<HomeSummaryCard lines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
