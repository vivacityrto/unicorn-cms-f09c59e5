import { useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { SummaryTiles } from "./SummaryTiles";
import { PatternsPanel } from "./PatternsPanel";
import { RecentDraftsTable, type DraftRow } from "./RecentDraftsTable";
import { DraftDrillDown } from "./DraftDrillDown";
import { WINDOW_OPTIONS, type WindowDays } from "./lib";

export default function AiInsightsPage() {
  const { isSuperAdmin, loading } = useAuth();
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [clauseFilter, setClauseFilter] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<DraftRow | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);

  if (loading) return null;
  if (!isSuperAdmin()) return <Navigate to="/" replace />;

  return (
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-[1400px]">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">AI Drafting Insights</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Read AI-drafted findings side-by-side with what the auditor saved. Surfaces the patterns
              that drive the next round of system-prompt tuning. Super Admin only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Window</span>
            <Select
              value={String(windowDays)}
              onValueChange={(v) => setWindowDays(Number(v) as WindowDays)}
            >
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <SummaryTiles windowDays={windowDays} />

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Patterns to investigate</h2>
          <PatternsPanel
            windowDays={windowDays}
            onPickClause={(clause) => setClauseFilter(clause)}
          />
        </section>

        <RecentDraftsTable
          windowDays={windowDays}
          clauseFilter={clauseFilter}
          onClearClauseFilter={() => setClauseFilter(null)}
          onOpenRow={(row) => {
            setOpenRow(row);
            setDrillOpen(true);
          }}
        />

        <DraftDrillDown row={openRow} open={drillOpen} onOpenChange={setDrillOpen} />
      </div>
  );
}
