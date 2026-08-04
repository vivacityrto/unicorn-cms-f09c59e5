/**
 * Portfolio Fact Builder (Phase 6)
 *
 * Distinct from the tenant-scoped fact builder in index.ts — this reads
 * v_dashboard_attention_ranked across every ACTIVE client, not one tenant.
 *
 * Design decision (per plan): every internal staff role sees the whole
 * client base by default, not just their own assigned portfolio.
 * validateTenantAccess already returns true for every Vivacity staff role on
 * every individual tenant — this just extends that same access to the
 * aggregate view rather than requiring one-tenant-at-a-time lookups.
 * assigned_csc_user_id is used to RANK "your clients" first, never to
 * filter the result set.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DerivedFact } from "./types.ts";

// Cap on how many non-own-client rows are surfaced, to keep the facts
// payload within a sane token budget — 58 active clients today, but this
// should stay bounded as the client base grows. The caller's own assigned
// clients are never capped this way; only "the rest of the portfolio" is.
const TOP_OTHER_CLIENTS_LIMIT = 15;

interface AttentionRow {
  tenant_id: number;
  tenant_name: string;
  assigned_csc_user_id: string | null;
  attention_score: number;
  overdue_tasks_count: number;
  days_since_activity: number | null;
  burn_risk_status: string | null;
  days_to_renewal: number | null;
  risk_status: string | null;
  attention_drivers_json: Array<{ driver: string; value: string; impact: number }> | null;
}

export interface PortfolioFactsResult {
  facts: DerivedFact[];
  gaps: string[];
  tenant_ids_touched: number[];
  tables_queried: string[];
}

function summariseRow(r: AttentionRow) {
  return {
    tenant_id: r.tenant_id,
    tenant_name: r.tenant_name,
    attention_score: r.attention_score,
    overdue_tasks_count: r.overdue_tasks_count,
    days_since_activity: r.days_since_activity,
    burn_risk_status: r.burn_risk_status,
    days_to_renewal: r.days_to_renewal,
    risk_status: r.risk_status,
    top_driver: r.attention_drivers_json?.[0]?.driver ?? null,
  };
}

export async function buildPortfolioFacts(
  supabase: SupabaseClient,
  userId: string
): Promise<PortfolioFactsResult> {
  const nowIso = new Date().toISOString();
  const tablesQueried = ["v_dashboard_attention_ranked"];

  const { data, error } = await supabase
    .from("v_dashboard_attention_ranked")
    .select(
      "tenant_id, tenant_name, assigned_csc_user_id, attention_score, overdue_tasks_count, days_since_activity, burn_risk_status, days_to_renewal, risk_status, attention_drivers_json"
    )
    .eq("tenant_status", "active")
    .order("attention_score", { ascending: false });

  if (error || !data) {
    console.error("Portfolio fact builder query failed:", error);
    return {
      facts: [],
      gaps: ["Failed to load portfolio attention data"],
      tenant_ids_touched: [],
      tables_queried: tablesQueried,
    };
  }

  const rows = data as AttentionRow[];
  const myClients = rows.filter(r => r.assigned_csc_user_id === userId);
  const otherClients = rows.filter(r => r.assigned_csc_user_id !== userId);
  const topOther = otherClients.slice(0, TOP_OTHER_CLIENTS_LIMIT);

  const facts: DerivedFact[] = [];
  const gaps: string[] = [];

  facts.push({
    key: "portfolio_summary",
    value: {
      total_active_clients: rows.length,
      my_clients_count: myClients.length,
      total_overdue_tasks: rows.reduce((sum, r) => sum + (r.overdue_tasks_count || 0), 0),
    },
    reason: null,
    source_table: "v_dashboard_attention_ranked",
    source_ids: rows.map(r => r.tenant_id.toString()),
    derived_at: nowIso,
  });

  if (myClients.length > 0) {
    facts.push({
      key: "my_clients_attention",
      value: myClients.map(summariseRow),
      reason: `${myClients.length} clients assigned to you as CSC`,
      source_table: "v_dashboard_attention_ranked",
      source_ids: myClients.map(r => r.tenant_id.toString()),
      derived_at: nowIso,
    });
  } else {
    gaps.push("No clients are currently assigned to you as CSC");
  }

  if (topOther.length > 0) {
    facts.push({
      key: "portfolio_top_attention",
      value: topOther.map(summariseRow),
      reason: `Top ${topOther.length} clients across the rest of the portfolio, ranked by attention score`,
      source_table: "v_dashboard_attention_ranked",
      source_ids: topOther.map(r => r.tenant_id.toString()),
      derived_at: nowIso,
    });
  }

  const shown = myClients.length + topOther.length;
  if (rows.length > shown) {
    gaps.push(
      `${rows.length - shown} additional active client(s) not shown here — narrow to a specific client for full detail`
    );
  }

  return {
    facts,
    gaps,
    tenant_ids_touched: [...myClients, ...topOther].map(r => r.tenant_id),
    tables_queried: tablesQueried,
  };
}
