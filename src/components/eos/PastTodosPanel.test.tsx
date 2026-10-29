/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PastTodo } from '@/hooks/useMeetingTodos';

let state: { data?: PastTodo[]; isLoading: boolean; isError: boolean };
vi.mock('@/hooks/useMeetingTodos', () => ({ usePastTodos: () => state }));
vi.mock('@/hooks/useRockTodos', () => ({ useTodoRockLinks: () => ({ data: {} }) }));
vi.mock('@/components/eos/rocks/todos/TodoRockLink', () => ({ TodoRockLink: ({ todoId }: { todoId: string }) => <span data-testid={`rock-link-${todoId}`} /> }));

import { PastTodosPanel } from '@/components/eos/PastTodosPanel';

const todo = (id: string, over: Partial<PastTodo> = {}): PastTodo => ({
  id, title: `Todo ${id}`, status: 'Complete', due_date: '2026-10-10', owner_id: 'u1', ownerName: 'Ana', closedAt: '2026-10-12T02:00:00Z', issueTitle: null, ...over,
});

beforeEach(() => { state = { data: [], isLoading: false, isError: false }; });
afterEach(cleanup);

describe('PastTodosPanel', () => {
  it('says plainly when there are none', () => {
    render(<PastTodosPanel meetingId="m" tenantId={1} onReopen={vi.fn()} />);
    expect(screen.getByText('No completed or cancelled To-Dos from earlier meetings.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Past To-Dos \(0\)/ })).toBeInTheDocument();
  });

  it('shows loading and error states without pretending there are none', () => {
    state = { isLoading: true, isError: false };
    const { rerender } = render(<PastTodosPanel meetingId="m" tenantId={1} onReopen={vi.fn()} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    state = { isLoading: false, isError: true };
    rerender(<PastTodosPanel meetingId="m" tenantId={1} onReopen={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Past To-Dos could not be loaded.');
    expect(screen.queryByText(/No completed or cancelled/)).toBeNull();
  });

  it('lists completed and cancelled To-Dos with when, who and the link to a Rock', () => {
    state.data = [todo('a'), todo('b', { status: 'Cancelled', ownerName: null })];
    render(<PastTodosPanel meetingId="m" tenantId={1} onReopen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Past To-Dos \(2\)/ })).toBeInTheDocument();
    expect(screen.getByText(/Completed Mon 12 Oct · Ana/)).toBeInTheDocument();
    expect(screen.getByText(/Cancelled Mon 12 Oct · Unassigned/)).toBeInTheDocument();
    expect(screen.getByTestId('rock-link-a')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
  });

  it('reopens only when the Reopen button is pressed, never from clicking the row', () => {
    const onReopen = vi.fn().mockResolvedValue(undefined);
    state.data = [todo('a')];
    render(<PastTodosPanel meetingId="m" tenantId={1} onReopen={onReopen} />);
    fireEvent.click(screen.getByText('Todo a'));
    expect(onReopen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen: Todo a' }));
    expect(onReopen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('offers a search once the list is long, and says when nothing matches', () => {
    state.data = Array.from({ length: 6 }, (_, i) => todo(String(i), { title: i === 3 ? 'Renew the licence' : `Task ${i}` }));
    render(<PastTodosPanel meetingId="m" tenantId={1} onReopen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search past To-Dos'), { target: { value: 'licence' } });
    expect(screen.getByText('Renew the licence')).toBeInTheDocument();
    expect(screen.queryByText('Task 1')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search past To-Dos'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing matches that search.')).toBeInTheDocument();
  });

  it('has no search box for a short list, and disables Reopen while something is saving', () => {
    state.data = [todo('a')];
    render(<PastTodosPanel meetingId="m" tenantId={1} onReopen={vi.fn()} busy />);
    expect(screen.queryByLabelText('Search past To-Dos')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reopen: Todo a' })).toBeDisabled();
  });
});
