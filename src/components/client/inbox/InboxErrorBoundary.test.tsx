import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InboxErrorBoundary } from './InboxErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom');
  return <p>fine</p>;
}

describe('InboxErrorBoundary', () => {
  it('shows a friendly message instead of a blank page, and recovers when asked or when the view changes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    function Harness() {
      const [key, setKey] = useState('a');
      const [explode, setExplode] = useState(true);
      return (
        <>
          <button onClick={() => { setExplode(false); setKey('b'); }}>move on</button>
          <InboxErrorBoundary resetKey={key}><Boom explode={explode} /></InboxErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong showing this part of your inbox.');
    await user.click(screen.getByRole('button', { name: 'move on' }));
    expect(screen.getByText('fine')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
