/**
 * RegulatoryUpdatesPage – client-portal list of regulator change events.
 * Read-only mirror of the SuperAdmin Regulator Change Watch feature.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterPills, SearchBox } from "@/components/client/inbox/InboxParts";
import { ImpactCards, MonthSection, RegulatoryBanner } from "@/components/client/regulatory/RegulatoryParts";
import {
  groupByMonth,
  impactCounts,
  matchesUpdate,
  toUpdateSummary,
  type ImpactLevel,
  type RegulatorChangeEventRow,
} from "@/features/regulatory-updates/regulatoryView";

export default function RegulatoryUpdatesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["client-regulator-change-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulator_change_events")
        .select(`*, regulator_watchlist(name, url, category)`)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RegulatorChangeEventRow[];
    },
  });

  const [impact, setImpact] = useState<ImpactLevel | "all">("all");
  const [regulator, setRegulator] = useState<string>("all");
  const [search, setSearch] = useState("");

  const updates = useMemo(() => (data ?? []).map(toUpdateSummary), [data]);
  const stats = useMemo(() => impactCounts(updates), [updates]);
  const regulators = useMemo(() => Array.from(new Set(updates.map((u) => u.regulator))).sort(), [updates]);
  const shown = useMemo(
    () =>
      updates.filter(
        (u) => (impact === "all" || u.impact === impact) && (regulator === "all" || u.regulator === regulator) && matchesUpdate(u, search),
      ),
    [updates, impact, regulator, search],
  );
  const groups = useMemo(() => groupByMonth(shown), [shown]);
  const urgent = stats.counts.critical + stats.counts.high;

  return (
    <div className="w-full min-w-0 space-y-5">
      <RegulatoryBanner eyebrow="Stay ahead of the regulator" title="Regulatory updates">
        <p className="mt-1 max-w-2xl text-sm text-white/80">Changes to RTO standards, guidance and legislation that may affect you, with how much each one matters.</p>
        {!isLoading && !error && updates.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Summary">
            <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{updates.length} {updates.length === 1 ? "update" : "updates"}</li>
            <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{stats.recent} in the last 30 days</li>
            <li className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{urgent} high or critical</li>
          </ul>
        )}
      </RegulatoryBanner>

      {isLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-xl border bg-card px-6 py-10 text-center">
          <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-destructive" aria-hidden />
          <p className="text-muted-foreground">Couldn't load regulatory updates. Try refreshing.</p>
        </div>
      )}

      {!isLoading && !error && updates.length === 0 && (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <Globe className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-50" aria-hidden />
          <p className="font-medium text-muted-foreground">No regulatory updates yet</p>
          <p className="mt-1 text-sm text-muted-foreground">We'll notify you here when something relevant to your RTO's compliance changes.</p>
        </div>
      )}

      {!isLoading && !error && updates.length > 0 && (
        <>
          <ImpactCards counts={stats.counts} total={stats.total} active={impact} onSelect={setImpact} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-72"><SearchBox value={search} onChange={setSearch} placeholder="Search updates" /></div>
            {regulators.length > 1 && (
              <FilterPills<string>
                label="Filter by regulator"
                value={regulator}
                onChange={setRegulator}
                options={[{ value: "all", label: "All regulators" }, ...regulators.map((r) => ({ value: r, label: r }))]}
              />
            )}
          </div>

          {groups.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">No updates match these filters.</div>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => <MonthSection key={g.label} label={g.label} items={g.items} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
