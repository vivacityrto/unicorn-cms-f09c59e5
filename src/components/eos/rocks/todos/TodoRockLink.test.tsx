/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const link = vi.fn();
const unlink = vi.fn();
vi.mock('@/hooks/useRockTodos', () => ({
  useLinkTodoToRock: () => ({ mutateAsync: link, isPending: false }),
  useUnlinkTodo: () => ({ mutateAsync: unlink, isPending: false }),
  useLinkableRocks: () => ({ data: [{ id: 'r1', title: 'Harden RBAC', quarter_year: 2026, quarter_number: 4, rock_level: 'company' }], isLoading: false }),
}));
vi.mock('@/hooks/useRockDiscussion', () => ({
  useRockMilestones: () => ({ data: [{ id: 'm1', title: 'Verify roles' }] }),
}));

import { TodoRockLink } from '@/components/eos/rocks/todos/TodoRockLink';

beforeEach(() => {
  link.mockReset().mockResolvedValue({ link_id: 'l', moved: false });
  unlink.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('TodoRockLink', () => {
  it('shows the Rock and milestone a To-Do is for', () => {
    render(<TodoRockLink todoId="t1" canManage={false} link={{ rockId: 'r1', rockTitle: 'Harden RBAC', milestoneId: 'm1', milestoneTitle: 'Verify roles' }} />);
    expect(screen.getByText('Harden RBAC · Verify roles')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull(); // read-only for people who cannot manage
  });

  it('shows nothing for a standalone To-Do when the viewer cannot manage links', () => {
    const { container } = render(<TodoRockLink todoId="t1" canManage={false} link={undefined} />);
    expect(container.textContent).toBe('');
  });

  it('offers "Link to a Rock" on a standalone To-Do and "Change" on a linked one', () => {
    const { rerender } = render(<TodoRockLink todoId="t1" canManage link={undefined} />);
    expect(screen.getByRole('button', { name: 'Link this To-Do to a Rock' })).toBeInTheDocument();
    rerender(<TodoRockLink todoId="t1" canManage link={{ rockId: 'r1', rockTitle: 'Harden RBAC', milestoneId: null, milestoneTitle: null }} />);
    expect(screen.getByRole('button', { name: 'Change the Rock this To-Do is for' })).toBeInTheDocument();
    expect(screen.getByText('Harden RBAC')).toBeInTheDocument();
  });

  it('does not let a click on the link controls reach the row, which toggles the To-Do', () => {
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><TodoRockLink todoId="t1" canManage link={undefined} /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Link this To-Do to a Rock' }));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('cannot save until a Rock is chosen', () => {
    render(<TodoRockLink todoId="t1" canManage link={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Link this To-Do to a Rock' }));
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('can make a linked To-Do standalone again', async () => {
    render(<TodoRockLink todoId="t1" canManage link={{ rockId: 'r1', rockTitle: 'Harden RBAC', milestoneId: null, milestoneTitle: null }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change the Rock this To-Do is for' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make it standalone' }));
    await waitFor(() => expect(unlink).toHaveBeenCalledWith('t1'));
  });

  it('saves the existing target unchanged when Save is pressed on a linked To-Do', async () => {
    render(<TodoRockLink todoId="t1" canManage link={{ rockId: 'r1', rockTitle: 'Harden RBAC', milestoneId: 'm1', milestoneTitle: 'Verify roles' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change the Rock this To-Do is for' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(link).toHaveBeenCalled());
    expect(link).toHaveBeenCalledWith({ todoId: 't1', rockId: 'r1', milestoneId: 'm1' });
  });
});
