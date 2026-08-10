import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CurrencyStatus } from "./types";

type ViewRow = Database["public"]["Views"]["v_pdp_user_currency"]["Row"];

export interface WorkforcePdpRow {
  user_id: string;
  tenant_id: number | null;
  audience_code: string | null;
  cycle_year: number | null;
  cycle_end_date: string | null;
  status: string | null;
  percent_complete: number;
  actual_pd_hours: number;
  target_pd_hours: number;
  days_until_cycle_end: number | null;
  currency_status: CurrencyStatus;
  staff_name: string;
  staff_email: string | null;
  tenant_name: string;
}

const ALLOWED_CURRENCY: ReadonlySet<CurrencyStatus> = new Set([
  "current",
  "on_track",
  "at_risk",
  "overdue",
]);

function normaliseCurrency(value: string | null): CurrencyStatus {
  if (value && ALLOWED_CURRENCY.has(value as CurrencyStatus)) {
    return value as CurrencyStatus;
  }
  return "on_track";
}

export async function fetchWorkforcePdp(tenantId?: number | null): Promise<WorkforcePdpRow[]> {
  let query = supabase
    .from("v_pdp_user_currency")
    .select(
      "user_id, tenant_id, audience_code, cycle_year, cycle_end_date, status, percent_complete, actual_pd_hours, target_pd_hours, days_until_cycle_end, currency_status",
    )
    .limit(2000);

  if (tenantId != null) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: viewRows, error: viewErr } = await query;

  if (viewErr) throw viewErr;

  const rows: ViewRow[] = viewRows ?? [];
  if (rows.length >= 2000) {
    // eslint-disable-next-line no-console
    console.warn("[workforce-pdp] fetched >=2000 rows; results may be truncated");
  }

  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const tenantIds = Array.from(
    new Set(rows.map((r) => r.tenant_id).filter((id): id is number => id !== null)),
  );

  const [usersRes, tenantsRes] = await Promise.all([
    userIds.length
      ? supabase
          .from("users")
          .select("user_uuid, first_name, last_name, email")
          .in("user_uuid", userIds)
      : Promise.resolve({ data: [], error: null }),
    tenantIds.length
      ? supabase.from("tenants").select("id, name").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (tenantsRes.error) throw tenantsRes.error;

  const userMap = new Map<string, { first_name: string | null; last_name: string | null; email: string | null }>();
  for (const u of usersRes.data ?? []) {
    if (u.user_uuid) {
      userMap.set(u.user_uuid, {
        first_name: u.first_name ?? null,
        last_name: u.last_name ?? null,
        email: u.email ?? null,
      });
    }
  }

  const tenantMap = new Map<number, string>();
  for (const t of tenantsRes.data ?? []) {
    if (typeof t.id === "number" && t.name) tenantMap.set(t.id, t.name);
  }

  return rows
    .filter((r): r is ViewRow & { user_id: string } => !!r.user_id)
    .map((r) => {
      const u = userMap.get(r.user_id);
      const fullName = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
      const staff_name = fullName || u?.email || "(Unknown user)";
      return {
        user_id: r.user_id,
        tenant_id: r.tenant_id,
        audience_code: r.audience_code,
        cycle_year: r.cycle_year,
        cycle_end_date: r.cycle_end_date,
        status: r.status,
        percent_complete: Number(r.percent_complete ?? 0),
        actual_pd_hours: Number(r.actual_pd_hours ?? 0),
        target_pd_hours: Number(r.target_pd_hours ?? 0),
        days_until_cycle_end: r.days_until_cycle_end,
        currency_status: normaliseCurrency(r.currency_status),
        staff_name,
        staff_email: u?.email ?? null,
        tenant_name: r.tenant_id !== null ? tenantMap.get(r.tenant_id) ?? "(Unknown tenant)" : "(No tenant)",
      };
    });
}
