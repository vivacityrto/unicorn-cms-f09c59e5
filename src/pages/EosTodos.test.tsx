import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EosTodos from './EosTodos';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn() }));
vi.mock('@/hooks/useEos', () => ({ useEosTodos: () => ({
  todos: [{ id: 'todo-1', title: 'Verify export', description: 'Old description', status: 'Complete', created_at: '2026-11-01T00:00:00Z' }],
  isLoading: false, updateTodo: mocks,
}) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { unicorn_role: 'Super Admin' } }) }));
vi.mock('@/hooks/useRockTodos', () => ({ useTodoRockLinks: () => ({ data: {} }) }));
vi.mock('@/components/eos/rocks/todos/TodoRockLink', () => ({ TodoRockLink: () => null }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.mutateAsync.mockResolvedValue({}); });

function openEditor() {
  render(<EosTodos />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

describe('To-Do editing', () => {
  it('opens existing values and saves only title and description, preserving completion', async () => {
    openEditor();
    expect(screen.getByLabelText('Title')).toHaveValue('Verify export');
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Accepted snapshot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: 'todo-1', title: 'Verify export', description: 'Accepted snapshot' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('cancels without saving and reopens original values', () => {
    openEditor();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Verify export');
  });
  it('rejects a blank title', () => {
    openEditor();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
  it('preserves draft and reports a rejected save', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('Permission denied'));
    openEditor();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.getByLabelText('Description')).toHaveValue('Keep this draft');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('does not submit duplicate requests while saving', async () => {
    let resolve!: (value: object) => void;
    mocks.mutateAsync.mockImplementation(() => new Promise(r => { resolve = r; }));
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saving...' }));
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    resolve({});
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
