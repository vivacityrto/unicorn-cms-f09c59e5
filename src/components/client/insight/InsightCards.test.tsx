import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { summariseTasks } from '@/components/client/tasks/taskInsights';
import { TaskFilterCards, TasksBanner, TasksInsightPanel } from '@/components/client/tasks/TasksOverview';
import { summariseUsers } from '@/components/client/users/userInsights';
import { UserFilterCards, UsersBanner } from '@/components/client/users/UsersOverview';

describe('Tasks overview', () => {
  const summary = summariseTasks([], new Date('2026-11-19'));
  it('shows the cards as toggle buttons and reports the one chosen', async () => {
    const onSelect = vi.fn();
    render(<TaskFilterCards summary={summary} counts={{ all: 5, overdue: 2, due_soon: 1, completed: 0 }} active="all" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /All tasks/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Overdue/ }));
    expect(onSelect).toHaveBeenCalledWith('overdue');
  });

  it('banner toggles my tasks and says what is late', async () => {
    const onToggle = vi.fn();
    const late = { ...summary, total: 3, open: 3, overdue: 2 };
    render(<TasksBanner summary={late} mineCount={4} mineOnly={false} onToggleMine={onToggle} archivedControl={null} />);
    expect(screen.getByText(/2 tasks are overdue/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /My tasks · 4/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('renders nothing for the panel when there are no tasks', () => {
    const { container } = render(<TasksInsightPanel summary={summary} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Users overview', () => {
  const summary = summariseUsers([], new Date('2026-11-19'));
  it('cards filter and the banner shows seats', async () => {
    const onSelect = vi.fn();
    render(
      <>
        <UsersBanner summary={summary} capacity={{ used: 3, limit: 5, isUnlimited: false, atLimit: false }} action={<button>Invite</button>} />
        <UserFilterCards summary={summary} active="all" onSelect={onSelect} />
      </>,
    );
    expect(screen.getByText('3 of 5 seats used')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Quiet/ }));
    expect(onSelect).toHaveBeenCalledWith('quiet');
  });
});
