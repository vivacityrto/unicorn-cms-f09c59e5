/**
 * Read side of the Events registry. Uses the signed-in user's session, so the
 * staff-only RLS on the Teams event tables decides what they can see.
 * Attendance is written only through the set-teams-event-attendance Edge
 * Function (see teamsEventsService.setAttendance).
 */
import { supabase } from '@/integrations/supabase/client';
import {
  buildRegistryEvents,
  type RegistryAttendanceRow,
  type RegistryBatchRow,
  type RegistryEvent,
  type RegistryItemRow,
} from '@/lib/teamsEvents/registry';

const PAGE = 1000;
const MAX_ROWS = 20000;

const ITEM_COLUMNS =
  'graph_event_id, tenant_id, tenant_user_id, tenant_contact_id, normalised_email, first_name, last_name, result_status, inclusion, processed_at, created_at';
const ATTENDANCE_COLUMNS =
  'graph_event_id, normalised_email, tenant_id, tenant_user_id, tenant_contact_id, first_name, last_name, attended, walk_in, updated_at';

export type RegistryItem = RegistryItemRow & { graph_event_id: string };
export type RegistryAttendance = RegistryAttendanceRow & { graph_event_id: string };

export class RegistryLoadError extends Error {
  constructor(message = 'Could not load the Events registry.') {
    super(message);
    this.name = 'RegistryLoadError';
  }
}

/** Pages through a table (PostgREST caps one response at 1000 rows). */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new RegistryLoadError();
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

/** Every webinar registered through Unicorn, with registered/attended counts. */
export async function loadRegistryEvents(): Promise<RegistryEvent[]> {
  const batches = await fetchAll<RegistryBatchRow>((from, to) =>
    supabase
      .from('teams_event_registration_batches')
      .select('graph_event_id, event_display_name, event_start_datetime, created_at')
      .eq('event_type', 'webinar')
      .order('created_at')
      .range(from, to),
  );
  if (batches.length === 0) return [];

  const items = await fetchAll<RegistryItem>((from, to) =>
    supabase
      .from('teams_event_registration_items')
      .select(ITEM_COLUMNS)
      .eq('event_type', 'webinar')
      .in('result_status', ['registered', 'invited'])
      .order('id')
      .range(from, to),
  );
  const attendance = await fetchAll<RegistryAttendance>((from, to) =>
    supabase
      .from('teams_event_attendance')
      .select(ATTENDANCE_COLUMNS)
      .eq('event_type', 'webinar')
      .eq('attended', true)
      .order('id')
      .range(from, to),
  );
  return buildRegistryEvents(batches, items, attendance);
}

/** People and attendance for ONE event, plus the client names to show beside them. */
export async function loadEventParticipants(eventId: string): Promise<{
  items: RegistryItem[];
  attendance: RegistryAttendance[];
  tenantNames: Map<number, string>;
}> {
  const items = await fetchAll<RegistryItem>((from, to) =>
    supabase
      .from('teams_event_registration_items')
      .select(ITEM_COLUMNS)
      .eq('event_type', 'webinar')
      .eq('graph_event_id', eventId)
      .in('result_status', ['registered', 'invited', 'cancelled'])
      .order('id')
      .range(from, to),
  );
  const attendance = await fetchAll<RegistryAttendance>((from, to) =>
    supabase
      .from('teams_event_attendance')
      .select(ATTENDANCE_COLUMNS)
      .eq('event_type', 'webinar')
      .eq('graph_event_id', eventId)
      .order('id')
      .range(from, to),
  );

  const tenantIds = [
    ...new Set([...items.map((i) => i.tenant_id), ...attendance.map((a) => a.tenant_id)].filter((id): id is number => id != null)),
  ];
  const tenantNames = new Map<number, string>();
  for (let i = 0; i < tenantIds.length; i += 200) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name')
      .in('id', tenantIds.slice(i, i + 200));
    if (error) throw new RegistryLoadError();
    for (const row of data ?? []) tenantNames.set(row.id, row.name);
  }
  return { items, attendance, tenantNames };
}
