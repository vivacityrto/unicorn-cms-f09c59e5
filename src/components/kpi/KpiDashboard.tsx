import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
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
import { format, parseISO, addDays } from "date-fns";
import {
  type CscSummaryRow,
  type CstSummaryRow,
  type DevSummaryRow,
  type KpiRole,
  useKpiSummary,
} from "@/hooks/useKpiSummary";
import { useAuth } from "@/hooks/useAuth";
import { KpiEmailLogSection } from "@/components/kpi/KpiEmailLogSection";
import { KpiTasksSection } from "@/components/kpi/KpiTasksSection";
import { KpiDeveloperTicketQueue } from "@/components/kpi/KpiDeveloperTicketQueue";
import { RaiseTicketButton } from "@/components/kpi/RaiseTicketSheet";

interface Props {
  subjectUuid: string;
  /** Restrict to a single role's tab; default shows all three. */
  roles?: KpiRole[];
  /** How many weeks of history to render. */
  weeks?: number;
  /** Human label for the selected period (e.g. "This week", "Last 4 weeks"). */
  periodLabel?: string;
  /** When true, hide KpiTasksSection and KpiDeveloperTicketQueue (weekly breakdown still shown). */
  hideSections?: boolean;
}

const ROLE_LABEL: Record<KpiRole, string> = {
  csc: "CSC consulting",
  cst: "CST email & tasks",
  dev: "Dev tickets",
};

function fmtWeekRange(iso: string) {
  try {
    const start = parseISO(iso);
    const end = addDays(start, 6);
    const sameYear = start.getFullYear() === end.getFullYear();
    const startStr = format(start, sameYear ? "dd MMM" : "dd MMM yyyy");
    const endStr = format(end, "dd MMM yyyy");
    return `${startStr} – ${endStr}`;
  } catch {
    return iso;
  }
}


function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const variant =
    status === "green" ? "default" : status === "amber" ? "secondary" : status === "red" ? "destructive" : "outline";
  return <Badge variant={variant as VariantProps<typeof badgeVariants>['variant']} className="capitalize">{status}</Badge>;
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
          <TableHead className="text-right">Emails received</TableHead>
          <TableHead className="text-right">Emails replied ≤12 hrs</TableHead>
          <TableHead className="text-right">SLA %</TableHead>
          <TableHead>Review status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(rows as CscSummaryRow[]).map((r) => (
          <TableRow key={r.period_start}>
            <TableCell>{fmtWeekRange(r.period_start)}</TableCell>
            <TableCell className="text-right">{r.email_total}</TableCell>
            <TableCell className="text-right">{r.email_sla_met}</TableCell>
            <TableCell className="text-right"><PctCell value={r.email_sla_pct} /></TableCell>
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
            <TableCell>{fmtWeekRange(r.period_start)}</TableCell>
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
            <TableCell>{fmtWeekRange(r.period_start)}</TableCell>
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

export function KpiDashboard({ subjectUuid, roles, weeks = 12, periodLabel, hideSections = false }: Props) {
  const enabledRoles = useMemo<KpiRole[]>(() => roles ?? ["csc", "cst", "dev"], [roles]);
  const defaultTab = enabledRoles[0];
  const { profile } = useAuth();
  const isOwnDashboard = profile?.user_uuid === subjectUuid;
  const titleSuffix = periodLabel ?? `last ${weeks} weeks`;
  const showTabs = enabledRoles.length > 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly breakdown · {titleSuffix}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab}>
            {showTabs && (
              <TabsList>
                {enabledRoles.map((r) => (
                  <TabsTrigger key={r} value={r}>{ROLE_LABEL[r]}</TabsTrigger>
                ))}
              </TabsList>
            )}

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

      {!hideSections && isOwnDashboard && profile?.kpi_role === "developer" && (
        <div className="flex justify-end">
          <RaiseTicketButton />
        </div>
      )}
      {!hideSections && isOwnDashboard && profile?.kpi_role === "developer" && <KpiDeveloperTicketQueue />}
      {!hideSections && isOwnDashboard && <KpiTasksSection viewerRole={profile?.kpi_role ?? null} />}
    </div>
  );
}
