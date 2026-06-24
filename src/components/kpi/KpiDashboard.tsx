import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import {
  type CscSummaryRow,
  type CstSummaryRow,
  type DevSummaryRow,
  type KpiRole,
  useKpiSummary,
} from "@/hooks/useKpiSummary";
import { useAuth } from "@/hooks/useAuth";
import { KpiEmailLogSection } from "@/components/kpi/KpiEmailLogSection";

interface Props {
  subjectUuid: string;
  /** Restrict to a single role's tab; default shows all three. */
  roles?: KpiRole[];
  /** How many weeks of history to render. */
  weeks?: number;
}

const ROLE_LABEL: Record<KpiRole, string> = {
  csc: "CSC consulting",
  cst: "CST email & tasks",
  dev: "Dev tickets",
};

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const variant =
    status === "green" ? "default" : status === "amber" ? "secondary" : status === "red" ? "destructive" : "outline";
  return <Badge variant={variant as any} className="capitalize">{status}</Badge>;
}

function PctCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const tone = value >= 90 ? "text-emerald-600" : value >= 75 ? "text-amber-600" : "text-rose-600";
  return <span className={tone}>{value.toFixed(0)}%</span>;
}

function CscTable({ subjectUuid, weeks }: { subjectUuid: string; weeks: number }) {
  const { rows, loading, error } = useKpiSummary("csc", subjectUuid, weeks);
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No CSC activity in the last {weeks} weeks.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Week</TableHead>
          <TableHead className="text-right">Entries</TableHead>
          <TableHead className="text-right">Total hrs</TableHead>
          <TableHead className="text-right">Billable hrs</TableHead>
          <TableHead className="text-right">Billable %</TableHead>
          <TableHead>Review</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(rows as CscSummaryRow[]).map((r) => (
          <TableRow key={r.period_start}>
            <TableCell>{fmtDate(r.period_start)}</TableCell>
            <TableCell className="text-right">{r.entry_count}</TableCell>
            <TableCell className="text-right">{(r.total_minutes / 60).toFixed(1)}</TableCell>
            <TableCell className="text-right">{(r.billable_minutes / 60).toFixed(1)}</TableCell>
            <TableCell className="text-right"><PctCell value={r.billable_pct} /></TableCell>
            <TableCell><StatusBadge status={r.review_status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CstTable({ subjectUuid, weeks }: { subjectUuid: string; weeks: number }) {
  const { rows, loading, error } = useKpiSummary("cst", subjectUuid, weeks);
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No CST activity in the last {weeks} weeks.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Week</TableHead>
          <TableHead className="text-right">SLA 1 (general)</TableHead>
          <TableHead className="text-right">SLA 2 (client)</TableHead>
          <TableHead className="text-right">Tasks done / total</TableHead>
          <TableHead className="text-right">Tasks on time</TableHead>
          <TableHead>Review</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(rows as CstSummaryRow[]).map((r) => (
          <TableRow key={r.period_start}>
            <TableCell>{fmtDate(r.period_start)}</TableCell>
            <TableCell className="text-right">
              <PctCell value={r.sla1_pct} />
              <span className="text-muted-foreground text-xs"> ({r.sla1_met}/{r.sla1_total})</span>
            </TableCell>
            <TableCell className="text-right">
              <PctCell value={r.sla2_pct} />
              <span className="text-muted-foreground text-xs"> ({r.sla2_met}/{r.sla2_total})</span>
            </TableCell>
            <TableCell className="text-right">{r.tasks_completed}/{r.tasks_total}</TableCell>
            <TableCell className="text-right">{r.tasks_on_time}</TableCell>
            <TableCell><StatusBadge status={r.review_status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DevTable({ subjectUuid, weeks }: { subjectUuid: string; weeks: number }) {
  const { rows, loading, error } = useKpiSummary("dev", subjectUuid, weeks);
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No dev activity in the last {weeks} weeks.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Week</TableHead>
          <TableHead className="text-right">Opened</TableHead>
          <TableHead className="text-right">Resolved</TableHead>
          <TableHead className="text-right">Reopened</TableHead>
          <TableHead className="text-right">1st resp (min)</TableHead>
          <TableHead className="text-right">Resolution (h)</TableHead>
          <TableHead className="text-right">Milestones (on-time / delivered / total)</TableHead>
          <TableHead>Review</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(rows as DevSummaryRow[]).map((r) => (
          <TableRow key={r.period_start}>
            <TableCell>{fmtDate(r.period_start)}</TableCell>
            <TableCell className="text-right">{r.tickets_opened}</TableCell>
            <TableCell className="text-right">{r.tickets_resolved}</TableCell>
            <TableCell className="text-right">{r.reopen_count}</TableCell>
            <TableCell className="text-right">{r.avg_first_response_minutes ?? "—"}</TableCell>
            <TableCell className="text-right">{r.avg_resolution_hours ?? "—"}</TableCell>
            <TableCell className="text-right">{r.milestones_on_time}/{r.milestones_delivered}/{r.milestones_total}</TableCell>
            <TableCell><StatusBadge status={r.review_status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function KpiDashboard({ subjectUuid, roles, weeks = 12 }: Props) {
  const enabledRoles = useMemo<KpiRole[]>(() => roles ?? ["csc", "cst", "dev"], [roles]);
  const defaultTab = enabledRoles[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">KPI summary · last {weeks} weeks</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {enabledRoles.map((r) => (
              <TabsTrigger key={r} value={r}>{ROLE_LABEL[r]}</TabsTrigger>
            ))}
          </TabsList>
          {enabledRoles.includes("csc") && (
            <TabsContent value="csc" className="mt-4">
              <CscTable subjectUuid={subjectUuid} weeks={weeks} />
            </TabsContent>
          )}
          {enabledRoles.includes("cst") && (
            <TabsContent value="cst" className="mt-4">
              <CstTable subjectUuid={subjectUuid} weeks={weeks} />
            </TabsContent>
          )}
          {enabledRoles.includes("dev") && (
            <TabsContent value="dev" className="mt-4">
              <DevTable subjectUuid={subjectUuid} weeks={weeks} />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
