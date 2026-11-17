import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  auth: { profile: { user_uuid: 'user-1', unicorn_role: 'CSC' } as { user_uuid: string; unicorn_role: string } },
  tables: {} as Record<string, unknown[]>,
  upsert: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const result = { data: mocks.tables[table] ?? [], error: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve),
        upsert: (rows: unknown, options: unknown) => {
          mocks.upsert(table, rows, options);
          return Promise.resolve({ error: null });
        },
      };
      return chain;
    },
  },
}));

import { NotificationPreferenceMatrix } from '@/components/notifications/NotificationPreferenceMatrix';

const CATEGORIES = [
  { key: 'client_message', label: 'Client messages', default_audience: 'owner', sort_order: 10, is_active: true },
  { key: 'task', label: 'Tasks assigned to you', default_audience: 'assignee', sort_order: 60, is_active: true },
  { key: 'platform_alert', label: 'Platform alerts', default_audience: 'super_admin', sort_order: 70, is_active: true },
];

const roleDefaults = (role: string) =>
  CATEGORIES.flatMap((c) =>
    ['in_app', 'teams', 'email'].map((channel) => ({
      role,
      category: c.key,
      channel,
      enabled: channel !== 'email',
      scope: 'my_and_delegated',
    })),
  );

function renderMatrix() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationPreferenceMatrix />
    </QueryClientProvider>,
  );
}

describe('NotificationPreferenceMatrix', () => {
  beforeEach(() => {
    mocks.upsert.mockClear();
    mocks.auth.profile = { user_uuid: 'user-1', unicorn_role: 'CSC' };
    mocks.tables = {
      notification_category: CATEGORIES,
      notification_preferences: [],
      notification_role_defaults: roleDefaults('CSC'),
    };
  });

  it('shows one row per category with the role defaults: in-app and Teams on, email off', async () => {
    renderMatrix();
    expect(await screen.findByText('Client messages')).toBeInTheDocument();
    expect(screen.getByLabelText('Client messages by In-app')).toBeChecked();
    expect(screen.getByLabelText('Client messages by Teams')).toBeChecked();
    expect(screen.getByLabelText('Client messages by Email')).not.toBeChecked();
  });

  it('shows a whose-clients choice for client categories but not for tasks', async () => {
    renderMatrix();
    await screen.findByText('Client messages');
    expect(screen.getByLabelText('Whose clients: Client messages')).toBeInTheDocument();
    expect(screen.queryByLabelText('Whose clients: Tasks assigned to you')).not.toBeInTheDocument();
  });

  it('hides platform alerts from people who are not Super Admins', async () => {
    renderMatrix();
    await screen.findByText('Client messages');
    expect(screen.queryByText('Platform alerts')).not.toBeInTheDocument();
  });

  it('shows platform alerts to a Super Admin', async () => {
    mocks.auth.profile = { user_uuid: 'user-1', unicorn_role: 'Super Admin' };
    mocks.tables.notification_role_defaults = roleDefaults('Super Admin');
    renderMatrix();
    expect(await screen.findByText('Platform alerts')).toBeInTheDocument();
  });

  it('saves one row when a channel is ticked, keeping the category scope', async () => {
    renderMatrix();
    const email = await screen.findByLabelText('Client messages by Email');
    fireEvent.click(email);
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    const [table, rows, options] = mocks.upsert.mock.calls[0] as [string, Record<string, unknown>[], { onConflict: string }];
    expect(table).toBe('notification_preferences');
    expect(options).toEqual({ onConflict: 'user_id,category,channel' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      category: 'client_message',
      channel: 'email',
      enabled: true,
      scope: 'my_and_delegated',
    });
  });

  it('uses the person’s own saved choice over the role default', async () => {
    mocks.tables.notification_preferences = [
      { user_id: 'user-1', category: 'client_message', channel: 'teams', enabled: false, scope: 'my_and_delegated' },
    ];
    renderMatrix();
    await screen.findByText('Client messages');
    expect(screen.getByLabelText('Client messages by Teams')).not.toBeChecked();
    expect(screen.getByLabelText('Client messages by In-app')).toBeChecked();
  });

  it('disables the channels for a category that is switched off', async () => {
    mocks.tables.notification_preferences = ['in_app', 'teams', 'email'].map((channel) => ({
      user_id: 'user-1',
      category: 'client_message',
      channel,
      enabled: true,
      scope: 'off',
    }));
    renderMatrix();
    await screen.findByText('Client messages');
    expect(screen.getByLabelText('Client messages by In-app')).toBeDisabled();
    expect(screen.getByLabelText('Client messages by In-app')).not.toBeChecked();
  });
});
