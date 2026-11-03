/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import TasIntakePage from '../TasIntakePage';

type Answer = {
  question_id: string;
  prompt: string;
  answer_kind: string;
  answer_state: string;
  value: unknown;
  removed: boolean;
  source: 'prefill' | 'consultant' | 'client';
  source_checked_at: string | null;
  confirmed: boolean;
  flagged: boolean;
  returned: boolean;
};

const answer = (over: Partial<Answer>): Answer => ({
  question_id: 'q1',
  prompt: 'Question one',
  answer_kind: 'text',
  answer_state: 'answered',
  value: 'Alpha',
  removed: false,
  source: 'consultant',
  source_checked_at: null,
  confirmed: false,
  flagged: false,
  returned: false,
  ...over,
});

function summary(answers: Answer[], status = 'in_progress', rowVersion = 3) {
  return {
    intake: { id: 'i1', status, row_version: rowVersion, qualification_code: 'BSB50120', cohort_label: '' },
    version: { version_no: 1, state: 'draft' },
    answers,
    counts: { total: answers.length, confirmed: answers.filter((a) => a.confirmed).length, flagged: answers.filter((a) => a.flagged).length },
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/client/tas/i1']}>
      <Routes>
        <Route path="/client/tas/:intakeId" element={<TasIntakePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rpc.mockReset();
});

describe('TasIntakePage', () => {
  it('shows a plain not-found message when the intake cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Not found' } });
    renderPage();
    expect(await screen.findByText(/can't find that/i)).toBeTruthy();
  });

  it('shows a generic problem for other errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    renderPage();
    expect(await screen.findByText(/something went wrong/i)).toBeTruthy();
  });

  it('shows answers, source line, progress, and keeps Send disabled until all are checked', async () => {
    rpc.mockResolvedValue({
      data: summary([
        answer({ question_id: 'q1', value: 'Alpha' }),
        answer({
          question_id: 'q2',
          prompt: 'Question two',
          value: { code: 'BSB50120', title: 'Diploma' },
          source: 'prefill',
          source_checked_at: '2026-10-01T00:00:00Z',
        }),
      ]),
      error: null,
    });
    renderPage();
    expect(await screen.findByText('Question one')).toBeTruthy();
    expect(screen.getByTestId('tas-value-q1').textContent).toBe('Alpha');
    expect(screen.getByTestId('tas-value-q2').textContent).toBe('BSB50120 Diploma');
    expect(screen.getByText(/training\.gov\.au record, last checked: 1 October 2026/)).toBeTruthy();
    expect(screen.getByTestId('tas-progress').textContent).toBe('0 of 2 answers checked');
    expect((screen.getByRole('button', { name: /send to my consultant/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('confirms one answer with the current row version, then reloads', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'tas_client_confirm_answers') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: summary([answer({})]), error: null });
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /this is right: question one/i }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('tas_client_confirm_answers', {
        p_intake_id: 'i1',
        p_expected_row_version: 3,
        p_decisions: [{ question_id: 'q1', decision: 'confirm' }],
      }),
    );
    await waitFor(() => expect(rpc.mock.calls.filter((c) => c[0] === 'tas_client_get_summary').length).toBe(2));
  });

  it('flags an answer as needing a change', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'tas_client_confirm_answers'
        ? Promise.resolve({ data: null, error: null })
        : Promise.resolve({ data: summary([answer({})]), error: null }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /this needs a change: question one/i }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'tas_client_confirm_answers',
        expect.objectContaining({ p_decisions: [{ question_id: 'q1', decision: 'flag' }] }),
      ),
    );
  });

  it('enables Send when every answer is confirmed or flagged, and submits with an idempotency key', async () => {
    rpc.mockImplementation((fn: string) =>
      fn === 'tas_client_submit'
        ? Promise.resolve({ data: 'v1', error: null })
        : Promise.resolve({
            data: summary([
              answer({ question_id: 'q1', confirmed: true }),
              answer({ question_id: 'q2', prompt: 'Question two', flagged: true }),
            ]),
            error: null,
          }),
    );
    renderPage();
    const send = (await screen.findByRole('button', { name: /send to my consultant/i })) as HTMLButtonElement;
    expect(screen.getByTestId('tas-progress').textContent).toBe('2 of 2 answers checked');
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'tas_client_submit',
        expect.objectContaining({
          p_intake_id: 'i1',
          p_expected_row_version: 3,
          p_idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      ),
    );
  });

  it('does not count removed answers and shows them without a value or buttons', async () => {
    rpc.mockResolvedValue({
      data: summary([
        answer({ question_id: 'q1', confirmed: true }),
        answer({ question_id: 'q2', prompt: 'Question two', removed: true, value: null }),
      ]),
      error: null,
    });
    renderPage();
    expect(await screen.findByText(/removed at your request/i)).toBeTruthy();
    expect(screen.getByTestId('tas-progress').textContent).toBe('1 of 1 answers checked');
    expect(screen.queryByTestId('tas-value-q2')).toBeNull();
    expect(screen.queryByRole('button', { name: /question two/i })).toBeNull();
  });

  it('shows a read-only thank-you once submitted, with no buttons', async () => {
    rpc.mockResolvedValue({ data: summary([answer({ confirmed: true })], 'submitted'), error: null });
    renderPage();
    expect(await screen.findByText(/your consultant has your answers/i)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tells the person to check again when someone else changed the intake', async () => {
    let confirmCalls = 0;
    rpc.mockImplementation((fn: string) => {
      if (fn === 'tas_client_confirm_answers') {
        confirmCalls += 1;
        return Promise.resolve({ data: null, error: { code: '40001', message: 'changed' } });
      }
      return Promise.resolve({ data: summary([answer({})], 'in_progress', confirmCalls ? 4 : 3), error: null });
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /this is right: question one/i }));
    expect(await screen.findByText(/someone else changed this/i)).toBeTruthy();
  });

  it('points a returned answer out to the client', async () => {
    rpc.mockResolvedValue({ data: summary([answer({ returned: true })], 'returned'), error: null });
    renderPage();
    expect(await screen.findByText(/asked you to look at this answer again/i)).toBeTruthy();
  });
});
