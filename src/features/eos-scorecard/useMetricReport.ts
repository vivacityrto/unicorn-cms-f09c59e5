import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCstReport } from '@/features/eos-cst/useCstReport';
import { addDays } from '@/features/eos-scorecard/scorecardView';
import { fetchAllPages } from '@/features/eos-scorecard/paging';
import { useOwnerNames } from '@/features/eos-scorecard/useOwnerNames';
import type { CstClientRow } from '@/features/eos-scorecard/cstBreakdown';
import {
  buildAcademyActivity,
  inSydneyRange,
  weekEndingOf,
  type AcademyActivity,
  type CertificateRow,
  type NeverSignedInPerson,
} from '@/features/eos-scorecard/metricReport';

/**
 * Read-only queries behind the explanations and reports for the automatic client measures. Staff can already read
 * these tables under their own sign-in (row-level security), so nothing here needs a new database object. The tables
 * are reached through a small hand-typed query interface because several are not in the generated types.
 */
interface Result<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface Query<T> extends PromiseLike<Result<T>> {
  eq(column: string, value: string | boolean): Query<T>;
  in(column: string, values: readonly (string | number)[]): Query<T>;
  is(column: string, value: null): Query<T>;
  gte(column: string, value: string): Query<T>;
  lt(column: string, value: string): Query<T>;
  lte(column: string, value: string): Query<T>;
  order(column: string): Query<T>;
  range(from: number, to: number): Query<T>;
}

const read = supabase as unknown as { from(table: string): { select<T>(columns: string): Query<T> } };

async function rows<T>(query: Query<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

const STALE = 5 * 60_000;
const chunk = <T,>(items: readonly T[], size = 150): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/** Runs a lookup over a long list of ids a batch at a time, so no single request is too long. */
export async function inChunks<T>(ids: readonly (string | number)[], run: (part: (string | number)[]) => Query<T>): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids)) out.push(...(await rows(run(part))));
  return out;
}
const fullName = (first: string | null, last: string | null, fallback: string) => `${first ?? ''} ${last ?? ''}`.trim() || fallback;

interface SnapshotRow {
  tenant_id: number;
  week_ending: string;
  csc_user_id: string | null;
  client_users: number;
  active_users_28d: number;
  never_signed_in: number;
  certificates_week: number;
}

/** Eight weeks of per-client rows ending at the week under review, oldest first, keyed by the Sunday that ends each week. */
export function useCstWeekRows(weekKey: string, enabled = true) {
  const { profile } = useAuth();
  const weekEnding = weekEndingOf(weekKey);
  const csc = useOwnerNames();
  const lastActive = useCstReport('days28', undefined);

  const snapshot = useQuery({
    queryKey: ['scorecard-cst-week-rows', weekEnding],
    staleTime: STALE,
    enabled: !!profile && enabled,
    queryFn: async () => {
      const data = await fetchAllPages((from, to) =>
        read
          .from('cst_scorecard_weekly_snapshot')
          .select<SnapshotRow>('tenant_id, week_ending, csc_user_id, client_users, active_users_28d, never_signed_in, certificates_week')
          .gte('week_ending', addDays(weekEnding, -49))
          .lte('week_ending', weekEnding)
          .order('week_ending')
          .order('tenant_id')
          .range(from, to),
      );
      const ids = [...new Set(data.map((r) => r.tenant_id))];
      const names: Record<number, string> = {};
      for (const part of chunk(ids)) {
        for (const t of await rows(read.from('tenants').select<{ id: number; name: string }>('id, name').in('id', part))) names[t.id] = t.name;
      }
      return { data, names };
    },
  });

  const lastActiveByTenant = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const group of lastActive.data?.csc ?? []) for (const r of group.rtos) map.set(r.tenant_id, r.last_active_at ?? null);
    return map;
  }, [lastActive.data]);

  const byWeek = useMemo(() => {
    const result: Record<string, CstClientRow[]> = {};
    for (const r of snapshot.data?.data ?? []) {
      (result[r.week_ending] ??= []).push({
        tenantId: r.tenant_id,
        name: snapshot.data?.names[r.tenant_id] ?? 'A client',
        cscId: r.csc_user_id,
        cscName: r.csc_user_id ? csc[r.csc_user_id] ?? 'Another CSC' : 'No CSC yet',
        clientUsers: r.client_users,
        activeUsers: r.active_users_28d,
        neverSignedIn: r.never_signed_in,
        certificates: r.certificates_week,
        lastActiveAt: lastActive.data ? lastActiveByTenant.get(r.tenant_id) ?? null : undefined,
      });
    }
    return result;
  }, [snapshot.data, csc, lastActive.data, lastActiveByTenant]);

  return { weekEnding, byWeek, current: byWeek[weekEnding] ?? [], isLoading: snapshot.isLoading, error: snapshot.error as Error | null };
}

/** The certificates issued in the week: who earned each one, from which client, for which course. */
export function useCertificateDetail(weekKey: string, tenantIds: readonly number[], enabled = true) {
  const weekEnding = weekEndingOf(weekKey);
  return useCertificatesBetween(addDays(weekEnding, -6), weekEnding, tenantIds, enabled);
}

/** The certificates issued between two Sydney days, inclusive: who earned each one, from which client, for which course. */
export function useCertificatesBetween(from: string, to: string, tenantIds: readonly number[], enabled = true) {
  return useQuery({
    queryKey: ['scorecard-certificate-detail', from, to, tenantIds.length],
    staleTime: STALE,
    enabled: enabled && tenantIds.length > 0,
    queryFn: async (): Promise<CertificateRow[]> => {
      // Wide on purpose; the exact Sydney day is applied below.
      const certs = (
        await fetchAllPages((rangeFrom, rangeTo) =>
          read
            .from('academy_certificates')
            .select<{ id: string; course_id: string; user_id: string; tenant_id: number; issued_at: string; certificate_number: string | null }>('id, course_id, user_id, tenant_id, issued_at, certificate_number')
            .is('revoked_at', null)
            .in('tenant_id', tenantIds)
            .gte('issued_at', `${addDays(from, -1)}T00:00:00Z`)
            .lt('issued_at', `${addDays(to, 2)}T00:00:00Z`)
            .order('issued_at')
            .order('id')
            .range(rangeFrom, rangeTo),
        )
      ).filter((c) => inSydneyRange(c.issued_at, from, to));
      if (certs.length === 0) return [];

      const courseIds = [...new Set(certs.map((c) => c.course_id))];
      const userIds = [...new Set(certs.map((c) => c.user_id))];
      const clientIds = [...new Set(certs.map((c) => c.tenant_id))];
      // A year can have hundreds of recipients, which would overflow the request URL in one go, so each lookup is batched.
      const [courses, users, clients] = await Promise.all([
        inChunks(courseIds, (part) => read.from('academy_courses').select<{ id: string; title: string }>('id, title').in('id', part)),
        inChunks(userIds, (part) => read.from('users').select<{ user_uuid: string; first_name: string | null; last_name: string | null }>('user_uuid, first_name, last_name').in('user_uuid', part)),
        inChunks(clientIds, (part) => read.from('tenants').select<{ id: number; name: string }>('id, name').in('id', part)),
      ]);
      const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
      const person = new Map(users.map((u) => [u.user_uuid, fullName(u.first_name, u.last_name, 'A learner')]));
      const clientName = new Map(clients.map((t) => [t.id, t.name]));
      return certs
        .map((c) => ({
          id: c.id,
          learner: person.get(c.user_id) ?? 'A learner',
          client: clientName.get(c.tenant_id) ?? 'A client',
          course: courseTitle.get(c.course_id) ?? 'A course',
          issuedAt: c.issued_at,
          number: c.certificate_number,
        }))
        .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    },
  });
}

/** Academy activity for the Live Clients over the 28 days ending with the week: enrolments, how, completions and courses. */
export function useAcademyActivity(weekKey: string, tenantIds: readonly number[], enabled = true) {
  const weekEnding = weekEndingOf(weekKey);
  return useAcademyBetween(addDays(weekEnding, -27), weekEnding, tenantIds, enabled);
}

/** Academy activity for the Live Clients between two Sydney days, inclusive: enrolments, how, completions and courses. */
export function useAcademyBetween(from: string, to: string, tenantIds: readonly number[], enabled = true) {
  return useQuery({
    queryKey: ['scorecard-academy-activity', from, to, tenantIds.length],
    staleTime: STALE,
    enabled: enabled && tenantIds.length > 0,
    queryFn: async (): Promise<AcademyActivity> => {
      const wide = { from: `${addDays(from, -1)}T00:00:00Z`, to: `${addDays(to, 2)}T00:00:00Z` };
      type Enrolment = { course_id: string; tenant_id: number; source: string | null; enrolled_at: string | null; completed_at: string | null };
      const columns = 'course_id, tenant_id, source, enrolled_at, completed_at';
      const window = (column: 'enrolled_at' | 'completed_at') =>
        fetchAllPages((rangeFrom, rangeTo) =>
          read
            .from('academy_enrollments')
            .select<Enrolment>(columns)
            .is('revoked_at', null)
            .in('tenant_id', tenantIds)
            .gte(column, wide.from)
            .lt(column, wide.to)
            .order(column)
            .order('id')
            .range(rangeFrom, rangeTo),
        );
      const [enrolledRows, completedRows] = await Promise.all([window('enrolled_at'), window('completed_at')]);
      const enrolled = enrolledRows.filter((e) => inSydneyRange(e.enrolled_at, from, to));
      const completed = completedRows.filter((e) => inSydneyRange(e.completed_at, from, to));
      const courseIds = [...new Set([...enrolled, ...completed].map((e) => e.course_id))];
      const titles: Record<string, string> = {};
      for (const part of chunk(courseIds)) {
        for (const c of await rows(read.from('academy_courses').select<{ id: string; title: string }>('id, title').in('id', part))) titles[c.id] = c.title;
      }
      return buildAcademyActivity(enrolled, completed, titles);
    },
  });
}

/** Invited people at Live Clients who have never signed in, as of today. */
export function useNeverSignedInPeople(tenantIds: readonly number[], enabled = true) {
  return useQuery({
    queryKey: ['scorecard-never-signed-in', tenantIds.length],
    staleTime: STALE,
    enabled: enabled && tenantIds.length > 0,
    queryFn: async (): Promise<NeverSignedInPerson[]> => {
      const users = (
        await fetchAllPages((from, to) =>
          read
            .from('users')
            .select<{ user_uuid: string; first_name: string | null; last_name: string | null; created_at: string | null; archived: boolean | null; is_vivacity_internal: boolean | null }>(
              'user_uuid, first_name, last_name, created_at, archived, is_vivacity_internal',
            )
            .is('last_sign_in_at', null)
            .order('user_uuid')
            .range(from, to),
        )
      ).filter((u) => !u.archived && !u.is_vivacity_internal);
      if (users.length === 0) return [];
      const memberships: { tenant_id: number; user_id: string }[] = [];
      for (const part of chunk(users.map((u) => u.user_uuid))) {
        memberships.push(...(await rows(read.from('tenant_users').select<{ tenant_id: number; user_id: string }>('tenant_id, user_id').in('user_id', part))));
      }
      const live = memberships.filter((m) => tenantIds.includes(m.tenant_id));
      const names: Record<number, string> = {};
      for (const part of chunk([...new Set(live.map((m) => m.tenant_id))])) {
        for (const t of await rows(read.from('tenants').select<{ id: number; name: string }>('id, name').in('id', part))) names[t.id] = t.name;
      }
      const byUser = new Map(users.map((u) => [u.user_uuid, u]));
      return live
        .map((m) => {
          const u = byUser.get(m.user_id)!;
          return { id: `${m.tenant_id}:${m.user_id}`, name: fullName(u.first_name, u.last_name, 'Someone invited'), client: names[m.tenant_id] ?? 'A client', addedOn: u.created_at };
        })
        .sort((a, b) => a.client.localeCompare(b.client) || a.name.localeCompare(b.name));
    },
  });
}
