/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// SPIKE test: the panel against a mocked Supabase client and a mocked TGA hook.
const rpc = vi.fn();
let intakeRow: unknown = null;
let tgaSummary: { fetched_at: string | null } | null = { fetched_at: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = async () => ({
        data: table === 'tenants' ? { rto_number: '12345' } : table === 'tas_intake' ? intakeRow : null,
        error: null,
      });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
      return chain;
    },
  },
}));

vi.mock('@/hooks/useTgaRtoData', () => ({
  useTgaRtoData: () => ({
    summary: tgaSummary,
    qualifications: [{ id: 'q1', qualification_code: 'BSB50120', qualification_title: 'Diploma of Business' }],
  }),
}));

import { TasIntakeSpikePanel } from '../TasIntakeSpikePanel';
import { isTasSpikeStage } from '@/hooks/useTasIntakeSpike';

beforeEach(() => {
  rpc.mockReset();
  intakeRow = null;
  tgaSummary = { fetched_at: null };
});

describe('isTasSpikeStage', () => {
  it('mounts only for staff on a tas stage', () => {
    expect(isTasSpikeStage('tas', true)).toBe(true);
    expect(isTasSpikeStage('tas', false)).toBe(false);
    expect(isTasSpikeStage('other', true)).toBe(false);
    expect(isTasSpikeStage(null, true)).toBe(false);
  });
});

describe('TasIntakeSpikePanel', () => {
  it('labels an unknown TGA sync time as unknown, never as a date', async () => {
    render(<TasIntakeSpikePanel stageInstanceId={1} tenantId={10} />);
    expect(await screen.findByTestId('tas-source')).toHaveTextContent('last synced: unknown');
  });

  it('shows the real sync date when there is one', async () => {
    tgaSummary = { fetched_at: '2026-10-01T02:03:04Z' };
    render(<TasIntakeSpikePanel stageInstanceId={1} tenantId={10} />);
    expect(await screen.findByTestId('tas-source')).toHaveTextContent('1 Oct 2026');
  });

  it('starts an intake from the chosen scope item with the prefill source', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null });
    render(<TasIntakeSpikePanel stageInstanceId={7} tenantId={10} />);
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'BSB50120' } });
    fireEvent.click(screen.getByRole('button', { name: /start intake/i }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('tas_start_intake', {
      p_stage_instance_id: 7,
      p_qualification_code: 'BSB50120',
      p_cohort_label: '',
      p_prefill: { source: 'tga', fetched_at: null },
    });
  });

  it('saves with the expected row_version and sends an unknown sync time as empty, not now', async () => {
    intakeRow = { id: 'intake-1', status: 'in_progress', row_version: 4, qualification_code: 'BSB50120' };
    rpc.mockResolvedValue({ data: 5, error: null });
    render(<TasIntakeSpikePanel stageInstanceId={7} tenantId={10} />);
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'BSB50120' } });
    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const [fn, args] = rpc.mock.calls[0] as [string, { p_expected_row_version: number; p_answers: Array<{ source_checked_at: string }> }];
    expect(fn).toBe('tas_save_answers');
    expect(args.p_expected_row_version).toBe(4);
    expect(args.p_answers[0].source_checked_at).toBe('');
  });

  it('shows a conflict message when the save is stale (SQLSTATE 40001)', async () => {
    intakeRow = { id: 'intake-1', status: 'in_progress', row_version: 4, qualification_code: 'BSB50120' };
    rpc.mockResolvedValue({ data: null, error: { message: 'Someone else changed this intake; reload and try again', code: '40001' } });
    render(<TasIntakeSpikePanel stageInstanceId={7} tenantId={10} />);
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'BSB50120' } });
    fireEvent.click(screen.getByRole('button', { name: /save answer/i }));
    expect(await screen.findByText(/someone else changed this intake/i)).toBeInTheDocument();
  });
});
