/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

const shown: Array<{ title?: string; description?: string; duration?: number; action?: ReactElement; dismiss: ReturnType<typeof vi.fn> }> = [];
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn((props: { title?: string; description?: string; duration?: number; action?: ReactElement }) => {
    const entry = { ...props, dismiss: vi.fn() };
    shown.push(entry);
    return { id: String(shown.length), dismiss: entry.dismiss, update: vi.fn() };
  }),
}));
vi.mock('@/components/ui/toast', () => ({
  ToastAction: ({ children, onClick, altText }: { children: string; onClick: () => void; altText: string }) => (
    <button type="button" aria-label={altText} onClick={onClick}>{children}</button>
  ),
}));

import { UNDO_VISIBLE_MS, useTodoToggleWithUndo } from '@/hooks/useTodoToggleWithUndo';

const setup = (mutate = vi.fn().mockResolvedValue({})) => {
  const afterChange = vi.fn();
  const { result } = renderHook(() => useTodoToggleWithUndo({ mutateAsync: mutate }, afterChange));
  return { toggle: result.current, mutate, afterChange };
};
const lastToast = () => shown[shown.length - 1];
const pressUndo = async () => {
  render(lastToast().action as ReactElement);
  await act(async () => { screen.getByRole('button', { name: /^Undo:/ }).click(); });
};

beforeEach(() => { shown.length = 0; });

describe('useTodoToggleWithUndo', () => {
  it('marks an open To-Do done, quietly, and offers Undo for a few seconds', async () => {
    const { toggle, mutate, afterChange } = setup();
    await toggle({ id: 't1', title: 'Send the plan', status: 'Open', completed_at: null });
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', status: 'Complete', quiet: true, completed_at: expect.any(String) }));
    expect(afterChange).toHaveBeenCalledTimes(1);
    expect(lastToast()).toMatchObject({ title: 'Marked done', description: 'Send the plan', duration: UNDO_VISIBLE_MS });
  });

  it('marks a done To-Do not done, clearing its completion time', async () => {
    const { toggle, mutate } = setup();
    await toggle({ id: 't1', title: 'Send the plan', status: 'Complete', completed_at: '2026-10-28T01:00:00Z' });
    expect(mutate).toHaveBeenCalledWith({ id: 't1', status: 'Open', completed_at: null, quiet: true });
    expect(lastToast().title).toBe('Marked not done');
  });

  it('Undo of marking done puts back exactly what was there: open, with no completion time', async () => {
    const { toggle, mutate, afterChange } = setup();
    await toggle({ id: 't1', title: 'Send the plan', status: 'Open', completed_at: null });
    await pressUndo();
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', status: 'Open', completed_at: null, quiet: true });
    expect(lastToast().dismiss).toBeDefined();
    expect(shown[0].dismiss).toHaveBeenCalled(); // the Undo toast is closed
    expect(afterChange).toHaveBeenCalledTimes(2);
    expect(lastToast().title).toBe('Undone');
  });

  it('Undo of marking not done restores the original completion time, not a new one', async () => {
    const { toggle, mutate } = setup();
    await toggle({ id: 't1', title: 'Send the plan', status: 'Complete', completed_at: '2026-10-28T01:00:00Z' });
    await pressUndo();
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', status: 'Complete', completed_at: '2026-10-28T01:00:00Z', quiet: true });
  });

  it('shows no toast and no Undo when the change fails', async () => {
    const { toggle } = setup(vi.fn().mockRejectedValue(new Error('nope')));
    await expect(toggle({ id: 't1', title: 'x', status: 'Open', completed_at: null })).rejects.toThrow('nope');
    expect(shown).toHaveLength(0);
  });

  it('does not say Undone if the undo itself fails', async () => {
    const mutate = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('nope'));
    const { toggle } = setup(mutate);
    await toggle({ id: 't1', title: 'x', status: 'Open', completed_at: null });
    await pressUndo();
    expect(shown.some(t => t.title === 'Undone')).toBe(false);
  });

  it('Undo of a cancelled To-Do that was toggled puts it back to Cancelled, not Open', async () => {
    const { toggle, mutate } = setup();
    await toggle({ id: 't1', title: 'Dropped idea', status: 'Cancelled', completed_at: null });
    await pressUndo();
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', status: 'Cancelled', completed_at: null, quiet: true });
  });

  it('a To-Do with no status is treated as open and restored as open', async () => {
    const { toggle, mutate } = setup();
    await toggle({ id: 't1', title: 'x', status: null, completed_at: null });
    await pressUndo();
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', status: 'Open', completed_at: null, quiet: true });
  });
});

