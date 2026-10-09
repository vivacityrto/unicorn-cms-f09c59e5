import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchDetail, PreviewResponse, TeamsEventSummary } from '@/services/teamsEventsService';

const service = vi.hoisted(() => ({
  listEvents: vi.fn(),
  previewGroup: vi.fn(),
  registerGroup: vi.fn(),
  getBatch: vi.fn(),
  retryFailures: vi.fn(),
  cancelRegistrations: vi.fn(),
}));

vi.mock('@/services/teamsEventsService', async () => {
  const actual = await vi.importActual<typeof import('@/services/teamsEventsService')>('@/services/teamsEventsService');
  return { ...actual, teamsEventsService: service };
});

// Radix Select needs pointer APIs jsdom lacks; a native <select> exercises the same props.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select aria-label="Contact Directory Group" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">Choose a group</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { TeamsEventsError } from '@/services/teamsEventsService';
import { RegisterTeamsEventDialog } from '../RegisterTeamsEventDialog';

const EVENT: TeamsEventSummary = {
  id: 'evt-1@tenant',
  eventType: 'webinar',
  displayName: 'Compliance Update Webinar',
  status: 'published',
  startUtc: '2026-10-19T23:00:00.000Z', // 20 Oct 2026, 10:00 am AEDT
  endUtc: '2026-10-20T00:00:00.000Z',
  organiserId: 'u1',
  organiserName: 'Dave Richards',
  timeZoneAssumed: false,
};

const preview = (over: Partial<PreviewResponse> = {}): PreviewResponse => ({
  event: EVENT,
  group: { id: 7, name: 'Leadership Team' },
  counts: { members: 5, eligible: 3, to_register: 3, already_processed: 0, excluded: 1, duplicate: 1 },
  to_register: [],
  already_processed: [],
  excluded: [
    {
      member_key: 'contact:9',
      source: 'contact',
      tenant_id: 1,
      first_name: 'Ex',
      last_name: 'Cluded',
      email: 'bad',
      reason: 'invalid_email',
    },
  ],
  duplicates: [],
  list_cap: 300,
  questions_check: 'ok',
  required_questions: [],
  blocked: false,
  preview_token: 'signed-token',
  expires_in_seconds: 600,
  ...over,
});

const batch = (over: Partial<BatchDetail> = {}): BatchDetail => ({
  batch: {
    id: 'b-1',
    event_type: 'webinar',
    graph_event_id: EVENT.id,
    event_display_name: EVENT.displayName,
    event_start_datetime: EVENT.startUtc,
    group_id: 7,
    group_name: 'Leadership Team',
    eligible_count: 3,
    submitted_count: 3,
    success_count: 3,
    skipped_count: 2,
    failure_count: 0,
    status: 'completed',
    created_at: '2026-10-08T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
    completed_at: '2026-10-08T00:00:00Z',
  },
  counts: { pending: 0, registered: 3, invited: 0, already_processed: 0, excluded: 1, duplicate: 1, failed: 0 },
  items: [],
  items_truncated: false,
  stalled: false,
  can_retry: false,
  ...over,
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegisterTeamsEventDialog
        open
        onOpenChange={vi.fn()}
        groups={[
          { id: 7, name: 'Leadership Team', member_count: 5 },
          { id: 8, name: 'Everyone', member_count: 400 },
        ]}
      />
    </QueryClientProvider>,
  );
}

async function chooseEventAndGroup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: /Compliance Update Webinar/ }));
  await user.selectOptions(screen.getByLabelText('Contact Directory Group'), '7');
}

describe('RegisterTeamsEventDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listEvents.mockResolvedValue({
      events: [EVENT],
      window: { from: '2026-10-08T00:00:00Z', to: '2026-10-22T00:00:00Z' },
      fetched_at: '2026-10-08T00:00:00Z',
    });
  });

  it('lists upcoming webinars in Australia/Sydney and keeps Meetings disabled', async () => {
    renderDialog();
    expect(await screen.findByText('Compliance Update Webinar')).toBeInTheDocument();
    expect(screen.getByText(/20 October 2026 at 10:00 am AEDT/)).toBeInTheDocument();
    expect(screen.getByText(/Dave Richards/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meetings' })).toBeDisabled();
    expect(service.listEvents).toHaveBeenCalledWith('webinar');
  });

  it('shows each webinar’s description and registrant count, and says when counts are unavailable', async () => {
    const second: TeamsEventSummary = {
      ...EVENT,
      id: 'evt-2@tenant',
      displayName: 'Strengthening Industry Partnerships',
      description: null,
      registrants: null,
    };
    service.listEvents.mockResolvedValue({
      events: [
        {
          ...EVENT,
          description: 'How to govern AI use across your RTO.',
          registrants: { registered: 12, pending: 2, capped: false },
        },
        second,
      ],
      window: { from: '2026-10-08T00:00:00Z', to: '2026-10-22T00:00:00Z' },
      fetched_at: '2026-10-08T00:00:00Z',
    });
    renderDialog();
    expect(await screen.findByText('How to govern AI use across your RTO.')).toBeInTheDocument();
    expect(screen.getByText('12 registered · 2 pending')).toBeInTheDocument();
    expect(screen.getByText('Registrants not available')).toBeInTheDocument();
  });

  it('lists upcoming webinars that were not listed, with the reason', async () => {
    service.listEvents.mockResolvedValue({
      events: [EVENT],
      diagnostics: {
        graph_total: 3,
        status_counts: { published: 2, draft: 1 },
        published_in_window: 1,
        published_before_window: 0,
        published_after_window: 1,
        published_without_start: 0,
        earliest_published_start_utc: null,
        latest_published_start_utc: null,
        not_listed: [
          { display_name: 'Dave’s draft webinar', status: 'draft', start_utc: '2026-10-20T00:00:00Z', reason: 'not_published' },
          { display_name: 'December webinar', status: 'published', start_utc: '2026-12-07T04:00:00Z', reason: 'starts_after_window' },
        ],
      },
      window: { from: '2026-10-08T00:00:00Z', to: '2026-10-22T00:00:00Z' },
      fetched_at: '2026-10-08T00:00:00Z',
    });
    renderDialog();
    expect(await screen.findByText('Upcoming webinars not listed (2)')).toBeInTheDocument();
    expect(screen.getByText('Dave’s draft webinar')).toBeInTheDocument();
    expect(screen.getByText(/Not published \(draft\)/)).toBeInTheDocument();
    expect(screen.getByText(/Starts more than 14 days from now/)).toBeInTheDocument();
  });

  it('offers to manage the chosen group (members, remove, add) without leaving the modal', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RegisterTeamsEventDialog
          open
          onOpenChange={vi.fn()}
          groups={[{ id: 7, name: 'Leadership Team', member_count: 1 }]}
          directory={[
            {
              row_key: 'user:1',
              source: 'user',
              tenant_id: 10,
              tenant_name: 'Acme RTO',
              first_name: 'Amanda',
              last_name: 'Hardy',
              email: 'amanda@example.com',
              position_type: null,
              status: 'active',
            },
          ]}
          groupMembers={[{ group_id: 7, member_type: 'user', member_id: '1' }]}
          clients={[{ id: 10, name: 'Acme RTO' }]}
          positionTypeOptions={[]}
          onGroupChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/Manage this group/)).not.toBeInTheDocument();
    await user.selectOptions(await screen.findByLabelText('Contact Directory Group'), '7');
    expect(await screen.findByText('Manage this group (1)')).toBeInTheDocument();
    expect(screen.getByText('Amanda Hardy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Amanda Hardy from Leadership Team' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search the directory to add people')).toBeInTheDocument();
  });

  it('skips a group member for this event only, re-previews, and registers with the skip', async () => {
    const user = userEvent.setup();
    const amanda = { member_key: 'user:1', source: 'user' as const, tenant_id: 1, first_name: 'Amanda', last_name: 'Hardy', email: 'amanda@example.com', inclusion: 'group' as const };
    const ben = { member_key: 'contact:2', source: 'contact' as const, tenant_id: 1, first_name: 'Ben', last_name: 'Carter', email: 'ben@beta.com', inclusion: 'group' as const };
    service.previewGroup.mockImplementation((_event: string, _group: number, changes?: { skippedKeys: string[] }) => {
      const skipped = changes?.skippedKeys?.includes('user:1');
      return Promise.resolve(
        preview({
          counts: { members: 2, eligible: 2, to_register: skipped ? 1 : 2, already_processed: 0, excluded: 0, duplicate: 0, extras: 0, skipped: skipped ? 1 : 0 },
          to_register: skipped ? [ben] : [amanda, ben],
          excluded: skipped ? [{ ...amanda, reason: 'skipped_for_event' }] : [],
        }),
      );
    });
    service.registerGroup.mockResolvedValue({ batch_id: 'b-1', status: 'processing' });
    service.getBatch.mockResolvedValue(batch());
    renderDialog();

    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(await screen.findByRole('button', { name: 'Skip Amanda Hardy for this event' }));

    await waitFor(() =>
      expect(service.previewGroup).toHaveBeenLastCalledWith('evt-1@tenant', 7, { extraKeys: [], skippedKeys: ['user:1'] }),
    );
    expect(await screen.findByText('Skipped for this event only (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo skip for Amanda Hardy' })).toBeInTheDocument();
    expect(screen.getByText(/1 skipped for this event/)).toBeInTheDocument();
    expect(screen.queryByText(/^Excluded \(/)).not.toBeInTheDocument(); // a skip is not an "exclusion"

    await user.click(screen.getByRole('button', { name: 'Confirm and register' }));
    expect(service.registerGroup).toHaveBeenCalledWith('evt-1@tenant', 7, 'signed-token', {
      extraKeys: [],
      skippedKeys: ['user:1'],
    });
  });

  it('cancels someone’s existing registration from the preview, then leaves them out of this event', async () => {
    const user = userEvent.setup();
    const amanda = { member_key: 'user:1', source: 'user' as const, tenant_id: 1, first_name: 'Amanda', last_name: 'Hardy', email: 'amanda@example.com', inclusion: 'group' as const };
    service.previewGroup.mockImplementation((_e: string, _g: number, changes?: { skippedKeys: string[] }) => {
      const skipped = changes?.skippedKeys?.includes('user:1');
      return Promise.resolve(
        preview({
          counts: { members: 1, eligible: 1, to_register: 0, already_processed: skipped ? 0 : 1, excluded: 0, duplicate: 0, extras: 0, skipped: skipped ? 1 : 0 },
          already_processed: skipped ? [] : [amanda],
          excluded: skipped ? [{ ...amanda, reason: 'skipped_for_event' }] : [],
        }),
      );
    });
    service.cancelRegistrations.mockResolvedValue({
      event: { id: 'evt-1@tenant' },
      outcomes: [{ member_key: 'user:1', status: 'cancelled' }],
      counts: { cancelled: 1, not_registered: 0, failed: 0 },
    });
    renderDialog();
    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    await user.click(await screen.findByRole('button', { name: 'Cancel Amanda Hardy’s registration'.replace('’', "'") }));
    expect(await screen.findByText(/Teams will treat them as no longer registered/)).toBeInTheDocument();
    expect(service.cancelRegistrations).not.toHaveBeenCalled(); // confirms first

    await user.click(screen.getByRole('button', { name: 'Cancel registration' }));
    await waitFor(() => expect(service.cancelRegistrations).toHaveBeenCalledWith('evt-1@tenant', ['user:1']));
    expect(await screen.findByText('Amanda Hardy: registration cancelled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    // They are now off the event, so the new preview skips them instead of registering them again.
    await waitFor(() =>
      expect(service.previewGroup).toHaveBeenLastCalledWith('evt-1@tenant', 7, { extraKeys: [], skippedKeys: ['user:1'] }),
    );
  });

  it('keeps someone registered when you choose Keep registered', async () => {
    const user = userEvent.setup();
    const amanda = { member_key: 'user:1', source: 'user' as const, tenant_id: 1, first_name: 'Amanda', last_name: 'Hardy', email: 'amanda@example.com', inclusion: 'group' as const };
    service.previewGroup.mockResolvedValue(
      preview({
        counts: { members: 1, eligible: 1, to_register: 0, already_processed: 1, excluded: 0, duplicate: 0 },
        already_processed: [amanda],
      }),
    );
    renderDialog();
    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(await screen.findByRole('button', { name: "Cancel Amanda Hardy's registration" }));
    await user.click(await screen.findByRole('button', { name: 'Keep registered' }));
    expect(service.cancelRegistrations).not.toHaveBeenCalled();
  });

  it('undoing a skip previews again without it', async () => {
    const user = userEvent.setup();
    const amanda = { member_key: 'user:1', source: 'user' as const, tenant_id: 1, first_name: 'Amanda', last_name: 'Hardy', email: 'amanda@example.com', inclusion: 'group' as const };
    service.previewGroup.mockImplementation((_e: string, _g: number, changes?: { skippedKeys: string[] }) => {
      const skipped = changes?.skippedKeys?.includes('user:1');
      return Promise.resolve(
        preview({
          counts: { members: 1, eligible: 1, to_register: skipped ? 0 : 1, already_processed: 0, excluded: 0, duplicate: 0, extras: 0, skipped: skipped ? 1 : 0 },
          to_register: skipped ? [] : [amanda],
          excluded: skipped ? [{ ...amanda, reason: 'skipped_for_event' }] : [],
        }),
      );
    });
    renderDialog();
    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(await screen.findByRole('button', { name: 'Skip Amanda Hardy for this event' }));
    await user.click(await screen.findByRole('button', { name: 'Undo skip for Amanda Hardy' }));
    await waitFor(() =>
      expect(service.previewGroup).toHaveBeenLastCalledWith('evt-1@tenant', 7, { extraKeys: [], skippedKeys: [] }),
    );
    expect(await screen.findByRole('button', { name: 'Skip Amanda Hardy for this event' })).toBeInTheDocument();
  });

  it('includes someone in this event only: not in the group, sent as a key, and removable', async () => {
    const user = userEvent.setup();
    service.previewGroup.mockResolvedValue(
      preview({
        counts: { members: 1, eligible: 2, to_register: 2, already_processed: 0, excluded: 0, duplicate: 0, extras: 1, skipped: 0 },
        to_register: [
          { member_key: 'contact:2', source: 'contact', tenant_id: 11, first_name: 'Ben', last_name: 'Carter', email: 'ben@beta.com', inclusion: 'extra' },
        ],
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RegisterTeamsEventDialog
          open
          onOpenChange={vi.fn()}
          groups={[{ id: 7, name: 'Leadership Team', member_count: 1 }]}
          directory={[
            { row_key: 'user:1', source: 'user', tenant_id: 10, tenant_name: 'Acme RTO', first_name: 'Amanda', last_name: 'Hardy', email: 'amanda@example.com', position_type: null, status: 'active' },
            { row_key: 'contact:2', source: 'contact', tenant_id: 11, tenant_name: 'Beta College', first_name: 'Ben', last_name: 'Carter', email: 'ben@beta.com', position_type: null, status: 'active' },
          ]}
          groupMembers={[{ group_id: 7, member_type: 'user', member_id: '1' }]}
          clients={[{ id: 10, name: 'Acme RTO' }]}
          positionTypeOptions={[]}
          onGroupChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('radio', { name: /Compliance Update Webinar/ }));
    await user.selectOptions(screen.getByLabelText('Contact Directory Group'), '7');
    expect(await screen.findByText('Include others in this event only (0)')).toBeInTheDocument();

    // A group member is already included, so is never offered as an extra.
    await user.type(screen.getByLabelText('Search the directory to include in this event'), 'amanda');
    expect(await screen.findByText(/Nobody active matches, or they are already included/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search the directory to include in this event'));

    await user.type(screen.getByLabelText('Search the directory to include in this event'), 'ben');
    await user.click(await screen.findByRole('button', { name: 'Include Ben Carter in this event' }));
    expect(screen.getByText('Include others in this event only (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Ben Carter from this event' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() =>
      expect(service.previewGroup).toHaveBeenCalledWith('evt-1@tenant', 7, { extraKeys: ['contact:2'], skippedKeys: [] }),
    );
    expect(await screen.findByText('This event only')).toBeInTheDocument();
    expect(screen.getByText(/1 added for this event/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Ben Carter from this event' })).toBeInTheDocument();
  });

  it('changing the group clears event-only changes', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RegisterTeamsEventDialog
          open
          onOpenChange={vi.fn()}
          groups={[
            { id: 7, name: 'Leadership Team', member_count: 0 },
            { id: 8, name: 'Everyone', member_count: 0 },
          ]}
          directory={[
            { row_key: 'contact:2', source: 'contact', tenant_id: 11, tenant_name: 'Beta College', first_name: 'Ben', last_name: 'Carter', email: 'ben@beta.com', position_type: null, status: 'active' },
          ]}
          groupMembers={[]}
          clients={[]}
          positionTypeOptions={[]}
          onGroupChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await user.selectOptions(await screen.findByLabelText('Contact Directory Group'), '7');
    await user.type(screen.getByLabelText('Search the directory to include in this event'), 'ben');
    await user.click(await screen.findByRole('button', { name: 'Include Ben Carter in this event' }));
    expect(screen.getByText('Include others in this event only (1)')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Contact Directory Group'), '8');
    expect(await screen.findByText('Include others in this event only (0)')).toBeInTheDocument();
  });

  it('needs both an event and a group before Preview is enabled', async () => {
    const user = userEvent.setup();
    renderDialog();
    const previewButton = await screen.findByRole('button', { name: 'Preview' });
    expect(previewButton).toBeDisabled();
    await user.click(await screen.findByRole('radio', { name: /Compliance Update Webinar/ }));
    expect(previewButton).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Contact Directory Group'), '7');
    expect(previewButton).toBeEnabled();
  });

  it('previews, shows the explicit confirmation, registers and shows results', async () => {
    const user = userEvent.setup();
    service.previewGroup.mockResolvedValue(preview());
    service.registerGroup.mockResolvedValue({ batch_id: 'b-1', status: 'processing' });
    service.getBatch.mockResolvedValue(batch());
    renderDialog();

    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(service.previewGroup).toHaveBeenCalledWith('evt-1@tenant', 7, { extraKeys: [], skippedKeys: [] });
    expect(
      await screen.findByText('Register 3 people for “Compliance Update Webinar” on 20 October 2026 at 10:00 am?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Group: Leadership Team')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm and register' }));
    // Only ids and the signed token cross the wire — never member lists or counts.
    expect(service.registerGroup).toHaveBeenCalledWith('evt-1@tenant', 7, 'signed-token', {
      extraKeys: [],
      skippedKeys: [],
    });
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 processed')).toBeInTheDocument();
  });

  it('blocks confirmation when the webinar has required registration questions', async () => {
    const user = userEvent.setup();
    service.previewGroup.mockResolvedValue(preview({ blocked: true, questions_check: 'blocked', required_questions: ['Company'] }));
    renderDialog();
    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText(/Required registration questions: Company/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm and register' })).toBeDisabled();
  });

  it('cannot confirm when nobody is left to register', async () => {
    const user = userEvent.setup();
    service.previewGroup.mockResolvedValue(
      preview({ counts: { members: 2, eligible: 2, to_register: 0, already_processed: 2, excluded: 0, duplicate: 0 } }),
    );
    renderDialog();
    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText(/Register 0 people/);
    expect(screen.getByRole('button', { name: 'Confirm and register' })).toBeDisabled();
  });

  it('sends the operator back to select when the group changed since the preview', async () => {
    const user = userEvent.setup();
    service.previewGroup.mockResolvedValue(preview());
    service.registerGroup.mockRejectedValue(
      new TeamsEventsError('The group’s members changed since the preview.', 'membership_changed', 409),
    );
    renderDialog();
    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm and register' }));

    expect(await screen.findByText('Nobody was registered')).toBeInTheDocument();
    expect(screen.getByText(/members changed since the preview/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
  });

  it('shows a clear message when Teams events cannot be loaded', async () => {
    service.listEvents.mockRejectedValue(
      new TeamsEventsError('The Teams event integration has not been configured yet.', 'not_configured', 503),
    );
    renderDialog();
    expect(await screen.findByText('Could not load Teams events')).toBeInTheDocument();
    expect(screen.getByText(/has not been configured yet/)).toBeInTheDocument();
  });

  it('shows failures with a retry action on a finished batch', async () => {
    const user = userEvent.setup();
    service.previewGroup.mockResolvedValue(preview());
    service.registerGroup.mockResolvedValue({ batch_id: 'b-1', status: 'processing' });
    service.getBatch.mockResolvedValue(
      batch({
        batch: { ...batch().batch, status: 'completed_with_errors', failure_count: 1, success_count: 2 },
        counts: { pending: 0, registered: 2, invited: 0, already_processed: 0, excluded: 1, duplicate: 1, failed: 1 },
        items: [
          {
            id: 'i-1',
            result_status: 'failed',
            normalised_email: 'amanda@example.com',
            first_name: 'Amanda',
            last_name: 'Hardy',
            tenant_id: 1,
            exclusion_reason: null,
            error_code: 'throttling',
            error_message: 'Microsoft is rate-limiting requests. Retry in a few minutes.',
            attempt_count: 3,
          },
        ],
        can_retry: true,
      }),
    );
    service.retryFailures.mockResolvedValue({ batch_id: 'b-1', status: 'processing', retried: 1 });
    renderDialog();
    await chooseEventAndGroup(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm and register' }));

    expect(await screen.findByText('Completed with errors')).toBeInTheDocument();
    expect(screen.getByText('Amanda Hardy')).toBeInTheDocument();
    expect(screen.getByText(/rate-limiting/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Retry failed/ }));
    await waitFor(() => expect(service.retryFailures).toHaveBeenCalledWith('b-1'));
  });
});
