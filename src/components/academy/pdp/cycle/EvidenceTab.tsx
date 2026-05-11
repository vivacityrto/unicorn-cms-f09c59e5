import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
  Plus,
  GraduationCap,
  Award,
  BookOpen,
  Users,
  Briefcase,
  ClipboardCheck,
  Mic,
  HeartHandshake,
  AlertCircle,
  CalendarIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEvidence, useGoals } from "@/features/pdp/hooks";
import { AddEvidenceSheet } from "@/components/academy/pdp/AddEvidenceSheet";
import type { PdpEvidenceType } from "@/features/pdp/types";

interface Props {
  cycleId: number;
}

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  academy_completion: { label: "Academy", icon: <GraduationCap className="h-4 w-4" /> },
  academy_certificate: { label: "Academy cert", icon: <Award className="h-4 w-4" /> },
  external_course: { label: "External course", icon: <BookOpen className="h-4 w-4" /> },
  workshop: { label: "Workshop", icon: <Users className="h-4 w-4" /> },
  industry_placement: { label: "Industry placement", icon: <Briefcase className="h-4 w-4" /> },
  validation_activity: { label: "Validation", icon: <ClipboardCheck className="h-4 w-4" /> },
  community_of_practice: { label: "CoP", icon: <Users className="h-4 w-4" /> },
  conference: { label: "Conference", icon: <Mic className="h-4 w-4" /> },
  mentoring: { label: "Mentoring", icon: <HeartHandshake className="h-4 w-4" /> },
  reading: { label: "Reading", icon: <BookOpen className="h-4 w-4" /> },
  audit_response: { label: "Audit response", icon: <AlertCircle className="h-4 w-4" /> },
  other: { label: "Other", icon: <CalendarIcon className="h-4 w-4" /> },
};

export function EvidenceTab({ cycleId }: Props) {
  const { data: evidence, isLoading } = useEvidence(cycleId);
  const { data: goals } = useGoals(cycleId);
  const [addOpen, setAddOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const goalMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of goals ?? []) m.set(g.id, g.title);
    return m;
  }, [goals]);

  const filtered = useMemo(() => {
    return (evidence ?? []).filter((e) => {
      if (typeFilter !== "all" && e.evidence_type !== typeFilter) return false;
      if (from && e.occurred_on && e.occurred_on < from) return false;
      if (to && e.occurred_on && e.occurred_on > to) return false;
      return true;
    });
  }, [evidence, typeFilter, from, to]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-end justify-between">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add evidence
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><Skeleton className="h-32 w-full" /></div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No evidence matches your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Goal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const t = TYPE_META[(e.evidence_type as PdpEvidenceType) ?? "other"] ?? TYPE_META.other;
                  const hours = ((e.duration_minutes ?? 0) / 60).toFixed(1);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">
                        {e.occurred_on ? format(parseISO(e.occurred_on), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 text-sm">
                          {t.icon}
                          {t.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{e.title}</TableCell>
                      <TableCell className="text-right text-sm">{hours}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.goal_id ? goalMap.get(e.goal_id) ?? "—" : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{e.status ?? "logged"}</Badge>
                      </TableCell>
                      <TableCell>
                        {e.verified_at ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddEvidenceSheet open={addOpen} onOpenChange={setAddOpen} cycleId={cycleId} />
    </div>
  );
}
