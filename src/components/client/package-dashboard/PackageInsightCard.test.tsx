import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClientPackageDashboardRow } from '@/hooks/use-client-package-dashboard';
import { PackageInsightCard } from './PackageInsightCard';
import { PackageStageStepper } from './PackageStageStepper';
import type { HoursForecast } from './packageInsights';
import type { ClientPackageStageRow } from '@/hooks/use-client-package-stages';

const dashboard = (over: Partial<ClientPackageDashboardRow> = {}) =>
  ({
    package_instance_id: 1, tenant_id: 1, package_name: 'Ruby', package_type: null, progress_mode: null, manager_id: null, is_complete: false,
    start_date: '2026-06-01', end_date: '2027-03-01', hours_included: 40, hours_added: 0, hours_total: 40, hours_used: 39, hours_remaining: 1,
    hours_pct_used: 98, stages_total: 8, stages_complete: 2, current_stage_sortorder: 3, current_stage_shortname: 'Setup', open_tasks: 2,
    overdue_tasks: 1, last_activity_at: '2020-01-01T00:00:00Z', pinned_note_title: null, pinned_note_text: null, pinned_note_priority: null,
    pinned_note_updated_at: null, pinned_note_severity: null, status_pill: 'stuck', ...over,
  }) as ClientPackageDashboardRow;

const forecast: HoursForecast = { verdict: 'early', perWeek: 3.5, runOutDate: '2026-12-09', unusedAtEnd: 0, sentence: 'Your hours would run out around 9 Dec 2026.' };

describe('PackageInsightCard', () => {
  it('explains what Stuck means, why this package has it, and where the hours are heading', () => {
    render(<PackageInsightCard dashboard={dashboard()} forecast={forecast} />);
    const card = screen.getByRole('region', { name: 'How this package is tracking' });
    expect(card).toHaveTextContent('Stuck: Nothing has moved for a month, or almost all hours are used.');
    expect(card).toHaveTextContent('98% of hours used');
    expect(card).toHaveTextContent('Your hours would run out around 9 Dec 2026.');
    expect(card).toHaveTextContent('projection from recent work, not a promise');
  });

  it('says nothing about hours while the forecast is not ready, instead of claiming no hours were recorded', () => {
    render(<PackageInsightCard dashboard={dashboard()} forecast={null} />);
    const card = screen.getByRole('region', { name: 'How this package is tracking' });
    expect(card).toHaveTextContent('Stuck:');
    expect(card).not.toHaveTextContent('last four weeks');
    expect(card).not.toHaveTextContent('projection from recent work');
  });

  it('gives no reason for a package that is on track', () => {
    render(<PackageInsightCard dashboard={dashboard({ status_pill: 'on_track' })} forecast={{ ...forecast, verdict: 'on_pace' }} />);
    expect(screen.getByRole('region', { name: 'How this package is tracking' })).not.toHaveTextContent('Right now:');
  });
});

describe('PackageStageStepper', () => {
  it('shows when a finished stage was completed', () => {
    const stages = [
      { package_instance_id: 1, tenant_id: 1, stage_instance_id: 1, stage_id: 1, stage_sortorder: 1, stage_name: 'Kick-off', stage_shortname: 'Kick-off', stage_description: null, is_recurring: false, is_audit_workspace: false, completion_date: '2026-11-03', raw_status: null, event_conducted_date: null, updated_at: '2026-11-03', node_state: 'complete' },
      { package_instance_id: 1, tenant_id: 1, stage_instance_id: 2, stage_id: 2, stage_sortorder: 2, stage_name: 'Setup', stage_shortname: 'Setup', stage_description: null, is_recurring: false, is_audit_workspace: false, completion_date: null, raw_status: null, event_conducted_date: null, updated_at: '2026-11-03', node_state: 'current' },
    ] as ClientPackageStageRow[];
    render(<PackageStageStepper stages={stages} isLoading={false} isError={false} />);
    expect(screen.getAllByText('3 Nov').length).toBeGreaterThan(0);
  });
});
