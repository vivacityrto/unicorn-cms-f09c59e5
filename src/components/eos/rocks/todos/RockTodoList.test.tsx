/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RockTodo } from '@/utils/rockTodos';

const add = vi.fn();
const link = vi.fn();
const unlink = vi.fn();
const setDone = vi.fn();
let linkable: Array<{ id: string; title: string; due_date: string | null }> = [];
let meetingId: string | undefined;

vi.mock('@/hooks/useRockTodos', () => ({
  defaultTodoDueDate: () => '2026-11-05',
  useAddRockTodo: () => ({ mutateAsync: add, isPending: false }),
  useLinkTodoToRock: () => ({ mutateAsync: link, isPending: false }),
  useUnlinkTodo: () => ({ mutate: unlink, isPending: false }),
  useSetTodoDone: () => ({ mutate: setDone, isPending: false }),
  useLinkableTodos: () => ({ data: linkable, isLoading: false }),
}));
vi.mock('@/components/eos/rocks/notes/RockNotesDictation', () => ({
  useOptionalRockNotesDictation: () => (meetingId ? { meetingId } : null),
}));
vi.mock('@/utils/localDate', () => ({ todayLocalIso: () => '2026-10-29' }));

import { RockTodoList } from '@/components/eos/rocks/todos/RockTodoList';

const rock = { id: 'r1', title: 'Harden RBAC' };
const milestone = { id: 'm1', title: 'Verify roles' };
const todo = (id: string, over: Partial<RockTodo> = {}): RockTodo => ({
  todoId: id, linkId: `l-${id}`, rockId: 'r1', milestoneId: 'm1', title: `Todo ${id}`, status: 'Open', dueDate: '2026-11-05', ownerId: 'u1', ownerName: 'Ana', ...over,
});

beforeEach(() => {
  [add, link, unlink, setDone].forEach(fn => fn.mockReset());
  add.mockResolvedValue({ todo_id: 't', link_id: 'l', duplicate: false });
  link.mockResolvedValue({ link_id: 'l', moved: false });
  linkable = [];
  meetingId = undefined;
});
afterEach(cleanup);

describe('RockTodoList', () => {
  it('counts done To-Dos, flags overdue ones in words, and lists overdue first', () => {
    render(<RockTodoList rock={rock} milestone={milestone} canManage todos={[todo('b'), todo('a', { dueDate: '2026-10-01' }), todo('c', { status: 'Complete' })]} />);
    expect(screen.getByText(/To-Dos · 1 of 3 done/)).toBeInTheDocument();
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0].textContent).toContain('Todo a');
    expect(items[0].textContent).toContain('Overdue');
    expect(items[2].textContent).toContain('Todo c');
  });

  it('ticks a To-Do done and open again', () => {
    render(<RockTodoList rock={rock} milestone={milestone} canManage todos={[todo('a'), todo('c', { status: 'Complete' })]} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark as done: Todo a' }));
    expect(setDone).toHaveBeenCalledWith({ todoId: 'a', done: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark as not done: Todo c' }));
    expect(setDone).toHaveBeenCalledWith({ todoId: 'c', done: false });
  });

  it('is read-only for someone who cannot manage the Rock, and says nothing when there is nothing', () => {
    const { container, rerender } = render(<RockTodoList rock={rock} milestone={milestone} canManage={false} todos={[todo('a')]} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Add a To-Do/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove the link/ })).toBeNull();
    rerender(<RockTodoList rock={rock} milestone={milestone} canManage={false} todos={[]} />);
    expect(container.textContent).toBe('');
  });

  it('adds a To-Do for this milestone, owned by the caller, and shows no meeting note outside a meeting', async () => {
    render(<RockTodoList rock={rock} milestone={milestone} canManage todos={[]} />);
    expect(screen.getByText('No To-Dos for this milestone yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add a To-Do/ }));
    expect(screen.getByText('Owned by you.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New To-Do for this milestone'), { target: { value: '  Chase the supplier ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledWith({ rockId: 'r1', milestoneId: 'm1', title: 'Chase the supplier', dueDate: '2026-11-05', meetingId: undefined });
  });

  it('adds a Rock-level To-Do inside a meeting and attaches it to that meeting', async () => {
    meetingId = 'meeting-1';
    render(<RockTodoList rock={rock} todos={[]} canManage />);
    expect(screen.getByText('To-Dos for this Rock')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add a To-Do/ }));
    expect(screen.getByText('Owned by you and added to this meeting.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New To-Do for this Rock'), { target: { value: 'Send the plan' } });
    fireEvent.submit(screen.getByLabelText('New To-Do for this Rock').closest('form')!);
    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ rockId: 'r1', milestoneId: undefined, meetingId: 'meeting-1' }));
  });

  it('keeps what was typed when adding fails, and does not add a blank To-Do', async () => {
    add.mockRejectedValue(new Error('nope'));
    render(<RockTodoList rock={rock} milestone={milestone} canManage todos={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Add a To-Do/ }));
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    const box = screen.getByLabelText('New To-Do for this milestone') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'Keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(add).toHaveBeenCalled());
    expect((screen.getByLabelText('New To-Do for this milestone') as HTMLInputElement).value).toBe('Keep me');
  });

  it('links an existing To-Do to this milestone', async () => {
    linkable = [{ id: 't9', title: 'Standalone follow-up', due_date: null }];
    render(<RockTodoList rock={rock} milestone={milestone} canManage todos={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Link an existing To-Do/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(link).toHaveBeenCalled());
    expect(link).toHaveBeenCalledWith({ todoId: 't9', rockId: 'r1', milestoneId: 'm1' });
  });

  it('says plainly when there is nothing to link', () => {
    render(<RockTodoList rock={rock} milestone={milestone} canManage todos={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Link an existing To-Do/ }));
    expect(screen.getByText('There are none. Add a new To-Do instead.')).toBeInTheDocument();
  });

  it('removes only the link, with words that say the To-Do stays', () => {
    render(<RockTodoList rock={rock} milestone={milestone} canManage todos={[todo('a')]} />);
    const button = screen.getByRole('button', { name: /Remove the link to this milestone: Todo a/ });
    expect(button.getAttribute('title')).toMatch(/the To-Do itself stays/);
    fireEvent.click(button);
    expect(unlink).toHaveBeenCalledWith('a');
  });
});
