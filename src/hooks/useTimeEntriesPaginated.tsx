import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TimeEntry } from '@/hooks/useTimeTracking';

export const TIME_ENTRIES_PAGE_SIZE = 20;

export interface TimeEntriesFilters {
  tenantId: number;
  /** Filter to specific package instances. Matches package_instance_id only -
   *  not the legacy package_id fallback the old client-side filter used, since
   *  every other calculation in this codebase already treats package_instance_id
   *  as the only canonical link (see fn_package_used_minutes' own comment on
   *  this). Rows still missing package_instance_id (legacy data) only show up
   *  under "All packages", not a specific-package filter. */
  packageInstanceIds?: number[];
  workTypeIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

function applyFilters(query: any, filters: TimeEntriesFilters) {
  let q = query.eq('tenant_id', filters.tenantId);
  if (filters.packageInstanceIds && filters.packageInstanceIds.length > 0) {
    q = q.in('package_instance_id', filters.packageInstanceIds);
  }
  if (filters.workTypeIds && filters.workTypeIds.length > 0) {
    q = q.in('work_type', filters.workTypeIds);
  }
  if (filters.dateFrom) {
    const start = new Date(filters.dateFrom);
    start.setHours(0, 0, 0, 0);
    q = q.gte('start_at', start.toISOString());
  }
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    q = q.lte('start_at', end.toISOString());
  }
  return q;
}

/** Server-side filtered + paginated time entries, replacing the old
 *  fetch-100-then-filter-in-the-browser approach - every filter combination
 *  now queries the database directly instead of slicing an already-capped
 *  local array, so "page through everything" actually means everything. */
export function useTimeEntriesPaginated(filters: TimeEntriesFilters, page: number) {
  return useQuery({
    queryKey: ['time-entries-paginated', filters, page],
    queryFn: async () => {
      const query = applyFilters(
        (supabase as any).from('time_entries').select('*', { count: 'exact' }),
        filters
      )
        .order('start_at', { ascending: false })
        .range((page - 1) * TIME_ENTRIES_PAGE_SIZE, (page - 1) * TIME_ENTRIES_PAGE_SIZE + TIME_ENTRIES_PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data || []) as TimeEntry[], count: count || 0 };
    },
    enabled: !!filters.tenantId,
  });
}

const EXPORT_ROW_CAP = 5000;

/** Same filters, no page range - for "export/email everything currently
 *  filtered" rather than just the visible page. Capped (not silently) so a
 *  huge export doesn't hang the browser or the mail client. */
export async function fetchAllMatchingTimeEntries(
  filters: TimeEntriesFilters
): Promise<{ rows: TimeEntry[]; truncated: boolean }> {
  const query = applyFilters(
    (supabase as any).from('time_entries').select('*'),
    filters
  )
    .order('start_at', { ascending: false })
    .limit(EXPORT_ROW_CAP + 1);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as TimeEntry[];
  const truncated = rows.length > EXPORT_ROW_CAP;
  return { rows: truncated ? rows.slice(0, EXPORT_ROW_CAP) : rows, truncated };
}
