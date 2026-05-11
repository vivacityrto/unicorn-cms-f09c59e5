import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format, parseISO, startOfToday, subDays, isBefore, isAfter } from "date-fns";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { AcademyLayout } from "@/components/layout/AcademyLayout";
import AcademyPageWrapper from "@/components/academy/AcademyPageWrapper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  useEndCycleReviewSet,
  useManagerCycles,
} from "@/features/pdp/hooks";
import type { ManagerCycle } from "@/features/pdp/api";

function revieweeLabel(c: ManagerCycle): string {
  const u = c.user;
  if (!u) return "Unknown";
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || u.email || "Unknown";
}

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd/MM/yyyy");
  } catch {
    return d;
  }
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  planning: "outline",
  active: "default",
  under_review: "destructive",
  completed: "secondary",
};

interface RowProps {
  cycle: ManagerCycle;
}

function CycleRow({ cycle }: RowProps) {
  return (
    <Link
      to={`/academy/pdp/cycle/${cycle.id}?reviewMode=1`}
      className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 transition hover:bg-accent"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium truncate">{revieweeLabel(cycle)}</p>
          <Badge variant="outline">{cycle.audience_code}</Badge>
          <Badge variant={STATUS_VARIANT[cycle.status] ?? "secondary"}>
            {cycle.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {fmt(cycle.cycle_start_date)} → {fmt(cycle.cycle_end_date)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  cycles: ManagerCycle[];
  emptyText?: string;
}

function Section({ title, description, cycles, emptyText }: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} <span className="text-muted-foreground font-normal">({cycles.length})</span>
        </CardTitle>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {cycles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText ?? "Nothing here yet."}</p>
        ) : (
          <div className="space-y-2">
            {cycles.map((c) => (
              <CycleRow key={c.id} cycle={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AcademyPdpReviewsPage() {
  const { user, loading: authLoading } = useAuth();
  const managerId = user?.id ?? null;
  const { data: cycles, isLoading } = useManagerCycles(managerId);
  const cycleIds = useMemo(() => (cycles ?? []).map((c) => c.id), [cycles]);
  const { data: endCycleSet } = useEndCycleReviewSet(cycleIds);

  const groups = useMemo(() => {
    const today = startOfToday();
    const ninetyAgo = subDays(today, 90);
    const all = cycles ?? [];
    const set = endCycleSet ?? new Set<number>();

    const awaiting: ManagerCycle[] = [];
    const active: ManagerCycle[] = [];
    const recentlyClosed: ManagerCycle[] = [];

    for (const c of all) {
      const end = c.cycle_end_date ? parseISO(c.cycle_end_date) : null;
      const completedAt = c.completed_at ? parseISO(c.completed_at) : null;
      const closeDate = completedAt ?? end;

      const isAwaiting =
        c.status === "under_review" ||
        (end && isBefore(end, today) && c.status !== "completed" && !set.has(c.id));

      if (isAwaiting) {
        awaiting.push(c);
        continue;
      }
      if (c.status === "active") {
        active.push(c);
        continue;
      }
      if (c.status === "completed" && closeDate && isAfter(closeDate, ninetyAgo)) {
        recentlyClosed.push(c);
      }
    }
    return { awaiting, active, recentlyClosed };
  }, [cycles, endCycleSet]);

  const initialLoading = authLoading || isLoading;

  return (
    <AcademyLayout>
      <AcademyPageWrapper
        title="Reviews"
        subtitle="Cycles assigned to you for review."
        icon={<ClipboardCheck className="h-7 w-7" />}
      >
        {!managerId && !authLoading ? (
          <p className="text-sm text-muted-foreground">Sign in to view reviews.</p>
        ) : initialLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <Section
              title="Awaiting review"
              description="Cycles flagged for review or past their end date without an end-of-cycle review."
              cycles={groups.awaiting}
            />
            <Section
              title="Active"
              description="Cycles currently in progress."
              cycles={groups.active}
            />
            <Section
              title="Recently closed"
              description="Completed in the last 90 days."
              cycles={groups.recentlyClosed}
            />
          </div>
        )}
      </AcademyPageWrapper>
    </AcademyLayout>
  );
}
