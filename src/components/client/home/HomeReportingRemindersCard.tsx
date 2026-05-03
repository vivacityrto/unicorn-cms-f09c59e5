import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Calendar,
  Clock,
  ExternalLink,
  Infinity as InfinityIcon,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  useClientReportingReminders,
  type ClientReportingReminder,
  type ReminderStatus,
} from "@/hooks/use-client-reporting-reminders";

type StatusMeta = {
  icon: LucideIcon;
  iconClass: string;
  pillLabel: string;
  pillVariant: "destructive" | "secondary" | "outline";
  pillClass?: string;
};

const STATUS_META: Record<ReminderStatus, StatusMeta> = {
  overdue: {
    icon: AlertTriangle,
    iconClass: "text-red-600",
    pillLabel: "OVERDUE",
    pillVariant: "destructive",
  },
  due_soon: {
    icon: Clock,
    iconClass: "text-amber-600",
    pillLabel: "DUE SOON",
    pillVariant: "outline",
    pillClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  upcoming: {
    icon: Calendar,
    iconClass: "text-slate-500",
    pillLabel: "UPCOMING",
    pillVariant: "outline",
  },
  always_open: {
    icon: InfinityIcon,
    iconClass: "text-muted-foreground",
    pillLabel: "ALWAYS OPEN",
    pillVariant: "secondary",
  },
  no_date: {
    icon: RefreshCw,
    iconClass: "text-muted-foreground",
    pillLabel: "ONGOING",
    pillVariant: "secondary",
  },
};

function partitionDefault(rows: ClientReportingReminder[]) {
  const overdue = rows
    .filter((r) => r.status === "overdue")
    .sort((a, b) => (a.days_until ?? 0) - (b.days_until ?? 0));
  const dueSoon = rows
    .filter((r) => r.status === "due_soon")
    .sort((a, b) => (a.days_until ?? 0) - (b.days_until ?? 0));
  const upcoming = rows
    .filter((r) => r.status === "upcoming")
    .slice(0, 2);
  const alwaysOpen = rows
    .filter((r) => r.status === "always_open")
    .slice(0, 2);
  const visible = [...overdue, ...dueSoon, ...upcoming, ...alwaysOpen];
  const visibleIds = new Set(visible.map((r) => r.obligation_id));
  return { visible, hidden: rows.filter((r) => !visibleIds.has(r.obligation_id)) };
}

function ReminderRow({ row }: { row: ClientReportingReminder }) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;

  let dateLine: string | null = null;
  if (row.status === "overdue" && row.next_date && row.days_until != null) {
    dateLine = `Was due ${format(new Date(row.next_date), "d MMM yyyy")} (${Math.abs(
      row.days_until,
    )} days ago)`;
  } else if (
    (row.status === "due_soon" || row.status === "upcoming") &&
    row.next_date &&
    row.days_until != null
  ) {
    dateLine = `Due ${format(new Date(row.next_date), "d MMM yyyy")} (in ${row.days_until} days)`;
  }

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-b-0">
      <div className="shrink-0 pt-0.5">
        <Icon className={`h-4 w-4 ${meta.iconClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between md:gap-3">
          <h4 className="text-sm font-medium text-foreground md:truncate">
            {row.title}
          </h4>
          <Badge
            variant={meta.pillVariant}
            className={`text-[10px] shrink-0 self-start mt-1 md:mt-0 ${meta.pillClass ?? ""}`}
          >
            {meta.pillLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
          {row.description}
        </p>
        <div className="flex flex-col md:flex-row md:items-center md:gap-2 mt-1.5 text-xs text-muted-foreground">
          {dateLine && <span>{dateLine}</span>}
          {dateLine && (
            <span className="hidden md:inline text-muted-foreground/60">·</span>
          )}
          <a
            href={row.cta_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {row.cta_label}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function HomeReportingRemindersCard() {
  const { data, isLoading, isError } = useClientReportingReminders();
  const [expanded, setExpanded] = useState(false);

  const { visible, hidden } = useMemo(
    () => partitionDefault(data ?? []),
    [data],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-5 w-5 text-purple-600" />
            Reporting reminders
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Your annual compliance calendar.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertDescription>
              Couldn't load reminders right now.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) return null;

  const rows = expanded ? [...visible, ...hidden] : visible;
  const total = data.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-5 w-5 text-purple-600" />
          Reporting reminders
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Your annual compliance calendar.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div>
          {rows.map((r) => (
            <ReminderRow key={r.obligation_id} row={r} />
          ))}
        </div>
        {hidden.length > 0 && (
          <div className="pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-xs"
            >
              {expanded
                ? "Show fewer"
                : `Show all ${total} obligations`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
