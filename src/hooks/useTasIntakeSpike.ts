import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// SPIKE (QA only, never merged): the generated Supabase types do not know the tas_* tables or RPCs,
// so one bounded adapter isolates the cast. Replace with generated types when the schema is real.
type SpikeError = { message: string; code?: string } | null;
type SpikeResult = { data: unknown; error: SpikeError };
interface SpikeQuery extends PromiseLike<SpikeResult> {
  eq(column: string, value: string | number): SpikeQuery;
  order(column: string, opts: { ascending: boolean }): SpikeQuery;
  limit(count: number): SpikeQuery;
  maybeSingle(): PromiseLike<SpikeResult>;
}
interface SpikeClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<SpikeResult>;
  from(table: string): { select(columns: string): SpikeQuery };
}
const db = supabase as unknown as SpikeClient;

export const TAS_SPIKE_STAGE_KEY = 'tas';
export const TAS_Q1 = 'tas.product.qualification.v1';

/** The panel mounts only for staff on a stage whose template key is 'tas'. */
export function isTasSpikeStage(stageKey: string | null | undefined, isStaff: boolean): boolean {
  return isStaff && stageKey === TAS_SPIKE_STAGE_KEY;
}

export interface TasIntakeRow {
  id: string;
  status: 'in_progress' | 'submitted';
  row_version: number;
  qualification_code: string;
}

export interface TasAnswerRow {
  value: { code?: string; title?: string | null } | null;
  answer_state: string;
  source_type: string;
  source_ref: string | null;
  source_checked_at: string | null;
}

export interface TasSpikeState {
  loading: boolean;
  intake: TasIntakeRow | null;
  answer: TasAnswerRow | null;
  error: string | null;
  conflict: boolean;
  busy: boolean;
}

export function useStageKey(stageId: number | null | undefined): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    if (stageId == null) return;
    let cancelled = false;
    void (async () => {
      const { data } = await db.from('stages').select('stage_key').eq('id', stageId).maybeSingle();
      if (!cancelled) setKey((data as { stage_key?: string | null } | null)?.stage_key ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [stageId]);
  return key;
}

export function useTasIntakeSpike(stageInstanceId: number) {
  const [state, setState] = useState<TasSpikeState>({
    loading: true, intake: null, answer: null, error: null, conflict: false, busy: false,
  });

  const load = useCallback(async () => {
    const { data: intake, error } = await db
      .from('tas_intake')
      .select('id,status,row_version,qualification_code')
      .eq('stage_instance_id', stageInstanceId)
      .maybeSingle();
    if (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }));
      return;
    }
    const row = (intake as TasIntakeRow | null) ?? null;
    let answer: TasAnswerRow | null = null;
    if (row) {
      const { data: ver } = await db
        .from('tas_intake_version')
        .select('id')
        .eq('intake_id', row.id)
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      const versionId = (ver as { id?: string } | null)?.id;
      if (versionId) {
        const { data: ans } = await db
          .from('tas_answer')
          .select('value,answer_state,source_type,source_ref,source_checked_at')
          .eq('version_id', versionId)
          .eq('question_id', TAS_Q1)
          .maybeSingle();
        answer = (ans as TasAnswerRow | null) ?? null;
      }
    }
    // Keep any conflict or error message: a reload after a stale save must not wipe it.
    setState((s) => ({ ...s, loading: false, intake: row, answer }));
  }, [stageInstanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (call: () => PromiseLike<SpikeResult>) => {
      setState((s) => ({ ...s, busy: true, error: null, conflict: false }));
      const { error } = await call();
      if (error) {
        // SQLSTATE 40001 is the stale row_version conflict raised by tas_save_answers / tas_submit.
        setState((s) => ({ ...s, busy: false, error: error.message, conflict: error.code === '40001' }));
        if (error.code === '40001') await load();
        return false;
      }
      await load();
      setState((s) => ({ ...s, busy: false }));
      return true;
    },
    [load],
  );

  const start = useCallback(
    (qualificationCode: string, prefill: Record<string, unknown>) =>
      run(() => db.rpc('tas_start_intake', { p_stage_instance_id: stageInstanceId, p_qualification_code: qualificationCode, p_cohort_label: '', p_prefill: prefill })),
    [run, stageInstanceId],
  );

  const save = useCallback(
    (answer: { code: string; title: string | null; sourceCheckedAt: string | null }) =>
      run(() =>
        db.rpc('tas_save_answers', {
          p_intake_id: state.intake?.id,
          p_expected_row_version: state.intake?.row_version,
          p_answers: [{
            question_id: TAS_Q1,
            answer_state: 'answered',
            value: { code: answer.code, title: answer.title },
            source_type: 'prefill_tga',
            source_ref: 'tga:tenant_rto_scope',
            // Unknown stays unknown: an empty string becomes NULL in the RPC, never "now".
            source_checked_at: answer.sourceCheckedAt ?? '',
          }],
        }),
      ),
    [run, state.intake],
  );

  const submit = useCallback(
    () =>
      run(() =>
        db.rpc('tas_submit', {
          p_intake_id: state.intake?.id,
          p_expected_row_version: state.intake?.row_version,
          p_idempotency_key: crypto.randomUUID(),
        }),
      ),
    [run, state.intake],
  );

  return { ...state, start, save, submit };
}
