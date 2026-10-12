import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TodoDueDateButton } from '../TodoDueDateButton';

describe('TodoDueDateButton', () => {
  it('shows the due date as dd/MM/yyyy, or "Not set"', () => {
    const { rerender } = render(<TodoDueDateButton dueDate="2026-10-05" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /change due date/i })).toHaveTextContent('05/10/2026');
    rerender(<TodoDueDateButton dueDate={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /change due date/i })).toHaveTextContent('Not set');
  });

  it('does not trigger the parent row click (which toggles done)', () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <TodoDueDateButton dueDate="2026-10-05" onChange={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /change due date/i }));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('calls onChange with a yyyy-MM-dd date when a day is picked', async () => {
    const onChange = vi.fn();
    render(<TodoDueDateButton dueDate="2026-10-05" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /change due date/i }));
    // Calendar opens on the due date's month; pick the 20th.
    fireEvent.click(await screen.findByRole('gridcell', { name: '20' }).then((c) => c.querySelector('button') ?? c));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2026-10-20'));
  });
});
