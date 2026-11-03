import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// The generated Supabase types do not know the tas_* functions yet, so one bounded adapter isolates
// the cast. Replace it with generated types once they are regenerated.
type RpcError = { message: string; code?: string } | null;
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
}
const rpcClient = supabase as unknown as RpcClient;

export interface TasSummaryAnswer {
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
}

export interface TasSummary {
  intake: { id: string; status: string; row_version: number; qualification_code: string; cohort_label: string };
  version: { version_no: number; state: string };
  answers: TasSummaryAnswer[];
  counts: { total: number; confirmed: number; flagged: number };
}

export type TasLoadProblem = 'not_found' | 'conflict' | 'other' | null;

function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** The released summary of one TAS intake, with confirm / flag and submit for the signed-in client. */
export function useTasClientSummary(intakeId: string | undefined) {
  const [summary, setSummary] = useState<TasSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<TasLoadProblem>(null);

  const load = useCallback(async () => {
    if (!intakeId) {
      setProblem('not_found');
      setLoading(false);
      return;
    }
    const { data, error } = await rpcClient.rpc('tas_client_get_summary', { p_intake_id: intakeId });
    if (error) {
      setProblem(error.code === '22023' ? 'not_found' : 'other');
      setSummary(null);
    } else {
      setSummary(data as TasSummary);
      setProblem(null);
    }
    setLoading(false);
  }, [intakeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      setBusy(true);
      const { error } = await rpcClient.rpc(fn, args);
      if (error) {
        // SQLSTATE 40001: someone else changed the intake. Reload and let the person try again.
        setProblem(error.code === '40001' ? 'conflict' : error.code === '22023' ? 'not_found' : 'other');
        await load();
        if (error.code === '40001') setProblem('conflict');
        setBusy(false);
        return false;
      }
      setProblem(null);
      await load();
      setBusy(false);
      return true;
    },
    [load],
  );

  const decide = useCallback(
    (decisions: Array<{ question_id: string; decision: 'confirm' | 'flag' }>) => {
      if (!summary || !intakeId) return Promise.resolve(false);
      return act('tas_client_confirm_answers', {
        p_intake_id: intakeId,
        p_expected_row_version: summary.intake.row_version,
        p_decisions: decisions,
      });
    },
    [act, summary, intakeId],
  );

  const submit = useCallback(() => {
    if (!summary || !intakeId) return Promise.resolve(false);
    return act('tas_client_submit', {
      p_intake_id: intakeId,
      p_expected_row_version: summary.intake.row_version,
      p_idempotency_key: newKey(),
    });
  }, [act, summary, intakeId]);

  return { summary, loading, busy, problem, decide, submit };
}
