/**
 * Browser-side client for the Teams event registration Edge Functions.
 *
 * The browser only ever sends an event id, a Contact Directory Group id and
 * the short-lived preview token. It never receives a Graph token, client
 * secret or private key — every privileged call happens server-side.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type TeamsEventType = 'webinar' | 'meeting';

export interface TeamsEventSummary {
  id: string;
  eventType: 'webinar';
  displayName: string;
  status: string;
  startUtc: string;
  endUtc: string | null;
  organiserId: string | null;
  organiserName: string | null;
  /** Plain-text description from Teams; null when there is none. */
  description?: string | null;
  /** Registrant counts from Teams; null when Microsoft would not provide them. */
  registrants?: { registered: number; pending: number; capped: boolean } | null;
  timeZoneAssumed: boolean;
}

export type NotListedReason = 'not_published' | 'starts_after_window' | 'no_start_time';

/** An upcoming webinar Microsoft returned that Unicorn deliberately did not list. */
export interface NotListedWebinar {
  display_name: string;
  status: string;
  start_utc: string | null;
  reason: NotListedReason;
}

/** Why a listing may be empty or shorter than expected. */
export interface WebinarListDiagnostics {
  graph_total: number;
  status_counts: Record<string, number>;
  published_in_window: number;
  published_before_window: number;
  published_after_window: number;
  published_without_start: number;
  earliest_published_start_utc: string | null;
  latest_published_start_utc: string | null;
  not_listed?: NotListedWebinar[];
}

export interface ListEventsResponse {
  events: TeamsEventSummary[];
  diagnostics?: WebinarListDiagnostics;
  window: { from: string; to: string };
  fetched_at: string;
}

/** Event-only changes, as directory keys (`user:12`, `contact:5`) — never names, emails or counts. */
export interface EventChangeKeys {
  /** People added for this event without joining the Group. */
  extraKeys: string[];
  /** Group members left out of this event only. */
  skippedKeys: string[];
}

const noChangeKeys: EventChangeKeys = { extraKeys: [], skippedKeys: [] };

export interface PreviewPerson {
  member_key: string;
  source: 'user' | 'contact';
  tenant_id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  /** "extra" = added for this event only; otherwise they came from the Group. */
  inclusion?: 'group' | 'extra';
  reason?: string | null;
  duplicate_of?: string | null;
}

export interface PreviewResponse {
  event: TeamsEventSummary;
  group: { id: number; name: string };
  counts: {
    members: number;
    eligible: number;
    to_register: number;
    already_processed: number;
    excluded: number;
    duplicate: number;
    /** Added for this event only (included in to_register). */
    extras?: number;
    /** Group members skipped for this event only. */
    skipped?: number;
    /** Extras whose record no longer exists. */
    extras_missing?: number;
  };
  to_register: PreviewPerson[];
  already_processed: PreviewPerson[];
  excluded: PreviewPerson[];
  duplicates: PreviewPerson[];
  list_cap: number;
  questions_check: 'ok' | 'blocked' | 'unverified';
  required_questions: string[];
  blocked: boolean;
  preview_token: string;
  expires_in_seconds: number;
}

export type ItemResultStatus =
  | 'pending'
  | 'registered'
  | 'invited'
  | 'already_processed'
  | 'excluded'
  | 'duplicate'
  | 'failed';

export type BatchStatus =
  | 'previewed'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

export interface BatchItem {
  id: string;
  result_status: ItemResultStatus;
  normalised_email: string | null;
  first_name: string | null;
  last_name: string | null;
  tenant_id: number;
  exclusion_reason: string | null;
  inclusion?: 'group' | 'extra';
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
}

export interface BatchDetail {
  batch: {
    id: string;
    event_type: TeamsEventType;
    graph_event_id: string;
    event_display_name: string;
    event_start_datetime: string;
    group_id: number | null;
    group_name: string;
    eligible_count: number;
    submitted_count: number;
    success_count: number;
    skipped_count: number;
    failure_count: number;
    status: BatchStatus;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  };
  counts: Record<ItemResultStatus, number>;
  items: BatchItem[];
  items_truncated: boolean;
  stalled: boolean;
  can_retry: boolean;
}

export interface StartBatchResponse {
  batch_id: string;
  status: BatchStatus;
}

export interface RetryResponse extends StartBatchResponse {
  retried: number;
  message?: string;
}

/** A failure from an Edge Function, with the server's stable error code. */
export class TeamsEventsError extends Error {
  code: string;
  status: number | null;
  batchId: string | null;

  constructor(message: string, code = 'unknown', status: number | null = null, batchId: string | null = null) {
    super(message);
    this.name = 'TeamsEventsError';
    this.code = code;
    this.status = status;
    this.batchId = batchId;
  }
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data as T;

  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    let parsed: { error?: string; code?: string; batch_id?: string } | null = null;
    try {
      parsed = await error.context.json();
    } catch {
      // Non-JSON body: fall through to the generic message.
    }
    throw new TeamsEventsError(
      parsed?.error ?? 'The request failed. Please try again.',
      parsed?.code ?? 'unknown',
      status,
      parsed?.batch_id ?? null,
    );
  }
  throw new TeamsEventsError('Could not reach the server. Check your connection and try again.', 'network');
}

export const teamsEventsService = {
  listEvents: (eventType: TeamsEventType = 'webinar') =>
    invoke<ListEventsResponse>('list-teams-events', { event_type: eventType }),

  previewGroup: (eventId: string, groupId: number, changes: EventChangeKeys = noChangeKeys) =>
    invoke<PreviewResponse>('preview-teams-event-group', {
      event_type: 'webinar',
      event_id: eventId,
      group_id: groupId,
      extra_member_keys: changes.extraKeys,
      skipped_member_keys: changes.skippedKeys,
    }),

  registerGroup: (eventId: string, groupId: number, previewToken: string, changes: EventChangeKeys = noChangeKeys) =>
    invoke<StartBatchResponse>('register-teams-webinar-group', {
      event_id: eventId,
      group_id: groupId,
      preview_token: previewToken,
      extra_member_keys: changes.extraKeys,
      skipped_member_keys: changes.skippedKeys,
    }),

  getBatch: (batchId: string, include: 'problems' | 'all' = 'problems') =>
    invoke<BatchDetail>('get-teams-event-batch', { batch_id: batchId, include }),

  retryFailures: (batchId: string) => invoke<RetryResponse>('retry-teams-event-failures', { batch_id: batchId }),
};
